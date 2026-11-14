#!/usr/bin/env node
// 06_harmonize.mjs — Build the harmonized monthly series 2000→2025 per cell and per province, with uncertainty band.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Per cell c, year y, month m (METHOD_DESIGN §2.3):
//   y >= 2012            : H = V (observed VIIRS S-NPP)                       sensor = VIIRS          band = none
//   2002-07 .. 2011-12   : H = f_TA[c,m] · (T + A)                            sensor = MODIS→VIIRS-eq band = H·exp(±1.28·σ_TA)   (≈ IC 80 %)
//   2000-11 .. 2002-06   : H = f_T[c,m] · T   (Terra only, Aqua not yet)      sensor = MODIS-Terra→VIIRS-eq, terra_only = 1
//   2000-01 .. 2000-10   : no data (MODIS archive starts 2000-11-01)         H = null
// Band for aggregates (province, country, any AOI): relative σ = max( RSS of cell bands assuming independence,
//   empirical LOYO floor ) where the floor is the LOYO monthly median |rel. error| per level (cell / province / country)
//   interpolated in log10(number of cells). Independence alone under-states the error (±2 % at country level vs 4–9 % measured).
// Persistent thermal sources (static class) are NOT harmonized (their VIIRS/MODIS ratio is non-stationary); raw counts are
// carried as separate columns (static_viirs = Vs for 2012+, static_modis = Ts+As for all years).
//
// Output: data/harmonized/harmonized_cells.csv, harmonized_provinces.csv (24 provinces + AR), cells.json (compact, for the app)

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'harmonized');
await mkdir(OUT, { recursive: true });
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const F = JSON.parse(await readFile(path.join(ROOT, 'data', 'factors', 'factors.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const Y0 = 2000, Y1 = 2025, YEARS = []; for (let y = Y0; y <= Y1; y++) YEARS.push(y);
const Z = 1.2816; // 80 % two-sided
const LOYO = JSON.parse(await readFile(path.join(ROOT, 'data', 'validation', 'loyo_summary.json'), 'utf8'));
const base = LOYO.summary.filter(s => s.K === 20 && s.CAP === 200);
const EMP = { cell: base.find(s => s.level === 'cell').monthly_median_ape, prov: base.find(s => s.level === 'prov').monthly_median_ape, country: base.find(s => s.level === 'country').monthly_median_ape };
const N_CELLS_TOTAL = Object.keys(agg.cells).length, N_CELLS_PROV = N_CELLS_TOTAL / 24;
/** empirical relative σ floor for an aggregate of n cells (piecewise-linear in log10 n through the three LOYO levels) */
export function empSigma(n) {
  const x = Math.log10(Math.max(1, n)), x1 = Math.log10(N_CELLS_PROV), x2 = Math.log10(N_CELLS_TOTAL);
  if (x <= 0) return EMP.cell; if (x >= x2) return EMP.country;
  return x <= x1 ? EMP.cell + (EMP.prov - EMP.cell) * x / x1 : EMP.prov + (EMP.country - EMP.prov) * (x - x1) / (x2 - x1);
}
const SI_NOTE = '# Produced by scripts written with SI assistance (Claude, Anthropic); all values computed from NASA FIRMS archives (MODIS C6.1, VIIRS S-NPP). License CC BY 4.0. GeoFuego Harmonization, NASA Space Apps 2026.';

const era = (y, m) => y >= 2012 ? 'VIIRS' : (y > 2002 || (y === 2002 && m >= 7)) ? 'MODIS->VIIRS-eq' : (y > 2000 || m >= 11) ? 'MODIS-Terra->VIIRS-eq' : null;

let cellsCsv = `${SI_NOTE}\ncell,prov,year,month,H,H_lo,H_hi,sigma_log,V,T,A,sensor,terra_only,static_viirs,static_modis\n`;
const compact = { grid: index.grid, years: YEARS, z: Z, emp: { ...EMP, n_prov: Math.round(N_CELLS_PROV), n_total: N_CELLS_TOTAL }, note: SI_NOTE.slice(2), cells: {} };
const provSeries = {}; // prov -> { H:[y][m], var:[y][m], obs:[y][m], static:[y][m] }
const provAcc = p => (provSeries[p] ??= { n: 0, H: YEARS.map(() => Array(12).fill(0)), var: YEARS.map(() => Array(12).fill(0)), nodata: YEARS.map(() => Array(12).fill(true)), st: YEARS.map(() => Array(12).fill(0)) });

for (const [cid, yrs] of Object.entries(agg.cells)) {
  const cell = +cid, prov = provOf.get(cell); if (!prov) continue;
  const fTA = F.cell.TA[cell], fT = F.cell.T[cell]; if (!fTA || !fT) continue;
  const h = [], s = [], st = {};
  provAcc(prov).n++;
  for (const y of YEARS) {
    const hy = Array(12).fill(-1), sy = Array(12).fill(0);
    for (let m = 1; m <= 12; m++) {
      const e = era(y, m); if (!e) continue;
      const r = yrs[y]?.[m] || [0, 0, 0, 0, 0, 0];
      const V = r[0], T = r[1], A = r[2], Vs = r[3], Ms = r[4] + r[5];
      let H, sig = 0, terra = 0;
      if (e === 'VIIRS') H = V;
      else if (e === 'MODIS->VIIRS-eq') { H = fTA[m - 1][0] * (T + A); sig = fTA[m - 1][1]; }
      else { H = fT[m - 1][0] * T; sig = fT[m - 1][1]; terra = 1; }
      const lo = sig ? H * Math.exp(-Z * sig) : H, hi = sig ? H * Math.exp(Z * sig) : H;
      hy[m - 1] = Math.round(H); sy[m - 1] = Math.round(sig * 1000);
      if (Vs || Ms) (st[y] ??= Array(12).fill(0))[m - 1] = e === 'VIIRS' ? Vs : Ms;
      if (H > 0 || V || T || A || Vs || Ms) cellsCsv += `${cell},"${prov}",${y},${m},${H.toFixed(1)},${lo.toFixed(1)},${hi.toFixed(1)},${sig.toFixed(3)},${V},${T},${A},${e},${terra},${e === 'VIIRS' ? Vs : ''},${Ms}\n`;
      const P = provAcc(prov), yi = y - Y0; P.H[yi][m - 1] += H; P.var[yi][m - 1] += (H * sig) ** 2; P.nodata[yi][m - 1] = false; P.st[yi][m - 1] += e === 'VIIRS' ? Vs : Ms;
    }
    h.push(hy); s.push(sy);
  }
  compact.cells[cell] = { p: prov, h, s, ...(Object.keys(st).length ? { st } : {}) };
}

// provinces + country
const AR = { n: N_CELLS_TOTAL, H: YEARS.map(() => Array(12).fill(0)), var: YEARS.map(() => Array(12).fill(0)), nodata: YEARS.map(() => Array(12).fill(true)), st: YEARS.map(() => Array(12).fill(0)) };
for (const P of Object.values(provSeries)) for (let yi = 0; yi < YEARS.length; yi++) for (let m = 0; m < 12; m++) { AR.H[yi][m] += P.H[yi][m]; AR.var[yi][m] += P.var[yi][m]; if (!P.nodata[yi][m]) AR.nodata[yi][m] = false; AR.st[yi][m] += P.st[yi][m]; }
provSeries['Argentina'] = AR;
let provCsv = `${SI_NOTE}\n# sigma_rel = max(RSS of cell bands, empirical LOYO floor by number of cells); band = H*exp(-+1.28*sigma_rel) ~ IC80; 0 for observed VIIRS years\nregion,n_cells,year,month,H,H_lo,H_hi,sigma_rel,sensor,static\n`;
for (const [p, P] of Object.entries(provSeries)) for (let yi = 0; yi < YEARS.length; yi++) for (let m = 0; m < 12; m++) {
  if (P.nodata[yi][m]) continue;
  const H = P.H[yi][m], rss = H > 0 ? Math.sqrt(P.var[yi][m]) / H : 0, sr = YEARS[yi] >= 2012 ? 0 : Math.max(rss, empSigma(P.n));
  provCsv += `"${p}",${P.n},${YEARS[yi]},${m + 1},${H.toFixed(1)},${(H * Math.exp(-Z * sr)).toFixed(1)},${(H * Math.exp(Z * sr)).toFixed(1)},${sr.toFixed(3)},${era(YEARS[yi], m + 1)},${P.st[yi][m]}\n`;
}
await writeFile(path.join(OUT, 'harmonized_cells.csv'), cellsCsv);
await writeFile(path.join(OUT, 'harmonized_provinces.csv'), provCsv);
const json = JSON.stringify(compact);
await writeFile(path.join(OUT, 'cells.json'), json);
await writeFile(path.join(OUT, 'cells.json.gz'), gzipSync(json, { level: 9 }));

// report: country annual totals with band
console.log(`cells: ${Object.keys(compact.cells).length} · cells.json ${(json.length / 1e6).toFixed(1)} MB (gz ${(gzipSync(json, { level: 9 }).length / 1e6).toFixed(2)} MB) · cells.csv ${(cellsCsv.length / 1e6).toFixed(1)} MB`);
console.log(`empirical σ floor (LOYO monthly median |err|): cell ${EMP.cell} · prov ${EMP.prov} · country ${EMP.country}`);
console.log('\nArgentina, annual VIIRS-equivalent hotspots (vegetation class), band = IC80 (max of RSS and LOYO floor):');
for (let yi = 0; yi < YEARS.length; yi++) {
  let H = 0, v = 0, st = 0; for (let m = 0; m < 12; m++) { H += AR.H[yi][m]; v += AR.var[yi][m]; st += AR.st[yi][m]; }
  const sr = YEARS[yi] >= 2012 ? 0 : H ? Math.max(Math.sqrt(v) / H, EMP.country) : 0;
  console.log(`  ${YEARS[yi]}  ${String(Math.round(H)).padStart(7)}  [${Math.round(H * Math.exp(-Z * sr))}–${Math.round(H * Math.exp(Z * sr))}]  ${era(YEARS[yi], 12).padEnd(22)} static ${st}`);
}
