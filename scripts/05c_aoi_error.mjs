#!/usr/bin/env node
// 05c_aoi_error.mjs — Error of the harmonized series as a function of AOI size (number of 0.25° cells), measured by LOYO.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// For every held-out year (2012–2023) and every block size s ∈ {1, 2, 3, 5, 10, 15} (s×s contiguous cells), random blocks
// are drawn over the grid; for each block the predicted VIIRS-equivalent counts (f·MODIS, paired days) are compared with
// the observed VIIRS counts: monthly |relative error| (months with ≥ 10 observed hotspots) and fire-season (Jul–Nov) MAPE
// (blocks with ≥ 30 observed hotspots in the season). The medians per size form the empirical uncertainty curve used by
// 06_harmonize (and by the app) for any user-drawn AOI: σ_rel(n_cells).
// Output: data/validation/aoi_error_curve.json, aoi_error_curve.csv

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFactors } from '../lib/factors.js';
import { GRID } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'validation');
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const YEARS = []; for (let y = 2012; y <= 2023; y++) YEARS.push(y);
const SIZES = [1, 2, 3, 5, 10, 15], SAMPLES = 400, SEASON = [7, 8, 9, 10, 11];
let seed = 20261114; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

const monthlyErr = {}, seasonErr = {}, nCellsUsed = {};
for (const s of SIZES) { monthlyErr[s] = []; seasonErr[s] = []; nCellsUsed[s] = []; }
for (const yStar of YEARS) {
  const fit = fitFactors(agg.cells, provOf, { K: 20, CAP: 200, years: YEARS.filter(y => y !== yStar) });
  // per-cell monthly observed V and predicted P for yStar
  const cellV = new Map(), cellP = new Map();
  for (const [cid, yrs] of Object.entries(agg.cells)) {
    const ym = yrs[yStar]; if (!ym) continue; const fc = fit.cell.TA[+cid]; if (!fc) continue;
    const V = Array(13).fill(0), P = Array(13).fill(0);
    for (const [m, r] of Object.entries(ym)) { V[m] = r[6] ?? 0; P[m] = fc[m - 1][0] * ((r[7] ?? 0) + (r[8] ?? 0)); }
    cellV.set(+cid, V); cellP.set(+cid, P);
  }
  for (const s of SIZES) {
    let drawn = 0, tries = 0;
    while (drawn < SAMPLES && tries < SAMPLES * 30) {
      tries++;
      const r0 = Math.floor(rnd() * (GRID.nRows - s)), c0 = Math.floor(rnd() * (GRID.nCols - s));
      const V = Array(13).fill(0), P = Array(13).fill(0); let n = 0;
      for (let r = r0; r < r0 + s; r++) for (let c = c0; c < c0 + s; c++) { const id = r * GRID.nCols + c; const v = cellV.get(id); if (!v) continue; n++; const p = cellP.get(id); for (let m = 1; m <= 12; m++) { V[m] += v[m]; P[m] += p[m]; } }
      if (!n) continue;
      const sV = SEASON.reduce((a, m) => a + V[m], 0), sP = SEASON.reduce((a, m) => a + P[m], 0);
      if (sV < 30) continue;
      drawn++; nCellsUsed[s].push(n);
      seasonErr[s].push(Math.abs(sP - sV) / sV);
      for (let m = 1; m <= 12; m++) if (V[m] >= 10) monthlyErr[s].push(Math.abs(P[m] - V[m]) / V[m]);
    }
  }
  process.stderr.write(`fold ${yStar} done\n`);
}
const curve = SIZES.map(s => ({ block: `${s}x${s}`, n_cells_nominal: s * s, n_cells_median: median(nCellsUsed[s]), samples: seasonErr[s].length, monthly_median_abs_rel_err: +median(monthlyErr[s]).toFixed(4), monthly_p75: +[...monthlyErr[s]].sort((a, b) => a - b)[Math.floor(monthlyErr[s].length * 0.75)].toFixed(4), season_mape_mean: +(seasonErr[s].reduce((a, b) => a + b, 0) / seasonErr[s].length).toFixed(4), season_mape_median: +median(seasonErr[s]).toFixed(4) }));
// add the two reference points measured by 05_loyo (province, country) for context
const loyo = JSON.parse(await readFile(path.join(OUT, 'loyo_summary.json'), 'utf8')).summary.filter(x => x.K === 20 && x.CAP === 200);
const ref = [{ block: 'province (avg)', n_cells_nominal: Math.round(Object.keys(agg.cells).length / 24), monthly_median_abs_rel_err: loyo.find(x => x.level === 'prov').monthly_median_ape, season_mape_mean: loyo.find(x => x.level === 'prov').season_mape }, { block: 'country', n_cells_nominal: Object.keys(agg.cells).length, monthly_median_abs_rel_err: loyo.find(x => x.level === 'country').monthly_median_ape, season_mape_mean: loyo.find(x => x.level === 'country').season_mape }];
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'aoi_error_curve.json'), JSON.stringify({ generated: new Date().toISOString(), method: 'LOYO 2012-2023, random contiguous blocks, paired days, vegetation class', sizes: SIZES, samples_per_fold: SAMPLES, curve, reference: ref }, null, 1));
await writeFile(path.join(OUT, 'aoi_error_curve.csv'), 'block,n_cells_nominal,n_cells_median,samples,monthly_median_abs_rel_err,monthly_p75,season_mape_mean,season_mape_median\n' + curve.map(c => Object.values(c).join(',')).join('\n') + '\n');
console.log('AOI size → error (LOYO, medians over blocks × 12 folds)');
console.log('block      cells  samples  monthly med|err|  p75    season MAPE mean / median');
for (const c of curve) console.log(`${c.block.padEnd(10)} ${String(c.n_cells_median).padStart(5)}  ${String(c.samples).padStart(6)}   ${(100 * c.monthly_median_abs_rel_err).toFixed(1).padStart(5)}%   ${(100 * c.monthly_p75).toFixed(1).padStart(5)}%   ${(100 * c.season_mape_mean).toFixed(1).padStart(5)}% / ${(100 * c.season_mape_median).toFixed(1)}%`);
for (const c of ref) console.log(`${c.block.padEnd(10)} ${String(c.n_cells_nominal).padStart(5)}     (ref)   ${(100 * c.monthly_median_abs_rel_err).toFixed(1).padStart(5)}%            ${(100 * c.season_mape_mean).toFixed(1).padStart(5)}%`);
