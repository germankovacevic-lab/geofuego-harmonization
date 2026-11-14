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
// Satellite outages (03b_coverage.mjs) are filled with the other sensor, so that a gap in one satellite does not become
// a false low in the series ("sensor of origin no longer matters"):
//   2012+   : H = V + f_TA · M(on S-NPP outage days)                         e.g. S-NPP safe-hold 10 days in Aug 2022
//   2002-07+: M_TA += Aqua(on Terra-outage days) · (T/A)_prov,m + Terra(on Aqua-outage days) · (A/T)_prov,m
//   Terra-only era: T × days_in_month / (days_in_month − Terra outage days)   e.g. Terra Jun 2001 (15 days)
//   Every filled value carries gap_fill (amount added) and the outage-day counts in the CSVs.
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
// Empirical relative σ for an aggregate of n cells: the AOI-size error curve measured by LOYO on random contiguous blocks
// (05c_aoi_error.mjs: monthly median |rel. error| for 1, 4, 9, 21, 64, 111 cells) plus the province and country references,
// interpolated piecewise-linearly in log10(n).
const AOI = JSON.parse(await readFile(path.join(ROOT, 'data', 'validation', 'aoi_error_curve.json'), 'utf8'));
const CURVE = [...AOI.curve.map(c => [c.n_cells_median, c.monthly_median_abs_rel_err]), ...AOI.reference.map(c => [c.n_cells_nominal, c.monthly_median_abs_rel_err])].sort((a, b) => a[0] - b[0]);
export function empSigma(n) {
  const x = Math.log10(Math.max(1, n));
  if (x <= Math.log10(CURVE[0][0])) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) { const [n1, s1] = CURVE[i - 1], [n2, s2] = CURVE[i]; const x1 = Math.log10(n1), x2 = Math.log10(n2); if (x <= x2) return s1 + (s2 - s1) * (x - x1) / (x2 - x1); }
  return CURVE.at(-1)[1];
}
const SI_NOTE = '# Produced by scripts written with SI assistance (Claude, Anthropic); all values computed from NASA FIRMS archives (MODIS C6.1, VIIRS S-NPP). License CC BY 4.0. GeoFuego Harmonization, NASA Space Apps 2026.';

const COV = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'coverage.json'), 'utf8'));
const outDays = (sat, y, m) => COV.by_month[sat]?.[`${y}-${String(m).padStart(2, '0')}`]?.outage_days || 0;
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// province-level Terra/Aqua ratio per calendar month (2003–2023, all days) for filling one MODIS satellite with the other
const rTA = {}; { const acc = {}; for (const [cid, yrs] of Object.entries(agg.cells)) { const p = provOf.get(+cid); if (!p) continue; for (const [y, ms] of Object.entries(yrs)) { if (+y < 2003 || +y > 2023) continue; for (const [m, r] of Object.entries(ms)) { const o = ((acc[p] ??= {})[m] ??= [0, 0]); o[0] += r[1]; o[1] += r[2]; } } } for (const [p, ms] of Object.entries(acc)) { rTA[p] = {}; for (const [m, [T, A]] of Object.entries(ms)) rTA[p][m] = A > 0 ? T / A : 0.55; } }
// Optional ENSO conditioning of the reconstructed years (05e_enso.mjs): H *= exp(BETA * ONI(y,m)); BETA < 0 raises the
// factor in La Niña (dry) months. Applied only to MODIS-reconstructed months (2000–2011); observed VIIRS is untouched.
const BETA = +(process.argv.find(a => a.startsWith('--enso-beta='))?.split('=')[1] || 0);
const ENSO_SIGMA_BETA = 0.025; // measured national sensitivity (05e): phase-dependent uncertainty added in quadrature to reconstructed months
const ONI = {};
{ const SEAS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ']; for (const line of (await readFile(path.join(process.env.HOME, '.openclaw', 'data', 'firms_ar', 'oni.ascii.txt'), 'utf8')).split('\n').slice(1)) { const f = line.trim().split(/\s+/); const mi = SEAS.indexOf(f[0]) + 1; if (mi) ONI[`${f[1]}-${mi}`] = +f[3]; } }
const ensoAdj = (y, m) => BETA && y < 2012 ? Math.exp(BETA * (ONI[`${y}-${m}`] ?? 0)) : 1;
const ensoSig = (y, m) => y < 2012 ? Math.abs(ENSO_SIGMA_BETA * (ONI[`${y}-${m}`] ?? 0)) : 0;
const era = (y, m) => y >= 2012 ? 'VIIRS' : (y > 2002 || (y === 2002 && m >= 7)) ? 'MODIS->VIIRS-eq' : (y > 2000 || m >= 11) ? 'MODIS-Terra->VIIRS-eq' : null;

let cellsCsv = `${SI_NOTE}\ncell,prov,year,month,H,H_lo,H_hi,sigma_log,V,T,A,sensor,terra_only,gap_fill,static_viirs,static_modis\n`;
let fillTotal = { snpp: 0, terra: 0, aqua: 0, terra_only: 0 };
const compact = { grid: index.grid, years: YEARS, z: Z, emp: { ...EMP, n_prov: Math.round(N_CELLS_PROV), n_total: N_CELLS_TOTAL }, sigma_curve: CURVE, note: SI_NOTE.slice(2), cells: {} };
const provSeries = {}; // prov -> { H:[y][m], var:[y][m], obs:[y][m], static:[y][m] }
const provAcc = p => (provSeries[p] ??= { n: 0, H: YEARS.map(() => Array(12).fill(0)), var: YEARS.map(() => Array(12).fill(0)), nodata: YEARS.map(() => Array(12).fill(true)), st: YEARS.map(() => Array(12).fill(0)), gf: YEARS.map(() => Array(12).fill(0)) });

for (const [cid, yrs] of Object.entries(agg.cells)) {
  const cell = +cid, prov = provOf.get(cell); if (!prov) continue;
  const fTA = F.cell.TA[cell], fT = F.cell.T[cell]; if (!fTA || !fT) continue;
  const h = [], s = [], st = {}, gfc = {};
  provAcc(prov).n++;
  for (const y of YEARS) {
    const hy = Array(12).fill(-1), sy = Array(12).fill(0);
    for (let m = 1; m <= 12; m++) {
      const e = era(y, m); if (!e) continue;
      const r = yrs[y]?.[m] || Array(12).fill(0);
      const V = r[0], T = r[1], A = r[2], Vs = r[3], Ms = r[4] + r[5], Mso = r[9] || 0, Ato = r[10] || 0, Tao = r[11] || 0;
      let H, sig = 0, terra = 0, gf = 0;
      if (e === 'VIIRS') { H = V; if (Mso) { gf = fTA[m - 1][0] * Mso; H += gf; fillTotal.snpp += gf; } }
      else if (e === 'MODIS->VIIRS-eq') {
        const k = rTA[prov]?.[m] ?? 0.55; const fillT = Ato * k, fillA = Tao / Math.max(k, 0.05);
        const adj = ensoAdj(y, m);
        H = fTA[m - 1][0] * (T + A + fillT + fillA) * adj; gf = fTA[m - 1][0] * (fillT + fillA) * adj; fillTotal.terra += fTA[m - 1][0] * fillT; fillTotal.aqua += fTA[m - 1][0] * fillA; sig = fTA[m - 1][1];
      } else {
        const od = outDays('Terra', y, m), scale = od ? dim(y, m) / Math.max(1, dim(y, m) - od) : 1;
        const adj = ensoAdj(y, m);
        H = fT[m - 1][0] * T * scale * adj; gf = fT[m - 1][0] * T * (scale - 1) * adj; fillTotal.terra_only += gf; sig = fT[m - 1][1]; terra = 1;
      }
      if (sig) sig = Math.sqrt(sig * sig + ensoSig(y, m) ** 2);
      const lo = sig ? H * Math.exp(-Z * sig) : H, hi = sig ? H * Math.exp(Z * sig) : H;
      hy[m - 1] = Math.round(H); sy[m - 1] = Math.round(sig * 1000);
      if (Vs || Ms) (st[y] ??= Array(12).fill(0))[m - 1] = e === 'VIIRS' ? Vs : Ms;
      if (gf > 0.5) (gfc[y] ??= Array(12).fill(0))[m - 1] = Math.round(gf);
      if (H > 0 || V || T || A || Vs || Ms) cellsCsv += `${cell},"${prov}",${y},${m},${H.toFixed(1)},${lo.toFixed(1)},${hi.toFixed(1)},${sig.toFixed(3)},${V},${T},${A},${e},${terra},${gf ? gf.toFixed(1) : 0},${e === 'VIIRS' ? Vs : ''},${Ms}\n`;
      const P = provAcc(prov), yi = y - Y0; P.H[yi][m - 1] += H; P.var[yi][m - 1] += (H * sig) ** 2; P.nodata[yi][m - 1] = false; P.st[yi][m - 1] += e === 'VIIRS' ? Vs : Ms; P.gf[yi][m - 1] += gf;
    }
    h.push(hy); s.push(sy);
  }
  compact.cells[cell] = { p: prov, h, s, ...(Object.keys(st).length ? { st } : {}), ...(Object.keys(gfc).length ? { gf: gfc } : {}) };
}

// provinces + country
const AR = { n: N_CELLS_TOTAL, H: YEARS.map(() => Array(12).fill(0)), var: YEARS.map(() => Array(12).fill(0)), nodata: YEARS.map(() => Array(12).fill(true)), st: YEARS.map(() => Array(12).fill(0)), gf: YEARS.map(() => Array(12).fill(0)) };
for (const P of Object.values(provSeries)) for (let yi = 0; yi < YEARS.length; yi++) for (let m = 0; m < 12; m++) { AR.H[yi][m] += P.H[yi][m]; AR.var[yi][m] += P.var[yi][m]; if (!P.nodata[yi][m]) AR.nodata[yi][m] = false; AR.st[yi][m] += P.st[yi][m]; AR.gf[yi][m] += P.gf[yi][m]; }
provSeries['Argentina'] = AR;
let provCsv = `${SI_NOTE}\n# sigma_rel = max(RSS of cell bands, empirical LOYO floor by number of cells); band = H*exp(-+1.28*sigma_rel) ~ IC80; 0 for observed VIIRS years\nregion,n_cells,year,month,H,H_lo,H_hi,sigma_rel,sensor,gap_fill,outage_days_terra,outage_days_aqua,outage_days_snpp,static\n`;
for (const [p, P] of Object.entries(provSeries)) for (let yi = 0; yi < YEARS.length; yi++) for (let m = 0; m < 12; m++) {
  if (P.nodata[yi][m]) continue;
  const H = P.H[yi][m], rss = H > 0 ? Math.sqrt(P.var[yi][m]) / H : 0, sr = YEARS[yi] >= 2012 ? 0 : Math.max(rss, empSigma(P.n));
  const yy = YEARS[yi], mm = m + 1;
  provCsv += `"${p}",${P.n},${yy},${mm},${H.toFixed(1)},${(H * Math.exp(-Z * sr)).toFixed(1)},${(H * Math.exp(Z * sr)).toFixed(1)},${sr.toFixed(3)},${era(yy, mm)},${P.gf[yi][m] ? P.gf[yi][m].toFixed(1) : 0},${outDays('Terra', yy, mm)},${yy > 2002 || (yy === 2002 && mm >= 7) ? outDays('Aqua', yy, mm) : ''},${yy >= 2012 ? outDays('SNPP', yy, mm) : ''},${P.st[yi][m]}\n`;
}
await writeFile(path.join(OUT, 'harmonized_cells.csv'), cellsCsv);
await writeFile(path.join(OUT, 'harmonized_provinces.csv'), provCsv);
const json = JSON.stringify(compact);
await writeFile(path.join(OUT, 'cells.json'), json);
await writeFile(path.join(OUT, 'cells.json.gz'), gzipSync(json, { level: 9 }));

// report: country annual totals with band
console.log(`cells: ${Object.keys(compact.cells).length} · cells.json ${(json.length / 1e6).toFixed(1)} MB (gz ${(gzipSync(json, { level: 9 }).length / 1e6).toFixed(2)} MB) · cells.csv ${(cellsCsv.length / 1e6).toFixed(1)} MB`);
if (BETA) console.log(`ENSO conditioning applied to 2000–2011: beta=${BETA} (H *= exp(beta*ONI))`);
console.log(`gap fill (VIIRS-eq hotspots added): S-NPP outages ${Math.round(fillTotal.snpp)} · Terra outages ${Math.round(fillTotal.terra)} · Aqua outages ${Math.round(fillTotal.aqua)} · Terra-only era ${Math.round(fillTotal.terra_only)}`);
console.log(`empirical σ curve (LOYO, monthly median |err| vs n cells): ` + CURVE.map(([n, s]) => `${n}:${(100 * s).toFixed(0)}%`).join(' '));
console.log('\nArgentina, annual VIIRS-equivalent hotspots (vegetation class), band = IC80 (max of RSS and LOYO floor):');
for (let yi = 0; yi < YEARS.length; yi++) {
  let H = 0, v = 0, st = 0; for (let m = 0; m < 12; m++) { H += AR.H[yi][m]; v += AR.var[yi][m]; st += AR.st[yi][m]; }
  const sr = YEARS[yi] >= 2012 ? 0 : H ? Math.max(Math.sqrt(v) / H, EMP.country) : 0;
  console.log(`  ${YEARS[yi]}  ${String(Math.round(H)).padStart(7)}  [${Math.round(H * Math.exp(-Z * sr))}–${Math.round(H * Math.exp(Z * sr))}]  ${era(YEARS[yi], 12).padEnd(22)} static ${st}`);
}
