#!/usr/bin/env node
// 04b_bridge.mjs — S-NPP ↔ NOAA-20 / NOAA-21 bridge factors (province × calendar month), fitted on the 2023–2025 overlap.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Why: the harmonized series (and the 2012–2025 calibration) is in S-NPP counts, but S-NPP stopped on 2026-11-01.
// From then on the live series comes from NOAA-20 and NOAA-21 (same VIIRS instrument, 375 m, same 13:30 orbit plane
// but ~50 min apart). Their detection counts are close to S-NPP but not identical; this script measures the ratio
//     g_sat[prov] = Σ_{m,y} N_sat[prov,m,y] / Σ_{m,y} N_snpp[prov,m,y]   (ratio of sums over all months, shrunk to country, k = 20)
// so that any NOAA-20/21 count can be expressed in S-NPP-equivalent units: N_snpp_eq = N_sat / g_sat.
// The factor is ANNUAL per province (same instrument, same orbit plane: no physical reason for a seasonal cycle), and it is
// fitted on PAIRED DAYS only: days on which both satellites report at least one hotspot over Argentina. Short outages of one
// satellite (S-NPP 10–15 and 24–28 Jul 2024; NOAA-20 19–22 Jul 2023, measured) would otherwise leak into the ratio.
// Monthly ratios are kept as a diagnostic only.
// Same filters as the MODIS/VIIRS fit (type==0, confidence != l) and the same static-source mask (vegetation class only);
// the static class ratio is reported separately. Also cross-checks the API S-NPP SP data against the FIRMS country archive.
//
// Output: data/factors/bridge.json, bridge.csv

import { createReadStream } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provinceOf } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
import { existsSync } from 'node:fs';
const K = 20, K_MIN = 5, YEARS = [2023, 2024, 2025];
const SATS = ['SNPP', 'NOAA20', 'NOAA21'].filter(s => YEARS.every(y => existsSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'data', 'raw', `viirs-sp_${s}_${y}_Argentina.csv`))));
if (!SATS.includes('SNPP') || SATS.length < 2) throw new Error('need S-NPP and at least one of NOAA20/NOAA21 for all years');
const S = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), 'utf8'));
const CEL = S.rule.cell_deg, staticSet = new Set(Object.keys(S.cells));
const sKey = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);

async function scan(sat, y, onRow) {
  const rl = readline.createInterface({ input: createReadStream(path.join(RAW, `viirs-sp_${sat}_${y}_Argentina.csv`)) });
  let cols = null;
  for await (const line of rl) {
    const f = line.split(',');
    if (!cols) { cols = Object.fromEntries(f.map((c, i) => [c, i])); continue; }
    if (f.length < 10) continue;
    if (cols.type !== undefined && f[cols.type] !== '0') continue;
    if (f[cols.confidence] === 'l') continue;
    onRow(+f[cols.latitude], +f[cols.longitude], f[cols.acq_date]);
  }
}
// pass 1: daily country totals per satellite → paired days (every satellite in SATS has ≥ 1 hotspot that day)
const daily = {};
for (const sat of SATS) { daily[sat] = {}; for (const y of YEARS) await scan(sat, y, (la, lo, d) => { daily[sat][d] = (daily[sat][d] || 0) + 1; }); }
const allDays = new Set(Object.values(daily).flatMap(d => Object.keys(d)));
const paired = new Set([...allDays].filter(d => SATS.every(s => daily[s][d] > 0)));
const gaps = {}; for (const s of SATS) gaps[s] = [...allDays].filter(d => !daily[s][d] && SATS.some(o => daily[o][d] > 0)).sort();
process.stderr.write(`days: ${allDays.size} total, ${paired.size} paired; missing per sat: ${SATS.map(s => s + ' ' + gaps[s].length).join(', ')}\n`);

// pass 2: counts on paired days only. counts[sat][prov][m] = {year: n} (vegetation) ; cstat[sat][m] (static class)
const counts = {}, cstat = {}, monthlyCountry = {};
for (const sat of SATS) {
  counts[sat] = {}; cstat[sat] = Array(13).fill(0); monthlyCountry[sat] = {};
  for (const y of YEARS) {
    let n = 0;
    await scan(sat, y, (lat, lon, d) => {
      if (!paired.has(d)) return;
      const m = +d.slice(5, 7);
      if (staticSet.has(sKey(lat, lon))) { cstat[sat][m]++; return; }
      const prov = provinceOf(lat, lon); if (!prov) return;
      const P = (counts[sat][prov] ??= Array.from({ length: 13 }, () => ({})));
      P[m][y] = (P[m][y] || 0) + 1; n++;
      const k = `${y}-${String(m).padStart(2, '0')}`; monthlyCountry[sat][k] = (monthlyCountry[sat][k] || 0) + 1;
    });
    process.stderr.write(`${sat} ${y}: ${n} vegetation hotspots on paired days\n`);
  }
}

// cross-check: S-NPP via API (all days, vegetation, in provinces) vs S-NPP country archive (counts.json V by year-month)
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const archive = {}, apiAll = {};
for (const yrs of Object.values(agg.cells)) for (const y of YEARS) if (yrs[y]) for (const [m, r] of Object.entries(yrs[y])) { const k = `${y}-${String(m).padStart(2, '0')}`; archive[k] = (archive[k] || 0) + r[0]; }
for (const y of YEARS) await scan('SNPP', y, (lat, lon, d) => { if (staticSet.has(sKey(lat, lon)) || !provinceOf(lat, lon)) return; const k = d.slice(0, 7); apiAll[k] = (apiAll[k] || 0) + 1; });
const xc = Object.keys(archive).sort().map(k => ({ k, archive: archive[k], api: apiAll[k] || 0 }));
const xcMaxDev = Math.max(...xc.map(r => Math.abs(r.api - r.archive) / r.archive));

// fit g per sat
const sd = xs => { if (xs.length < 2) return null; const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1)); };
const out = { meta: { K, K_MIN, years: YEARS, fitted_on: 'VIIRS SP area API, Argentina bbox, vegetation class (static cells excluded), paired days only', days_total: allDays.size, days_paired: paired.size, missing_days: gaps, generated: new Date().toISOString() }, crosscheck_snpp_api_vs_archive: { max_rel_dev: +xcMaxDev.toFixed(4), months: xc }, sats: {} };
let csv = 'sat,prov,g,sigma_month,w,n_sat,n_snpp\n';
for (const sat of SATS.filter(s => s !== 'SNPP')) {
  const provs = new Set([...Object.keys(counts.SNPP), ...Object.keys(counts[sat])]);
  // country
  const cN = Array(13).fill(0), cS = Array(13).fill(0), cLogs = Array.from({ length: 13 }, () => []);
  for (const p of provs) for (let m = 1; m <= 12; m++) for (const y of YEARS) { const a = counts[sat][p]?.[m]?.[y] || 0, b = counts.SNPP[p]?.[m]?.[y] || 0; cN[m] += a; cS[m] += b; }
  for (let m = 1; m <= 12; m++) for (const y of YEARS) { let a = 0, b = 0; for (const p of provs) { a += counts[sat][p]?.[m]?.[y] || 0; b += counts.SNPP[p]?.[m]?.[y] || 0; } if (b > 0) cLogs[m].push(Math.log((a + 0.5) / (b + 0.5))); }
  const gC = [], sC = [];
  for (let m = 1; m <= 12; m++) { gC[m] = Math.log((cN[m] + 0.5) / (cS[m] + 0.5)); sC[m] = sd(cLogs[m]) ?? 0.1; }
  // annual country factor and its spread across the 36 months (log ratio of monthly sums)
  const totN = cN.reduce((a, b) => a + b, 0), totS = cS.reduce((a, b) => a + b, 0), gAnnual = Math.log((totN + 0.5) / (totS + 0.5));
  const monthLogs = []; for (let m = 1; m <= 12; m++) monthLogs.push(...cLogs[m]);
  const sAnnual = sd(monthLogs) ?? 0.1;
  const res = { country: { g: +Math.exp(gAnnual).toFixed(4), sigma_month: +sAnnual.toFixed(4), n_sat: totN, n_snpp: totS }, country_monthly_diagnostic: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, g: +Math.exp(gC[i + 1]).toFixed(4), sigma: +sC[i + 1].toFixed(4), n_sat: cN[i + 1], n_snpp: cS[i + 1] })), prov: {}, static_ratio_country: +(cstat[sat].reduce((a, b) => a + b, 0) / cstat.SNPP.reduce((a, b) => a + b, 0)).toFixed(3) };
  for (const p of provs) {
    let a = 0, b = 0, neff = 0; const logs = [];
    for (let m = 1; m <= 12; m++) for (const y of YEARS) { const x = counts[sat][p]?.[m]?.[y] || 0, z = counts.SNPP[p]?.[m]?.[y] || 0; a += x; b += z; neff += Math.min(z, 200); if (z > 0) logs.push(Math.log((x + 0.5) / (z + 0.5))); }
    const lr = b >= K_MIN ? Math.log((a + 0.5) / (b + 0.5)) : null, w = lr === null ? 0 : neff / (neff + K);
    const lg = w * (lr ?? 0) + (1 - w) * gAnnual, sp = sd(logs), sg = Math.sqrt(w * (sp ?? sAnnual) ** 2 + (1 - w) * sAnnual ** 2);
    res.prov[p] = { g: +Math.exp(lg).toFixed(4), sigma_month: +sg.toFixed(4), w: +w.toFixed(3), n_sat: a, n_snpp: b };
    csv += `${sat},"${p}",${Math.exp(lg).toFixed(4)},${sg.toFixed(4)},${w.toFixed(3)},${a},${b}\n`;
  }
  out.sats[sat] = res;
}
await mkdir(path.join(ROOT, 'data', 'factors'), { recursive: true });
await writeFile(path.join(ROOT, 'data', 'factors', 'bridge.json'), JSON.stringify(out));
await writeFile(path.join(ROOT, 'data', 'factors', 'bridge.csv'), csv);

const fmt = x => x.toFixed(2).padStart(6);
console.log(`cross-check S-NPP API vs country archive (vegetation, ${YEARS.join('/')}): max monthly rel. deviation ${(100 * xcMaxDev).toFixed(2)} %`);
for (const sat of SATS.filter(s => s !== 'SNPP')) {
  const r = out.sats[sat];
  console.log(`\n${sat}/S-NPP country g (annual) = ${r.country.g}  σ across months ${r.country.sigma_month}  (n ${r.country.n_sat} / ${r.country.n_snpp})   static class ${r.static_ratio_country}`);
  console.log(`  monthly diagnostic:  ` + r.country_monthly_diagnostic.map(x => fmt(x.g)).join(''));
  const top = Object.entries(r.prov).sort((a, b) => b[1].n_snpp - a[1].n_snpp).slice(0, 14);
  console.log('  provinces (g, w): ' + top.map(([p, x]) => `${p.split(',')[0].slice(0, 12)} ${x.g.toFixed(2)}/${x.w.toFixed(2)}`).join(' · '));
}
