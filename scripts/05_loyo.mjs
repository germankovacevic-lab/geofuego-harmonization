#!/usr/bin/env node
// 05_loyo.mjs — Leave-one-year-out validation of the harmonization factors, with a k/cap sweep and a naive-scalar baseline.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// For each held-out year y* in the overlap: fit factors (TA set) on the other years, predict VIIRS-equivalent counts
// from MODIS (f · (T+A)) for y*, compare with observed VIIRS V at three levels (country, province, cell).
// Metrics per level: MAPE of the fire season (Jul–Nov) total per unit; median |rel. error| of monthly values;
// annual predicted/observed ratio. Baseline: a single national scalar fitted on the training years (ratio of sums, all months).
//
// Usage: node scripts/05_loyo.mjs [--sweep]   (sweep = k∈{10,20,50} × cap∈{100,200,500}; default = k=20, cap=200 only)
// Output: data/validation/loyo_folds.csv (per year × config × level), data/validation/loyo_summary.csv, loyo_summary.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFactors } from '../lib/factors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'validation');
await mkdir(OUT, { recursive: true });
const SWEEP = process.argv.includes('--sweep');
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const YEARS = []; for (let y = 2012; y <= 2025; y++) YEARS.push(y);
const SEASON = [7, 8, 9, 10, 11];
const configs = SWEEP ? [10, 20, 50].flatMap(K => [100, 200, 500].map(CAP => ({ K, CAP }))) : [{ K: 20, CAP: 200 }];

const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

function evaluate(fit, scalar, yStar) {
  // observed and predicted per unit (cell / prov / country) per month for year yStar
  const units = { cell: new Map(), prov: new Map(), country: new Map([['AR', { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) }]]) };
  for (const [cid, yrs] of Object.entries(agg.cells)) {
    const cell = +cid, prov = provOf.get(cell); if (!prov) continue;
    const ym = yrs[yStar]; if (!ym) continue;
    const fc = fit.cell.TA[cell]; if (!fc) continue;
    if (!units.cell.has(cell)) units.cell.set(cell, { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) });
    if (!units.prov.has(prov)) units.prov.set(prov, { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) });
    for (const [m, r] of Object.entries(ym)) {
      const V = r[0], M = r[1] + r[2], P = fc[m - 1][0] * M, S = scalar * M;
      for (const u of [units.cell.get(cell), units.prov.get(prov), units.country.get('AR')]) { u.V[m] += V; u.P[m] += P; u.S[m] += S; }
    }
  }
  const res = {};
  for (const [level, map] of Object.entries(units)) {
    const ape = [], apeS = [], monthly = [], monthlyS = []; let sumV = 0, sumP = 0, sumS = 0;
    for (const u of map.values()) {
      const sV = SEASON.reduce((a, m) => a + u.V[m], 0), sP = SEASON.reduce((a, m) => a + u.P[m], 0), sS = SEASON.reduce((a, m) => a + u.S[m], 0);
      if (sV >= (level === 'cell' ? 20 : 50)) { ape.push(Math.abs(sP - sV) / sV); apeS.push(Math.abs(sS - sV) / sV); }
      for (let m = 1; m <= 12; m++) if (u.V[m] >= (level === 'cell' ? 10 : 30)) { monthly.push(Math.abs(u.P[m] - u.V[m]) / u.V[m]); monthlyS.push(Math.abs(u.S[m] - u.V[m]) / u.V[m]); }
      sumV += u.V.reduce((a, b) => a + b, 0); sumP += u.P.reduce((a, b) => a + b, 0); sumS += u.S.reduce((a, b) => a + b, 0);
    }
    res[level] = { n_units: ape.length, season_mape: ape.length ? ape.reduce((a, b) => a + b, 0) / ape.length : null, season_mape_scalar: apeS.length ? apeS.reduce((a, b) => a + b, 0) / apeS.length : null,
      monthly_median_ape: median(monthly), monthly_median_ape_scalar: median(monthlyS), annual_ratio: sumP / sumV, annual_ratio_scalar: sumS / sumV };
  }
  return res;
}

const folds = []; const t0 = Date.now();
for (const cfg of configs) {
  for (const yStar of YEARS) {
    const train = YEARS.filter(y => y !== yStar);
    const fit = fitFactors(agg.cells, provOf, { K: cfg.K, CAP: cfg.CAP, years: train });
    // naive scalar: national ratio of sums over all months of the training years
    let sV = 0, sM = 0; for (const c of fit.country.TA) { sV += c.V; sM += c.M; }
    const scalar = sV / sM;
    const ev = evaluate(fit, scalar, yStar);
    for (const [level, r] of Object.entries(ev)) folds.push({ K: cfg.K, CAP: cfg.CAP, year: yStar, level, scalar: +scalar.toFixed(3), ...r });
  }
  process.stderr.write(`k=${cfg.K} cap=${cfg.CAP} done ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
// summary: mean over folds per config × level
const summary = [];
for (const cfg of configs) for (const level of ['country', 'prov', 'cell']) {
  const rows = folds.filter(r => r.K === cfg.K && r.CAP === cfg.CAP && r.level === level);
  const mean = k => rows.reduce((a, r) => a + (r[k] ?? 0), 0) / rows.length;
  summary.push({ K: cfg.K, CAP: cfg.CAP, level, season_mape: +mean('season_mape').toFixed(4), season_mape_scalar: +mean('season_mape_scalar').toFixed(4), monthly_median_ape: +mean('monthly_median_ape').toFixed(4), monthly_median_ape_scalar: +mean('monthly_median_ape_scalar').toFixed(4), annual_ratio_min: +Math.min(...rows.map(r => r.annual_ratio)).toFixed(3), annual_ratio_max: +Math.max(...rows.map(r => r.annual_ratio)).toFixed(3) });
}
const toCsv = rows => Object.keys(rows[0]).join(',') + '\n' + rows.map(r => Object.values(r).map(v => v === null ? '' : v).join(',')).join('\n') + '\n';
await writeFile(path.join(OUT, 'loyo_folds.csv'), toCsv(folds));
await writeFile(path.join(OUT, 'loyo_summary.csv'), toCsv(summary));
await writeFile(path.join(OUT, 'loyo_summary.json'), JSON.stringify({ generated: new Date().toISOString(), years: YEARS, season: SEASON, configs, summary, folds }, null, 1));

const pct = x => (100 * x).toFixed(1).padStart(5) + '%';
console.log(`LOYO ${YEARS.length} folds · season Jul–Nov · ${configs.length} config(s)\n`);
console.log('K   CAP  level     season MAPE  (scalar)   monthly med|err| (scalar)   annual pred/obs range');
for (const s of summary) console.log(`${String(s.K).padEnd(3)} ${String(s.CAP).padEnd(4)} ${s.level.padEnd(8)}  ${pct(s.season_mape)}  (${pct(s.season_mape_scalar)})   ${pct(s.monthly_median_ape)}  (${pct(s.monthly_median_ape_scalar)})     ${s.annual_ratio_min}–${s.annual_ratio_max}`);
if (!SWEEP) { console.log('\nper-year (k=20, cap=200), province level: year  seasonMAPE  scalar  annual pred/obs');
  for (const r of folds.filter(r => r.level === 'prov')) console.log(`  ${r.year}  ${pct(r.season_mape)}  ${pct(r.season_mape_scalar)}  ${r.annual_ratio.toFixed(3)}`); }
