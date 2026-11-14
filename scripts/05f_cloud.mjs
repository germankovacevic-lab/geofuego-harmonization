#!/usr/bin/env node
// 05f_cloud.mjs — Does cloud cover explain (a) the residuals of the MODIS→VIIRS prediction and (b) low-count months?
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Cloud data: ERA5 monthly cloud fraction by overpass (03c_cloud_cells.py): terra (~10:30), day13 (~13:30 Aqua/VIIRS), night.
// Anomalies: tcc − cell climatology of that calendar month (2000–2025).
// Test A (ratio): out-of-sample LOYO residual r = log(V/P) per province-month vs ΔA = anomaly(day13) − anomaly(terra).
//   If afternoon cloud hides more from Aqua/VIIRS than morning cloud from Terra, r should fall with ΔA (slope γ < 0).
// Test B (level): observed VIIRS count vs the cell's own month climatology (2012–2023), by anomaly bin of day13 cloud:
//   log(V / V_clim) should fall with the cloud anomaly if obscuration matters. Also for MODIS (T+A) vs terra/day13 cloud.
// Output: data/validation/cloud_tests.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFactors } from '../lib/factors.js';
import { readJsonMaybeGz } from '../lib/io.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const CL = readJsonMaybeGz(path.join(ROOT, 'data', 'agg', 'cloud_cells.json'));
if (!CL) { console.error('05f_cloud: data/agg/cloud_cells.json(.gz) not found (run 01d + 03c or restore the versioned .gz)'); process.exit(1); }
const YEARS = []; for (let y = 2012; y <= 2023; y++) YEARS.push(y);
const anom = (cell, y, m, k) => { const r = CL.cells[cell]?.[y]?.[m - 1], c = CL.clim[cell]?.[m - 1]; return r && c && r[k] != null ? r[k] - c[k] : null; }; // k: 0 terra, 1 day13, 2 night
const pearson = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return { r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx, n }; };
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const BINS = [-1, -0.15, -0.08, -0.03, 0.03, 0.08, 0.15, 1];
const binTable = (pairs) => BINS.slice(0, -1).map((lo, i) => { const sel = pairs.filter(p => p.x >= lo && p.x < BINS[i + 1]); return { anomaly_from: lo, anomaly_to: BINS[i + 1], n: sel.length, median_log_ratio: sel.length ? +median(sel.map(p => p.y)).toFixed(3) : null }; });

// ---- Test A: LOYO residuals (province-month, V >= 30) vs differential cloud anomaly ----
const pairsA = [], pairsA_abs = [];
for (const yStar of YEARS) {
  const fit = fitFactors(agg.cells, provOf, { K: 10, CAP: 200, years: YEARS.filter(y => y !== yStar) });
  const pu = new Map(); // prov -> month -> {V,P,dA:[sum,w], dT:[sum,w]}
  for (const [cid, yrs] of Object.entries(agg.cells)) {
    const cell = +cid, prov = provOf.get(cell); const ym = yrs[yStar]; if (!ym || !prov) continue; const fc = fit.cell.TA[cell]; if (!fc) continue;
    for (const [m, r] of Object.entries(ym)) { const V = r[6] ?? 0, M = (r[7] ?? 0) + (r[8] ?? 0); if (!M) continue; const P = fc[m - 1][0] * M; const a1 = anom(cell, yStar, +m, 1), a0 = anom(cell, yStar, +m, 0); if (a1 === null || a0 === null) continue;
      const u = ((pu.get(prov) ?? pu.set(prov, {}).get(prov))[m] ??= { V: 0, P: 0, dA: 0, tA: 0, w: 0 }); u.V += V; u.P += P; u.dA += (a1 - a0) * M; u.tA += a1 * M; u.w += M; }
  }
  for (const months of pu.values()) for (const u of Object.values(months)) if (u.V >= 30 && u.P > 0) { pairsA.push({ x: u.dA / u.w, y: Math.log(u.V / u.P) }); pairsA_abs.push({ x: u.tA / u.w, y: Math.log(u.V / u.P) }); }
}
const A = { differential_anomaly: { ...pearson(pairsA.map(p => p.x), pairsA.map(p => p.y)), bins: binTable(pairsA) }, day13_anomaly: { ...pearson(pairsA_abs.map(p => p.x), pairsA_abs.map(p => p.y)), bins: binTable(pairsA_abs) } };

// ---- Test B: observed counts vs cell-month climatology, by cloud anomaly (province level, 2012–2023 VIIRS; 2003–2023 MODIS) ----
function levelTest(valueOf, years, k) {
  const clim = {}; // prov|m -> [sum, n]
  const rows = []; // per prov-year-month {V, anomaly weighted}
  const pv = {};
  for (const [cid, yrs] of Object.entries(agg.cells)) { const cell = +cid, prov = provOf.get(cell); if (!prov) continue; for (const y of years) { const ym = yrs[y]; if (!ym) continue; for (const [m, r] of Object.entries(ym)) { const v = valueOf(r); const a = anom(cell, y, +m, k); if (a === null) continue; const u = ((pv[prov] ??= {})[`${y}-${m}`] ??= { V: 0, aw: 0, w: 0, m: +m }); u.V += v; u.aw += a * Math.max(1, v); u.w += Math.max(1, v); } } }
  for (const [prov, months] of Object.entries(pv)) { const c = {}; for (const u of Object.values(months)) { (c[u.m] ??= []).push(u.V); } for (const u of Object.values(months)) { const arr = c[u.m]; const mean = arr.reduce((a, b) => a + b, 0) / arr.length; if (mean >= 30 && u.V > 0) rows.push({ x: u.aw / u.w, y: Math.log(u.V / mean) }); } }
  return { ...pearson(rows.map(p => p.x), rows.map(p => p.y)), bins: binTable(rows) };
}
const YM = []; for (let y = 2003; y <= 2023; y++) YM.push(y);
const B = { viirs_vs_day13_cloud: levelTest(r => r[0], YEARS, 1), viirs_vs_night_cloud: levelTest(r => r[0], YEARS, 2), modis_TA_vs_day13_cloud: levelTest(r => r[1] + r[2], YM, 1), modis_T_vs_terra_cloud: levelTest(r => r[1], YM, 0) };

// ---- Test C: separate obscuration from rain-suppressed fire. Province-month log(V/clim) regressed on BOTH the cloud
// anomaly at the overpass and the precipitation anomaly (ERA5 tp, mm/day, relative to the cell-month climatology).
// The cloud coefficient conditional on precipitation approximates the pure obscuration effect. OLS with 2 covariates.
let C = null;
try {
  const PR = readJsonMaybeGz(path.join(ROOT, 'data', 'agg', 'precip_cells.json')); if (!PR) throw new Error('precip_cells.json(.gz) not found');
  const panom = (cell, y, m) => { const r = PR.cells[cell]?.[y]?.[m - 1], c = PR.clim[cell]?.[m - 1]; return r != null && c != null ? r - c : null; };
  const ols2 = rows => { // y = b0 + b1 x1 + b2 x2
    const n = rows.length; let X = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Xy = [0, 0, 0];
    for (const r of rows) { const x = [1, r.x1, r.x2]; for (let i = 0; i < 3; i++) { Xy[i] += x[i] * r.y; for (let j = 0; j < 3; j++) X[i][j] += x[i] * x[j]; } }
    // solve 3x3 by Cramer
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(X); const col = (k) => det(X.map((row, i) => row.map((v, j) => j === k ? Xy[i] : v)));
    const b = [col(0) / D, col(1) / D, col(2) / D];
    let ss = 0, st = 0; const my = rows.reduce((a, r) => a + r.y, 0) / n; for (const r of rows) { const f = b[0] + b[1] * r.x1 + b[2] * r.x2; ss += (r.y - f) ** 2; st += (r.y - my) ** 2; }
    return { n, intercept: +b[0].toFixed(3), slope_cloud: +b[1].toFixed(2), slope_precip_per_mm_day: +b[2].toFixed(3), r2: +(1 - ss / st).toFixed(3) };
  };
  function levelTest2(valueOf, years, k) {
    const pv = {}; const rows = [];
    for (const [cid, yrs] of Object.entries(agg.cells)) { const cell = +cid, prov = provOf.get(cell); if (!prov) continue; for (const y of years) { const ym = yrs[y]; if (!ym) continue; for (const [m, r] of Object.entries(ym)) { const v = valueOf(r); const a = anom(cell, y, +m, k), p = panom(cell, y, +m); if (a === null || p === null) continue; const w = Math.max(1, v); const u = ((pv[prov] ??= {})[`${y}-${m}`] ??= { V: 0, aw: 0, pw: 0, w: 0, m: +m }); u.V += v; u.aw += a * w; u.pw += p * w; u.w += w; } } }
    for (const months of Object.values(pv)) { const c = {}; for (const u of Object.values(months)) (c[u.m] ??= []).push(u.V); for (const u of Object.values(months)) { const arr = c[u.m]; const mean = arr.reduce((a, b) => a + b, 0) / arr.length; if (mean >= 30 && u.V > 0) rows.push({ x1: u.aw / u.w, x2: u.pw / u.w, y: Math.log(u.V / mean) }); } }
    const r1 = pearson(rows.map(r => r.x1), rows.map(r => r.y)), r2 = pearson(rows.map(r => r.x2), rows.map(r => r.y)), rx = pearson(rows.map(r => r.x1), rows.map(r => r.x2));
    return { cloud_only: { r: +r1.r.toFixed(3), slope: +r1.slope.toFixed(2) }, precip_only: { r: +r2.r.toFixed(3), slope_per_mm_day: +r2.slope.toFixed(3) }, cloud_vs_precip_r: +rx.r.toFixed(3), joint: ols2(rows) };
  }
  C = { viirs_day13: levelTest2(r => r[0], YEARS, 1), modis_TA_day13: levelTest2(r => r[1] + r[2], YM, 1), modis_T_terra: levelTest2(r => r[1], YM, 0) };
} catch (e) { C = { skipped: e.message }; }

await mkdir(path.join(ROOT, 'data', 'validation'), { recursive: true });
await writeFile(path.join(ROOT, 'data', 'validation', 'cloud_tests.json'), JSON.stringify({ generated: new Date().toISOString(), source: CL.source, testA_ratio_residual_vs_cloud: A, testB_count_level_vs_cloud: B, testC_cloud_conditional_on_precip: C }, null, 1));
const show = (name, t) => { console.log(`${name}: r = ${t.r.toFixed(3)}, slope (log per unit cloud fraction) = ${t.slope.toFixed(2)}, n = ${t.n}`); console.log('   anomaly bin → median log ratio: ' + t.bins.map(b => `[${b.anomaly_from},${b.anomaly_to}) ${b.median_log_ratio === null ? '-' : b.median_log_ratio} (n${b.n})`).join('  ')); };
console.log('TEST A — LOYO residual log(V/P), province-month, vs cloud anomaly');
show('  differential (day13 − terra)', A.differential_anomaly); show('  day13 absolute', A.day13_anomaly);
console.log('\nTEST B — observed count vs province-month climatology, log(V/clim), vs cloud anomaly at the overpass');
show('  VIIRS vs day13 cloud', B.viirs_vs_day13_cloud); show('  VIIRS vs night cloud', B.viirs_vs_night_cloud); show('  MODIS T+A vs day13 cloud', B.modis_TA_vs_day13_cloud); show('  MODIS Terra vs terra cloud', B.modis_T_vs_terra_cloud);
if (C && !C.skipped) { console.log('\nTEST C — cloud effect conditional on precipitation (province-month OLS: log(V/clim) ~ cloud anomaly + precip anomaly)'); for (const [k, v] of Object.entries(C)) console.log(`  ${k.padEnd(16)} cloud-only slope ${v.cloud_only.slope} (r ${v.cloud_only.r}) · precip-only slope ${v.precip_only.slope_per_mm_day}/mm/d (r ${v.precip_only.r}) · corr(cloud,precip) ${v.cloud_vs_precip_r} → joint: cloud ${v.joint.slope_cloud}, precip ${v.joint.slope_precip_per_mm_day}, R² ${v.joint.r2}, n ${v.joint.n}`); } else if (C) console.log('\nTEST C skipped: ' + C.skipped);
