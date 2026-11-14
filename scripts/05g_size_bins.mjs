#!/usr/bin/env node
// 05g_size_bins.mjs — Prediction-interval bins by SIZE CLASS of the aggregate (peer review round 4, §3.1 / R3).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Problem found by round 4: the shipped rule ("any aggregate of 2+ cells uses the province/country residual bins") covered
// only 65–76 % of out-of-sample months for user-drawn areas of 4–100 cells, because the residual distribution of a small
// block is neither that of one cell nor that of a province. Here the signed residual log(V/P) is measured on random
// contiguous blocks of s×s cells (s = 2, 3, 5, 7, 10, 15) in every LOYO fold, conditioning only on the prediction (P >= 1),
// and the bins by predicted count are fitted per fire-regime region × size class:
//   size classes by the number of land cells actually inside the area: 1 | 2–9 | 10–49 | 50–199 | 200+
//   class 1 = the cell-level residuals of 05_loyo; 200+ = the aggregate bins of 05_loyo (province + country residuals,
//   the right population for large areas: blocks of 15×15 cells cover it less well out of time); provinces use the class of
//   their own cell count. Fallback chain: region|class → national|class → national agg (05_loyo) → pooled.
// Tests (both out of sample for the band): (a) leave-one-year-out on the block residuals (quantiles from 11 years, coverage
// on the 12th); (b) forward: factors from the full 2012–2023 window, new blocks drawn on 2024 and 2025, coverage with the
// final bins — for three rules: shipped (variant D: agg bins), cell bins (reviewer's suggestion), size-class bins (this).
// Provinces are evaluated in the forward test with the same three rules.
// Output: adds `by_region_size`, `size_classes` and `size_class_test` to data/validation/band_calibration.json;
//         data/validation/size_bins_test.json (full tables).

import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFactors } from '../lib/factors.js';
import { GRID } from '../lib/geo.js';
import { REGION_OF } from '../lib/regions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'validation');
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const BC = JSON.parse(await readFile(path.join(OUT, 'band_calibration.json'), 'utf8'));
const YEARS = []; for (let y = 2012; y <= 2023; y++) YEARS.push(y);
const FORWARD = [2024, 2025];
const SIZES = [2, 3, 5, 7, 10, 15], SAMPLES = 500, MIN_BIN = 30;
const BINS = [1, 5, 15, 40, 100, 300, 1000, 3000, 1e12];
const binOf = P => { for (let i = 0; i < BINS.length - 1; i++) if (P < BINS[i + 1]) return i; return BINS.length - 2; };
export const SIZE_CLASSES = [{ name: '1', min: 1, max: 1 }, { name: '2-9', min: 2, max: 9 }, { name: '10-49', min: 10, max: 49 }, { name: '50-199', min: 50, max: 199 }, { name: '200+', min: 200, max: 1e9 }];
export const sizeClassOf = n => SIZE_CLASSES.find(c => n >= c.min && n <= c.max).name;
const REGIONS = [...new Set(Object.values(REGION_OF))];
let seed = 20261114; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const quant = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };
const SETDEF = { TA: r => (r[7] ?? 0) + (r[8] ?? 0), T: r => r[7] ?? 0 };

/** per-cell observed V and predicted P (paired days) for one year under one fit */
function cellSeries(fit, set, y) {
  const cellV = new Map(), cellP = new Map();
  for (const [cid, yrs] of Object.entries(agg.cells)) {
    const fc = fit.cell[set][+cid]; if (!fc) continue; const ym = yrs[y]; if (!ym) continue;
    const V = Array(13).fill(0), P = Array(13).fill(0);
    for (let m = 1; m <= 12; m++) { const r = ym[m]; V[m] = r ? (r[6] ?? 0) : 0; const M = r ? SETDEF[set](r) : 0; P[m] = M > 0 ? fc[m - 1][0] * M : 0; }
    cellV.set(+cid, V); cellP.set(+cid, P);
  }
  return { cellV, cellP };
}
/** draw random blocks; push residual records { P, r, y, n, reg, cls } for months with P >= 1 */
function drawBlocks(cellV, cellP, y, recs, sizes = SIZES, samples = SAMPLES) {
  for (const s of sizes) {
    let drawn = 0, tries = 0;
    while (drawn < samples && tries < samples * 30) {
      tries++;
      const r0 = Math.floor(rnd() * (GRID.nRows - s)), c0 = Math.floor(rnd() * (GRID.nCols - s));
      const V = Array(13).fill(0), P = Array(13).fill(0); let n = 0; const provCount = {};
      for (let r = r0; r < r0 + s; r++) for (let c = c0; c < c0 + s; c++) { const id = r * GRID.nCols + c; const v = cellV.get(id); if (!v) continue; n++; const p = cellP.get(id); const pv = provOf.get(id); if (pv) provCount[pv] = (provCount[pv] || 0) + 1; for (let m = 1; m <= 12; m++) { V[m] += v[m]; P[m] += p[m]; } }
      if (n < 2) continue;
      drawn++;
      const domProv = Object.entries(provCount).sort((a, b) => b[1] - a[1])[0]?.[0]; const reg = REGION_OF[domProv] || null;
      for (let m = 1; m <= 12; m++) if (P[m] >= 1) recs.push({ P: P[m], r: Math.log((V[m] + 0.5) / (P[m] + 0.5)), y, n, reg, cls: sizeClassOf(n) });
    }
  }
}
/** province aggregates for a year: records with cls by the province's cell count */
function provRecs(cellV, cellP, y, recs) {
  const acc = {};
  for (const [id, v] of cellV) { const pv = provOf.get(id); if (!pv) continue; const o = (acc[pv] ??= { V: Array(13).fill(0), P: Array(13).fill(0), n: 0 }); o.n++; const p = cellP.get(id); for (let m = 1; m <= 12; m++) { o.V[m] += v[m]; o.P[m] += p[m]; } }
  for (const [pv, o] of Object.entries(acc)) for (let m = 1; m <= 12; m++) if (o.P[m] >= 1) recs.push({ P: o.P[m], r: Math.log((o.V[m] + 0.5) / (o.P[m] + 0.5)), y, n: o.n, reg: REGION_OF[pv] || null, cls: sizeClassOf(o.n), prov: pv, level: 'prov' });
}
const fitBins = recs => { const out = Array(BINS.length - 1).fill(null); for (let i = 0; i < BINS.length - 1; i++) { const rs = recs.filter(x => binOf(x.P) === i).map(x => x.r); if (rs.length < MIN_BIN) continue; out[i] = { P_min: BINS[i], P_max: BINS[i + 1] === 1e12 ? null : BINS[i + 1], n: rs.length, p10_log: +quant(rs, 0.1).toFixed(4), p50_log: +quant(rs, 0.5).toFixed(4), p90_log: +quant(rs, 0.9).toFixed(4) }; } return out; };
const inside = (x, b) => b ? (x.r >= b.p10_log && x.r <= b.p90_log ? 1 : 0) : null;
const pct = x => x === null || x === undefined ? '   - ' : (100 * x).toFixed(1).padStart(5) + '%';

const output = { generated: new Date().toISOString(), size_classes: SIZE_CLASSES, sizes_drawn: SIZES, samples_per_fold_per_size: SAMPLES, min_bin: MIN_BIN, sets: {} };
for (const set of ['TA', 'T']) {
  // ---- block residuals, LOYO ----
  seed = 20261114;
  const blocks = [];
  for (const yStar of YEARS) {
    const fit = fitFactors(agg.cells, provOf, { K: 10, CAP: 200, years: YEARS.filter(y => y !== yStar) });
    const { cellV, cellP } = cellSeries(fit, set, yStar);
    drawBlocks(cellV, cellP, yStar, blocks);
    process.stderr.write(`${set} fold ${yStar}: ${blocks.length} block-month residuals\n`);
  }
  // cell-level (class 1) and country residuals come from 05_loyo's bins (already by region/class); here we fit classes 2-9 … 200+
  const fitSize = recs => { const out = {}; for (const c of SIZE_CLASSES.slice(1)) { out[`national|${c.name}`] = fitBins(recs.filter(x => x.cls === c.name)); for (const reg of REGIONS) out[`${reg}|${c.name}`] = fitBins(recs.filter(x => x.cls === c.name && x.reg === reg)); } return out; };
  const D = BC.band[set].by_region_class; // shipped bins: [region|national][cell|agg]
  const pickD = (x, i) => D[x.reg || 'national']?.agg?.[i] || D.national.agg[i];
  const pickCell = (x, i) => D[x.reg || 'national']?.cell?.[i] || D.national.cell[i];
  const pickSize = (S, x, i) => (x.reg && S[`${x.reg}|${x.cls}`]?.[i]) || S[`national|${x.cls}`]?.[i] || pickD(x, i);
  // (a) double LOYO on block residuals
  const cov = {}; const add = (key, vals) => { const a = (cov[key] ??= { n: 0, D: 0, cell: 0, size: 0 }); a.n++; a.D += vals[0]; a.cell += vals[1]; a.size += vals[2]; };
  for (const y of YEARS) {
    const S = fitSize(blocks.filter(x => x.y !== y));
    for (const x of blocks.filter(x => x.y === y)) { const i = binOf(x.P); const v = [inside(x, pickD(x, i)), inside(x, pickCell(x, i)), inside(x, pickSize(S, x, i))]; if (v.some(z => z === null)) continue; add(`class|${x.cls}`, v); if (x.P >= 5 && x.P < 30) add(`lowP|${x.cls}`, v); if (x.reg) add(`region|${x.reg}|${x.cls}`, v); }
  }
  const fmt = a => ({ n: a.n, shipped_agg: +(a.D / a.n).toFixed(3), cell_bins: +(a.cell / a.n).toFixed(3), size_bins: +(a.size / a.n).toFixed(3) });
  const loyoCov = Object.fromEntries(Object.entries(cov).map(([k, a]) => [k, fmt(a)]));
  // final size bins on all folds
  const SIZEBINS = fitSize(blocks);
  // (b) forward: full-window factors, blocks and provinces on 2024/2025
  const fitAll = fitFactors(agg.cells, provOf, { K: 10, CAP: 200, years: YEARS });
  const fwd = {}; const addF = (key, vals) => { const a = (fwd[key] ??= { n: 0, D: 0, cell: 0, size: 0 }); a.n++; a.D += vals[0]; a.cell += vals[1]; a.size += vals[2]; };
  for (const y of FORWARD) {
    const { cellV, cellP } = cellSeries(fitAll, set, y); const recs = []; drawBlocks(cellV, cellP, y, recs); provRecs(cellV, cellP, y, recs);
    for (const x of recs) { const i = binOf(x.P); const v = [inside(x, pickD(x, i)), inside(x, pickCell(x, i)), inside(x, pickSize(SIZEBINS, x, i))]; if (v.some(z => z === null)) continue; if (x.level === 'prov') { if (x.P >= 30) addF(`${y}|prov`, v); } else { addF(`${y}|class|${x.cls}`, v); } }
  }
  const fwdCov = Object.fromEntries(Object.entries(fwd).map(([k, a]) => [k, fmt(a)]));
  // resolved bins for 06 / the app: [region|national][class] with fallback already applied; class '1' = by_region_class cell, '200+' also gets country
  const resolved = {};
  for (const reg of [...REGIONS, 'national']) {
    resolved[reg] = { '1': D[reg]?.cell || D.national.cell };
    for (const c of SIZE_CLASSES.slice(1)) resolved[reg][c.name] = Array.from({ length: BINS.length - 1 }, (_, i) => { if (c.name === '200+') { const d = D[reg]?.agg?.[i] || D.national.agg[i]; return { ...d, source: 'agg (05_loyo: province + country residuals)' }; } const own = reg !== 'national' && SIZEBINS[`${reg}|${c.name}`]?.[i]; if (own) return { ...own, source: 'region|size' }; const nat = SIZEBINS[`national|${c.name}`]?.[i]; if (nat) return { ...nat, source: 'national|size' }; const d = D[reg]?.agg?.[i] || D.national.agg[i]; return { ...d, source: 'agg (05_loyo)' }; });
  }
  output.sets[set] = { n_block_month_residuals: blocks.length, loyo_coverage: loyoCov, forward_coverage: fwdCov, bins: resolved };
  console.log(`\n[${set}] coverage of the 80 % interval, out-of-sample for the band — shipped (agg bins) / cell bins / size-class bins`);
  console.log('  LOYO 2012–2023 on random blocks, by size class (all P >= 1 | P 5–30):');
  for (const c of SIZE_CLASSES.slice(1)) { const a = loyoCov[`class|${c.name}`], l = loyoCov[`lowP|${c.name}`]; console.log(`     ${c.name.padEnd(7)} ${pct(a?.shipped_agg)} / ${pct(a?.cell_bins)} / ${pct(a?.size_bins)} (n ${a?.n})   | P 5–30: ${pct(l?.shipped_agg)} / ${pct(l?.cell_bins)} / ${pct(l?.size_bins)} (n ${l?.n})`); }
  console.log('  forward 2024 / 2025 (factors and bins never saw these years): blocks by class, and provinces (P >= 30):');
  for (const y of FORWARD) { console.log(`     ${y}: ` + SIZE_CLASSES.slice(1).map(c => { const a = fwdCov[`${y}|class|${c.name}`]; return `${c.name} ${pct(a?.shipped_agg)}/${pct(a?.cell_bins)}/${pct(a?.size_bins)}`; }).join(' · ') + ` · prov ${pct(fwdCov[`${y}|prov`]?.shipped_agg)}/${pct(fwdCov[`${y}|prov`]?.cell_bins)}/${pct(fwdCov[`${y}|prov`]?.size_bins)} (n ${fwdCov[`${y}|prov`]?.n})`); }
}
await writeFile(path.join(OUT, 'size_bins_test.json'), JSON.stringify(output, null, 1));
BC.by_region_size = { note: '05g_size_bins: bins by predicted count per fire-regime region × size class of the aggregate (number of land cells inside the area): 1 | 2-9 | 10-49 | 50-199 | 200+. Class 1 = cell bins of by_region_class; classes 2+ from random contiguous blocks (LOYO 2012-2023); fallback region|size → national|size → agg bins. Country = national agg of by_region_class.', size_classes: SIZE_CLASSES, TA: output.sets.TA.bins, T: output.sets.T.bins };
BC.size_class_test = { TA: { loyo: output.sets.TA.loyo_coverage, forward: output.sets.TA.forward_coverage }, T: { loyo: output.sets.T.loyo_coverage, forward: output.sets.T.forward_coverage } };
await writeFile(path.join(OUT, 'band_calibration.json'), JSON.stringify(BC, null, 1));
console.log('\nwritten: band_calibration.json (by_region_size, size_class_test), size_bins_test.json');
