#!/usr/bin/env node
// 05b_external_validation.mjs — Validate the harmonized series against an INDEPENDENT product: MODIS burned area (MCD64A1),
// monthly by province, 2002–2025, as published by GWIS/JRC (country.profile downloads; derived from NASA MCD64A1 C6.1).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Test: burned area per hotspot (ha / VIIRS-equivalent hotspot) should be CONTINUOUS across the 2012 sensor change if the
// harmonization is right. With raw MODIS counts it must jump by ≈ the VIIRS/MODIS ratio (~3.5×). We report, per region:
//   - ha per hotspot, median 2002–2011 vs 2012–2025, for the NAIVE concatenation (raw MODIS T+A before 2012, VIIRS after:
//     what a user gets without harmonization) and for HARMONIZED H → "discontinuity ratio" (1.0 = continuous)
//   - the same ratio for ha per raw MODIS hotspot using MODIS on BOTH sides (MODIS runs to 2025): this isolates genuine
//     changes of burned area per detection (fire regime, product) from the sensor change; harmonized should track it
//   - Pearson r (log) and Spearman ρ between annual H and annual burned area, all years / reconstructed years only
// Burned area is not the same physical quantity as hotspot counts (fire size, land cover), so r < 1 is expected; the point is
// that the reconstructed years behave like the observed years.
// Output: data/validation/external_mcd64a1.json, external_mcd64a1_annual.csv

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'validation');
await mkdir(OUT, { recursive: true });

// --- GWIS MCD64A1: Argentina rows → BA[region][year][month] (ha, all land covers) ---
const gwis = (await readFile(path.join(ROOT, 'data', 'external', 'gwis', 'MCD64A1_burned_area_ARG_2002_2025.csv'), 'utf8')).split('\n');
const NAME = { 'Ciudad de Buenos Aires': 'Ciudad Autónoma de Buenos Aires', 'Tierra del Fuego': 'Tierra del Fuego, Antártida e Islas del Atlántico Sur', 'Santiago del Estero': 'Santiago del Estero' };
const BA = {}; const gadmNames = new Set();
for (const line of gwis.slice(1)) {
  if (!line.startsWith('20') || !line.includes(',ARG,')) continue;
  const f = line.replace(/"/g, '').split(',');
  const [y, m, , , , region] = f; const ha = f.slice(6).reduce((a, b) => a + (+b || 0), 0);
  const p = NAME[region] || region; gadmNames.add(region);
  ((BA[p] ??= {})[+y] ??= Array(13).fill(0))[+m] += ha;
  ((BA.Argentina ??= {})[+y] ??= Array(13).fill(0))[+m] += ha;
}

// --- our series: harmonized H per region×year×month, and RAW MODIS (T+A) and VIIRS per province×year from counts.json ---
const prov = (await readFile(path.join(ROOT, 'data', 'harmonized', 'harmonized_provinces.csv'), 'utf8')).split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('region'));
const H = {};
for (const line of prov) { const m = line.match(/^"([^"]+)",(\d+),(\d+),(\d+),([\d.]+)/); if (!m) continue; const [, p, , y, mo, h] = m; ((H[p] ??= {})[+y] ??= Array(13).fill(0))[+mo] += +h; }
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const RAW = {}; // region -> year -> { M: T+A, V }
for (const [cid, yrs] of Object.entries(agg.cells)) { const p = provOf.get(+cid); if (!p) continue; for (const [y, ms] of Object.entries(yrs)) for (const r of Object.values(ms)) { for (const key of [p, 'Argentina']) { const o = ((RAW[key] ??= {})[+y] ??= { M: 0, V: 0 }); o.M += r[1] + r[2]; o.V += r[0]; } } }

const YEARS = []; for (let y = 2002; y <= 2025; y++) YEARS.push(y);
const PRE = YEARS.filter(y => y <= 2011), POST = YEARS.filter(y => y >= 2012);
const sum = a => a.reduce((x, y) => x + y, 0);
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
const pearson = (xs, ys) => { const n = xs.length, mx = sum(xs) / n, my = sum(ys) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const rank = a => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = Array(a.length); idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
const spearman = (xs, ys) => pearson(rank(xs), rank(ys));

const regions = ['Argentina', ...Object.keys(H).filter(p => p !== 'Argentina' && BA[p]).sort((a, b) => sum(YEARS.map(y => BA[b][y] ? sum(BA[b][y]) : 0)) - sum(YEARS.map(y => BA[a][y] ? sum(BA[a][y]) : 0)))];
const results = []; let csv = 'region,year,burned_area_ha,H_harmonized,naive_concat,raw_modis_TA,viirs_V,ha_per_H,ha_per_naive,ha_per_rawM\n';
for (const p of regions) {
  const ba = YEARS.map(y => BA[p]?.[y] ? sum(BA[p][y]) : 0), h = YEARS.map(y => H[p]?.[y] ? sum(H[p][y]) : 0), M = YEARS.map(y => RAW[p]?.[y]?.M || 0), V = YEARS.map(y => RAW[p]?.[y]?.V || 0);
  const N = YEARS.map((y, i) => y <= 2011 ? M[i] : V[i]); // naive concatenation
  YEARS.forEach((y, i) => { csv += `"${p}",${y},${ba[i].toFixed(0)},${h[i].toFixed(0)},${N[i]},${M[i]},${V[i]},${h[i] ? (ba[i] / h[i]).toFixed(3) : ''},${N[i] ? (ba[i] / N[i]).toFixed(3) : ''},${M[i] ? (ba[i] / M[i]).toFixed(3) : ''}\n`; });
  const haH = i => ba[i] / h[i], haM = i => ba[i] / M[i], haN = i => ba[i] / N[i];
  const ok = i => ba[i] > 0 && h[i] > 0 && M[i] > 0;
  const preI = YEARS.map((y, i) => i).filter(i => y(i) <= 2011 && ok(i)), postI = YEARS.map((y, i) => i).filter(i => y(i) >= 2012 && ok(i));
  function y(i) { return YEARS[i]; }
  if (preI.length < 5 || postI.length < 5) continue;
  const medHpre = median(preI.map(haH)), medHpost = median(postI.map(haH)), medMpre = median(preI.map(haM)), medMpost = median(postI.map(haM)), medNpre = median(preI.map(haN)), medNpost = median(postI.map(haN));
  const allI = [...preI, ...postI];
  const r = {
    region: p, n_years: allI.length,
    ha_per_hotspot: { harmonized: { pre2012: +medHpre.toFixed(2), post2012: +medHpost.toFixed(2), ratio_pre_over_post: +(medHpre / medHpost).toFixed(3) }, naive_concat: { pre2012: +medNpre.toFixed(2), post2012: +medNpost.toFixed(2), ratio_pre_over_post: +(medNpre / medNpost).toFixed(3) }, raw_modis_both_sides: { pre2012: +medMpre.toFixed(2), post2012: +medMpost.toFixed(2), ratio_pre_over_post: +(medMpre / medMpost).toFixed(3) } },
    correlation_annual: { pearson_log_all: +pearson(allI.map(i => Math.log(h[i])), allI.map(i => Math.log(ba[i]))).toFixed(3), spearman_all: +spearman(allI.map(i => h[i]), allI.map(i => ba[i])).toFixed(3), pearson_log_pre2012: +pearson(preI.map(i => Math.log(h[i])), preI.map(i => Math.log(ba[i]))).toFixed(3), pearson_log_post2012: +pearson(postI.map(i => Math.log(h[i])), postI.map(i => Math.log(ba[i]))).toFixed(3) },
  };
  results.push(r);
}
await writeFile(path.join(OUT, 'external_mcd64a1_annual.csv'), csv);
await writeFile(path.join(OUT, 'external_mcd64a1.json'), JSON.stringify({ generated: new Date().toISOString(), source: 'GWIS/JRC MCD64A1_burned_area_full_dataset_2002_2025.csv (sha256 of zip 279a356d…6349f8), ha summed over land-cover classes', gadm_regions_seen: [...gadmNames], years: YEARS, results }, null, 1));

console.log('ha per hotspot, median of years (pre = 2002–2011 reconstructed from MODIS · post = 2012–2025 observed VIIRS)');
console.log('region                 | HARMONIZED pre/post | NAIVE (MODIS→VIIRS) pre/post | MODIS-both-sides pre/post | r(log) all  pre  post | ρ all');
for (const r of results) {
  const a = r.ha_per_hotspot.harmonized, n = r.ha_per_hotspot.naive_concat, b = r.ha_per_hotspot.raw_modis_both_sides, c = r.correlation_annual;
  console.log(`${r.region.split(',')[0].slice(0, 22).padEnd(22)} |  ${a.ratio_pre_over_post.toFixed(2).padStart(5)} (${a.pre2012}/${a.post2012})`.padEnd(45) + `| ${n.ratio_pre_over_post.toFixed(2).padStart(5)}`.padEnd(32) + `| ${b.ratio_pre_over_post.toFixed(2).padStart(5)}`.padEnd(28) + `| ${c.pearson_log_all.toFixed(2)}  ${c.pearson_log_pre2012.toFixed(2)}  ${c.pearson_log_post2012.toFixed(2)} | ${c.spearman_all.toFixed(2)}`);
}
console.log('\nGADM regions seen for ARG:', [...gadmNames].join(' · '));
