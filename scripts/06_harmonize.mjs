#!/usr/bin/env node
// 06_harmonize.mjs — Build the harmonized monthly series 2000→2025 per cell and per province, with uncertainty band.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Per cell c, year y, month m (METHOD_DESIGN §2.3):
//   y >= 2012            : H = V (observed VIIRS S-NPP)                       sensor = VIIRS          band = none
//   2002-07 .. 2011-12   : H = f_TA[c,m] · (T + A)                            sensor = MODIS→VIIRS-eq band = 80 % prediction interval (below)
//   2000-11 .. 2002-06   : H = f_T[c,m] · T   (Terra only, Aqua not yet)      sensor = MODIS-Terra→VIIRS-eq, terra_only = 1
//   2000-01 .. 2000-10   : no data (MODIS archive starts 2000-11-01)         H = null
// 80 % PREDICTION INTERVAL, calibrated on out-of-sample LOYO residuals (05_loyo → band_calibration.json), per satellite set:
//   [H·exp(p10), H·exp(p90)] where p10/p90 are the signed 10th/90th percentiles of log(V/P) in the bin of PREDICTED count that
//   contains H (bins 1–5, 5–15, …, 3000+), fitted PER FIRE-REGIME REGION (lib/regions.js) AND PER CLASS: 'cell' (one 0.25° cell,
//   from cell-level residuals) or 'agg' (any aggregate of cells, from province- and country-level residuals). Cell and aggregate
//   residuals have opposite signs at low counts (a cell with P ≥ 1 is a selected over-prediction; a small aggregate is
//   under-predicted by the structural zeros of its other cells), so pooling them covered 67 % of province-months with P < 30.
//   The country uses the national 'agg' bins; bins with < 30 residuals fall back to national|class → region → pooled (resolved in 05). The interval is asymmetric (low counts are biased high by the multiplicative model: median residual −0.4 at
//   5–15; −0.76 in Patagonia) and depends on the count and the region, not on the number of cells. Measured coverage, out-of-
//   sample for the band itself (TA): country 89 %, province 79 %, cell 81 %; areas of 2–199 cells 80 % (by size class, 05g),
//   Neuquén 77 %, Chubut 71 %; Pampa/Cuyo provinces conservative (85–94 %); Tierra del Fuego not verifiable (3 months).
//   The Terra-only era (2000–mid 2002) uses its own, wider, bins (set T). Observed VIIRS months have no interval (they are the
//   reference); gap-filled observed months get the interval of the filled part only. ENSO term (|0.025·ONI|) widens both sides.
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
import { REGION_OF } from '../lib/regions.js';
import { readJsonMaybeGz } from '../lib/io.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'harmonized');
await mkdir(OUT, { recursive: true });
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const F = JSON.parse(await readFile(path.join(ROOT, 'data', 'factors', 'factors.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const Y0 = 2000, Y1 = 2025, YEARS = []; for (let y = Y0; y <= Y1; y++) YEARS.push(y);
const Z = 1.2816; // 80 % two-sided
const BANDCAL = JSON.parse(await readFile(path.join(ROOT, 'data', 'validation', 'band_calibration.json'), 'utf8'));
const BINSET = { TA: BANDCAL.band.TA.by_count, T: BANDCAL.band.T.by_count };
const REGBINS = { TA: BANDCAL.band.TA.by_region, T: BANDCAL.band.T.by_region }; // variant A (14:25), kept for reference
const RC = { TA: BANDCAL.band.TA.by_region_class, T: BANDCAL.band.T.by_region_class }; // variant D (15:15): [region|'national'][cell|agg][bin]
if (!RC.TA || !RC.T) throw new Error('band_calibration.json has no by_region_class bins: run 05_loyo.mjs');
// round 4 (05g_size_bins): bins by region × SIZE CLASS of the aggregate (1 | 2-9 | 10-49 | 50-199 | 200+); class 1 = cell bins, 200+ = agg bins
const RS = BANDCAL.by_region_size; if (!RS?.TA || !RS?.T) throw new Error('band_calibration.json has no by_region_size bins: run 05g_size_bins.mjs');
const SIZE_CLASSES = RS.size_classes; const sizeClassOf = n => SIZE_CLASSES.find(c => n >= c.min && n <= c.max).name;
/** signed log offsets [p10, p90] of the 80 % interval for a predicted count P under satellite set s, in region reg (null = pooled/country) */
/** cls = 'cell' (one 0.25° cell) or 'agg' (any aggregate: province, country, user AOI); reg = fire-regime region or null for the whole country */
/** cls: a size class name ('1', '2-9', '10-49', '50-199', '200+') or 'agg' (country); reg = fire-regime region or null for the whole country */
function bandLog(P, s, reg = null, cls = 'agg') { const bins = cls === 'agg' ? RC[s].national.agg : (RS[s]?.[reg || 'national']?.[cls] || RS[s]?.national?.[cls] || RC[s].national.agg); let b = bins[0]; for (const x of bins) if (P >= x.P_min) b = x; return [Math.min(0, b.p10_log), Math.max(0, b.p90_log)]; } // clamped so that the interval always contains H (round 4: 28 province rows had H below its own lower bound)
const regionOf = prov => REGION_OF[prov] || null;
const N_CELLS_TOTAL = Object.keys(agg.cells).length;
// Empirical relative σ for an aggregate of n cells: the AOI-size error curve measured by LOYO on random contiguous blocks
// (05c_aoi_error.mjs: monthly median |rel. error| for 1, 4, 9, 21, 64, 111 cells) plus the province and country references,
// interpolated piecewise-linearly in log10(n).
const AOI = JSON.parse(await readFile(path.join(ROOT, 'data', 'validation', 'aoi_error_curve.json'), 'utf8'));
const CURVES = {};
for (const set of ['TA', 'T']) CURVES[set] = [...AOI.by_set[set].curve.map(c => [c.n_cells_median, c.q80_abs_log / Z]), ...AOI.by_set[set].reference.map(c => [c.n_cells_nominal, c.q80_abs_log / Z])].sort((a, b) => a[0] - b[0]);
const CURVE = CURVES.TA;
export function empSigma(n, set = 'TA') {
  const C = CURVES[set] || CURVES.TA; const x = Math.log10(Math.max(1, n));
  if (x <= Math.log10(C[0][0])) return C[0][1];
  for (let i = 1; i < C.length; i++) { const [n1, s1] = C[i - 1], [n2, s2] = C[i]; const x1 = Math.log10(n1), x2 = Math.log10(n2); if (x <= x2) return s1 + (s2 - s1) * (x - x1) / (x2 - x1); }
  return C.at(-1)[1];
}
const setOf = (y, m) => (y < 2002 || (y === 2002 && m <= 6)) ? 'T' : 'TA';
const SI_NOTE = '# Produced by scripts written with SI assistance (Claude, Anthropic); all values computed from NASA FIRMS country archives (MODIS Collection 6/6.1, file versions 6.2/6.03/61.03; VIIRS S-NPP). License CC BY 4.0. GeoFuego Harmonization, NASA Space Apps 2026.';

const COV = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'coverage.json'), 'utf8'));
const outDays = (sat, y, m) => COV.by_month[sat]?.[`${y}-${String(m).padStart(2, '0')}`]?.outage_days || 0;
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// province-level Terra/Aqua ratio per calendar month (2003–2023, all days) for filling one MODIS satellite with the other
const rTA = {}; { const acc = {}; for (const [cid, yrs] of Object.entries(agg.cells)) { const p = provOf.get(+cid); if (!p) continue; for (const [y, ms] of Object.entries(yrs)) { if (+y < 2003 || +y > 2023) continue; for (const [m, r] of Object.entries(ms)) { const o = ((acc[p] ??= {})[m] ??= [0, 0]); o[0] += r[1]; o[1] += r[2]; } } } for (const [p, ms] of Object.entries(acc)) { rTA[p] = {}; for (const [m, [T, A]] of Object.entries(ms)) rTA[p][m] = A > 0 ? T / A : 0.55; } }
// Optional ENSO conditioning of the reconstructed years (05e_enso.mjs): H *= exp(BETA * ONI(y,m)); BETA < 0 raises the
// factor in La Niña (dry) months. Applied only to MODIS-reconstructed months (2000–2011); observed VIIRS is untouched.
const BETA = +(process.argv.find(a => a.startsWith('--enso-beta='))?.split('=')[1] || 0);
const ENSO_SIGMA_BETA = 0.025; // measured national sensitivity (05e): phase-dependent uncertainty added linearly to both log-bounds of reconstructed months
const ONI = {};
{ const SEAS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ']; for (const line of (await readFile(path.join(ROOT, 'data', 'external', 'oni', 'oni.ascii.txt'), 'utf8')).split('\n').slice(1)) { const f = line.trim().split(/\s+/); const mi = SEAS.indexOf(f[0]) + 1; if (mi) ONI[`${f[1]}-${mi}`] = +f[3]; } }
const ensoAdj = (y, m) => BETA && y < 2012 ? Math.exp(BETA * (ONI[`${y}-${m}`] ?? 0)) : 1;
const ensoSig = (y, m) => y < 2012 ? Math.abs(ENSO_SIGMA_BETA * (ONI[`${y}-${m}`] ?? 0)) : 0;
// Cloud obscuration (03c_cloud_cells.py + 05f_cloud.mjs): infrared detection is blocked by cloud. Conditional on precipitation,
// a cloud-fraction anomaly Δ at the overpass changes detections by ≈ exp(−3·Δ) for both sensors (VIIRS −3.1, MODIS −2.8 per
// unit cloud fraction). Counts are NOT corrected (the effect is partly fire weather); months with Δ > +0.05 are flagged with the
// estimated under-detection, and in reconstructed months the upper bound of the interval is widened by exp(3·Δ).
const CLOUD_SLOPE = 3.0, CLOUD_FLAG = 0.05;
// cloud_cells.json is produced by 03c from ERA5 (needs CDS credentials); the gzipped copy is versioned so that a clean clone
// reproduces the published product. Missing input is an error, not a silent degradation: pass --no-cloud to build without the flag.
const NO_CLOUD = process.argv.includes('--no-cloud');
let CLOUD = NO_CLOUD ? null : readJsonMaybeGz(path.join(ROOT, 'data', 'agg', 'cloud_cells.json'));
if (!CLOUD && !NO_CLOUD) { console.error('06_harmonize: data/agg/cloud_cells.json(.gz) not found. Run 01d + 03c, or `git checkout data/agg/cloud_cells.json.gz`, or pass --no-cloud to build without the cloud flag (the output will differ from the published product).'); process.exit(1); }
if (NO_CLOUD) console.log('--no-cloud: building without the cloud-obscuration flag (output differs from the published product)');
const cloudAnom = (cell, y, m, e) => { if (!CLOUD) return null; const r = CLOUD.cells[cell]?.[y]?.[m - 1], c = CLOUD.clim[cell]?.[m - 1]; if (!r || !c) return null; const k = e === 'MODIS-Terra->VIIRS-eq' ? 0 : 1; return r[k] == null ? null : +(r[k] - c[k]).toFixed(3); };
let cloudFlagged = 0;
const era = (y, m) => y >= 2012 ? 'VIIRS' : (y > 2002 || (y === 2002 && m >= 7)) ? 'MODIS->VIIRS-eq' : (y > 2000 || m >= 11) ? 'MODIS-Terra->VIIRS-eq' : null;

let cellsCsv = `${SI_NOTE}\n# H_lo/H_hi = 80% prediction interval calibrated out-of-sample by predicted count, satellite set and fire-regime region (cell-level residuals; band_calibration.json by_region_size class '1'); lower bound clamped to H; empty for observed VIIRS months\ncell,prov,year,month,H,H_lo,H_hi,band_p10_log,band_p90_log,V,T,A,sensor,terra_only,gap_fill,additive,cloud_anom,cloud_underdetection,static_viirs,static_modis\n`;
let fillTotal = { snpp: 0, terra: 0, aqua: 0, terra_only: 0, additive: 0 };
const compact = { grid: index.grid, years: YEARS, terra_only_until: '2002-06', band_by_count: BINSET, band_by_region_class: RC, band_by_region_size: { size_classes: SIZE_CLASSES, TA: RS.TA, T: RS.T }, region_of_prov: REGION_OF, band: '80% prediction interval [H*exp(p10), H*exp(p90)] with p10/p90 from the bin containing the predicted count H in band_by_region_size[set][region][size_class]; size_class by the number of 0.25° cells inside the AOI (1 | 2-9 | 10-49 | 50-199 | 200+); region = region of the cells carrying the largest share of H; the whole country uses band_by_region_class[set].national.agg; clamp p10 <= 0 <= p90; set T before 2002-07, TA until 2011-12, none for observed VIIRS months; widen by |0.025*ONI| per side in reconstructed months. band_by_region_class and band_by_count are kept for reference', sigma_curve_by_cells_diagnostic: CURVES, note: SI_NOTE.slice(2), cells: {} };
const provSeries = {}; // prov -> { H:[y][m], var:[y][m], obs:[y][m], static:[y][m] }
const provAcc = p => (provSeries[p] ??= { n: 0, H: YEARS.map(() => Array(12).fill(0)), var: YEARS.map(() => Array(12).fill(0)), nodata: YEARS.map(() => Array(12).fill(true)), st: YEARS.map(() => Array(12).fill(0)), gf: YEARS.map(() => Array(12).fill(0)), ca: YEARS.map(() => Array(12).fill(0)), caw: YEARS.map(() => Array(12).fill(0)) });

for (const [cid, yrs] of Object.entries(agg.cells)) {
  const cell = +cid, prov = provOf.get(cell); if (!prov) continue;
  const fTA = F.cell.TA[cell], fT = F.cell.T[cell]; if (!fTA || !fT) continue;
  const reg = regionOf(prov);
  const aTA = F.add?.TA?.cell?.[cell], aT = F.add?.T?.cell?.[cell]; // additive term: expected VIIRS count when MODIS saw nothing
  const h = [], s = [], st = {}, gfc = {}, cld = {};
  provAcc(prov).n++;
  for (const y of YEARS) {
    const hy = Array(12).fill(-1), sy = Array(12).fill(0);
    for (let m = 1; m <= 12; m++) {
      const e = era(y, m); if (!e) continue;
      const r = yrs[y]?.[m] || Array(12).fill(0);
      const V = r[0], T = r[1], A = r[2], Vs = r[3], Ms = r[4] + r[5], Mso = r[9] || 0, Ato = r[10] || 0, Tao = r[11] || 0;
      let H, sig = 0, terra = 0, gf = 0, lo, hi, b10 = 0, b90 = 0, additive = 0;
      if (e === 'VIIRS') { H = V; lo = hi = H; if (Mso) { gf = fTA[m - 1][0] * Mso; H += gf; fillTotal.snpp += gf; const [q1, q9] = bandLog(gf, 'TA', reg, '1'); lo = V + gf * Math.exp(q1); hi = V + gf * Math.exp(q9); b10 = Math.log(lo / H); b90 = Math.log(hi / H); sig = 1; } }
      else if (e === 'MODIS->VIIRS-eq') {
        const k = rTA[prov]?.[m] ?? 0.55; const fillT = Ato * k, fillA = Tao / Math.max(k, 0.05);
        const adj = ensoAdj(y, m);
        H = fTA[m - 1][0] * (T + A + fillT + fillA) * adj; gf = fTA[m - 1][0] * (fillT + fillA) * adj; fillTotal.terra += fTA[m - 1][0] * fillT; fillTotal.aqua += fTA[m - 1][0] * fillA; sig = 1;
        if (T + A + fillT + fillA === 0 && aTA) { H = aTA[m - 1] * adj; additive = 1; fillTotal.additive += H; }
      } else {
        const od = outDays('Terra', y, m), scale = od ? dim(y, m) / Math.max(1, dim(y, m) - od) : 1;
        const adj = ensoAdj(y, m);
        H = fT[m - 1][0] * T * scale * adj; gf = fT[m - 1][0] * T * (scale - 1) * adj; fillTotal.terra_only += gf; sig = 1; terra = 1;
        if (T === 0 && aT) { H = aT[m - 1] * adj; additive = 1; fillTotal.additive += H; }
      }
      const ca = cloudAnom(cell, y, m, e); const under = ca !== null && ca > CLOUD_FLAG ? +(1 - Math.exp(-CLOUD_SLOPE * ca)).toFixed(3) : 0;
      if (under) { (cld[y] ??= Array(12).fill(0))[m - 1] = Math.round(100 * ca); cloudFlagged++; }
      if (e !== 'VIIRS') { const es = ensoSig(y, m); [b10, b90] = bandLog(H, terra ? 'T' : 'TA', reg, '1'); b10 -= es; b90 += es; if (under) b90 += CLOUD_SLOPE * ca; lo = H * Math.exp(b10); hi = H * Math.exp(b90); }
      hy[m - 1] = Math.round(H); sy[m - 1] = e === 'VIIRS' && !gf ? 0 : 1;
      if (Vs || Ms) (st[y] ??= Array(12).fill(0))[m - 1] = e === 'VIIRS' ? Vs : Ms;
      if (gf > 0.5) (gfc[y] ??= Array(12).fill(0))[m - 1] = Math.round(gf);
      if (H > 0.5 || V || T || A || Vs || Ms) cellsCsv += `${cell},"${prov}",${y},${m},${H.toFixed(1)},${sig ? lo.toFixed(1) : ''},${sig ? hi.toFixed(1) : ''},${sig ? b10.toFixed(3) : ''},${sig ? b90.toFixed(3) : ''},${V},${T},${A},${e},${terra},${gf ? gf.toFixed(1) : 0},${additive},${ca === null ? '' : ca},${under || 0},${e === 'VIIRS' ? Vs : ''},${Ms}\n`;
      const P = provAcc(prov), yi = y - Y0; P.H[yi][m - 1] += H; P.nodata[yi][m - 1] = false; P.st[yi][m - 1] += e === 'VIIRS' ? Vs : Ms; P.gf[yi][m - 1] += gf; if (ca !== null) { P.ca[yi][m - 1] += ca * Math.max(1, H); P.caw[yi][m - 1] += Math.max(1, H); }
    }
    h.push(hy); s.push(sy);
  }
  compact.cells[cell] = { p: prov, h, s, ...(Object.keys(st).length ? { st } : {}), ...(Object.keys(gfc).length ? { gf: gfc } : {}), ...(Object.keys(cld).length ? { cl: cld } : {}) };
}

// provinces + country
const AR = { n: N_CELLS_TOTAL, H: YEARS.map(() => Array(12).fill(0)), var: YEARS.map(() => Array(12).fill(0)), nodata: YEARS.map(() => Array(12).fill(true)), st: YEARS.map(() => Array(12).fill(0)), gf: YEARS.map(() => Array(12).fill(0)), ca: YEARS.map(() => Array(12).fill(0)), caw: YEARS.map(() => Array(12).fill(0)) };
for (const P of Object.values(provSeries)) for (let yi = 0; yi < YEARS.length; yi++) for (let m = 0; m < 12; m++) { AR.H[yi][m] += P.H[yi][m]; AR.var[yi][m] += P.var[yi][m]; if (!P.nodata[yi][m]) AR.nodata[yi][m] = false; AR.st[yi][m] += P.st[yi][m]; AR.gf[yi][m] += P.gf[yi][m]; AR.ca[yi][m] += P.ca[yi][m]; AR.caw[yi][m] += P.caw[yi][m]; }
provSeries['Argentina'] = AR;
let provCsv = `${SI_NOTE}\n# H_lo/H_hi = 80% prediction interval [H*exp(p10), H*exp(p90)] calibrated out-of-sample by predicted count, satellite set, fire-regime region and SIZE CLASS of the province (number of cells: 2-9 | 10-49 | 50-199 | 200+; band_calibration.json by_region_size; Argentina uses the national aggregate bins); lower bound clamped to H, widened by |0.025*ONI| per side in reconstructed months; empty for observed VIIRS months without gap fill. Tierra del Fuego: interval not verifiable (3 province-months with predicted count >= 30 in 2012-2023). factor_source = estimated (own weight >= 0.5 at province level for that month and set) or assigned (more than half of the factor is borrowed from the region: Tierra del Fuego, Ciudad Autónoma de Buenos Aires, and a few Terra-only months of Santa Cruz and Chubut)\nunit,n_cells,year,month,H,H_lo,H_hi,band_p10_log,band_p90_log,sensor,gap_fill,outage_days_terra,outage_days_aqua,outage_days_snpp,cloud_anom,cloud_underdetection,static,factor_source\n`;
const provW = (p, m, set) => p === 'Argentina' ? 1 : (F.prov[set]?.[p]?.[m - 1]?.w ?? 0); // own weight of the province factor for that month and set
const ASSIGNED_W = 0.5; // round 4: a factor that is mostly borrowed (own weight < 0.5) is labelled assigned (Tierra del Fuego's December factor rests on one event)
for (const [p, P] of Object.entries(provSeries)) for (let yi = 0; yi < YEARS.length; yi++) for (let m = 0; m < 12; m++) {
  if (P.nodata[yi][m]) continue;
  const yy = YEARS[yi], mm = m + 1, H = P.H[yi][m], gf = P.gf[yi][m], reg = p === 'Argentina' ? null : regionOf(p);
  let lo = '', hi = '', b10 = '', b90 = '';
  const caP = P.caw[yi][m] ? P.ca[yi][m] / P.caw[yi][m] : null, underP = caP !== null && caP > CLOUD_FLAG ? +(1 - Math.exp(-CLOUD_SLOPE * caP)).toFixed(3) : 0;
  if (yy < 2012 && H > 0) { const es = ensoSig(yy, mm); let [q1, q9] = bandLog(H, setOf(yy, mm), reg, p === 'Argentina' ? 'agg' : sizeClassOf(P.n)); q1 -= es; q9 += es; if (underP) q9 += CLOUD_SLOPE * caP; lo = (H * Math.exp(q1)).toFixed(1); hi = (H * Math.exp(q9)).toFixed(1); b10 = q1.toFixed(3); b90 = q9.toFixed(3); }
  else if (gf > 0 && H > 0) { const [q1, q9] = bandLog(gf, 'TA', reg, p === 'Argentina' ? 'agg' : sizeClassOf(P.n)); const l = H - gf + gf * Math.exp(q1), h = H - gf + gf * Math.exp(q9); lo = l.toFixed(1); hi = h.toFixed(1); b10 = Math.log(l / H).toFixed(3); b90 = Math.log(h / H).toFixed(3); }
  provCsv += `"${p}",${P.n},${yy},${mm},${H.toFixed(1)},${lo},${hi},${b10},${b90},${era(yy, mm)},${gf ? gf.toFixed(1) : 0},${outDays('Terra', yy, mm)},${yy > 2002 || (yy === 2002 && mm >= 7) ? outDays('Aqua', yy, mm) : ''},${yy >= 2012 ? outDays('SNPP', yy, mm) : ''},${caP === null ? '' : caP.toFixed(3)},${underP || 0},${P.st[yi][m]},${yy < 2012 ? (provW(p, mm, setOf(yy, mm)) >= ASSIGNED_W ? 'estimated' : 'assigned') : ''}\n`;
}
await writeFile(path.join(OUT, 'harmonized_cells.csv'), cellsCsv);
await writeFile(path.join(OUT, 'harmonized_provinces.csv'), provCsv);
const json = JSON.stringify(compact);
await writeFile(path.join(OUT, 'cells.json'), json);
await writeFile(path.join(OUT, 'cells.json.gz'), gzipSync(json, { level: 9 }));

// report: country annual totals with band
console.log(`cells: ${Object.keys(compact.cells).length} · cells.json ${(json.length / 1e6).toFixed(1)} MB (gz ${(gzipSync(json, { level: 9 }).length / 1e6).toFixed(2)} MB) · cells.csv ${(cellsCsv.length / 1e6).toFixed(1)} MB`);
if (BETA) console.log(`ENSO conditioning applied to 2000–2011: beta=${BETA} (H *= exp(beta*ONI))`);
if (CLOUD) console.log(`cloud obscuration flag: ${cloudFlagged} cell-months with cloud anomaly > +${CLOUD_FLAG} at the overpass (estimated under-detection 1 − exp(−3·Δ); upper bound widened in reconstructed months)`);
console.log(`gap fill (VIIRS-eq hotspots added): S-NPP outages ${Math.round(fillTotal.snpp)} · Terra outages ${Math.round(fillTotal.terra)} · Aqua outages ${Math.round(fillTotal.aqua)} · Terra-only era ${Math.round(fillTotal.terra_only)} · additive term (MODIS = 0 months) ${Math.round(fillTotal.additive)}`);
for (const set of ['TA', 'T']) for (const cls of ['cell', 'agg']) console.log(`80% interval national ${cls} (${set}): ` + RC[set].national[cls].map(b => `${b.P_min}+:[${(100 * (Math.exp(b.p10_log) - 1)).toFixed(0)}%,+${(100 * (Math.exp(b.p90_log) - 1)).toFixed(0)}%]`).join(' '));
for (const set of ['TA', 'T']) { console.log(`80% interval by predicted count, national pooled reference (${set}): ` + BINSET[set].map(b => `${b.P_min}+:[${(100 * (Math.exp(b.p10_log) - 1)).toFixed(0)}%,+${(100 * (Math.exp(b.p90_log) - 1)).toFixed(0)}%]`).join(' ')); for (const [reg, bins] of Object.entries(REGBINS[set])) console.log(`   ${reg.padEnd(15)} ` + bins.map(b => `${b.P_min}+:[${(100 * (Math.exp(b.p10_log) - 1)).toFixed(0)}%,+${(100 * (Math.exp(b.p90_log) - 1)).toFixed(0)}%]${b.source === 'pooled' ? '*' : ''}`).join(' ')); }
console.log('\nArgentina, annual VIIRS-equivalent hotspots (vegetation class); interval = sum of monthly 80% intervals (conservative):');
for (let yi = 0; yi < YEARS.length; yi++) {
  let H = 0, lo = 0, hi = 0, st = 0; const yy = YEARS[yi];
  for (let m = 0; m < 12; m++) { const h = AR.H[yi][m]; H += h; st += AR.st[yi][m]; if (yy < 2012 && h > 0) { const es = ensoSig(yy, m + 1); const [q1, q9] = bandLog(h, setOf(yy, m + 1), null, 'agg'); lo += h * Math.exp(q1 - es); hi += h * Math.exp(q9 + es); } else { lo += h; hi += h; } }
  console.log(`  ${yy}  ${String(Math.round(H)).padStart(7)}  [${Math.round(lo)}–${Math.round(hi)}]  ${era(yy, 12).padEnd(22)} static ${st}`);
}
