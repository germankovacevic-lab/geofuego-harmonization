#!/usr/bin/env node
// 05_loyo.mjs — Leave-one-year-out validation of the harmonization factors, for BOTH satellite sets, with:
//   - k/cap sweep (--sweep), ablation ladder (--ablation), forward test on 2024–2025 (always),
//   - empirical band calibration: signed 10th/90th percentiles of log(V/P) BINNED BY PREDICTED COUNT, per set, pooled over
//     cell / province / country unit-months with P >= 5 (conditioning on the prediction, not on the outcome) → an asymmetric
//     80 % prediction interval that depends on the predicted count, not on the number of cells; coverage reported per province,
//   - split-window tests (train 2012–2017 → test 2018–2023 and the reverse): the error of EXTRAPOLATING in time,
//   - backward test inside the MODIS era: 2003–2011 Terra-only reconstruction f_T·T vs Terra+Aqua f_TA·(T+A),
//   - per-province season MAPE,
//   - regional band (ADOPTED): the same count-binned quantiles fitted per fire-regime region (lib/regions.js) for cell- and
//     province-level residuals (country stays pooled; bins with < 30 residuals fall back to pooled). The coverage of the pooled,
//     regional and region×level bands is measured out-of-sample for the band itself (quantiles from 11 years, coverage on the
//     12th), because the in-sample coverage of a quantile band is ≈ 80 % by construction and cannot tell them apart.
//     Result (TA): Patagonia cell-months 74 → 80 %, Pampa cells 73 → 79 %, Neuquén 74 → 82 %, Chubut 66 → 80 %; no province
//     below 77 %; Pampa/Cuyo provinces become conservative (85–94 %). Tierra del Fuego (3 province-months) is not verifiable.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// For each held-out year y* in the calibration window: fit factors on the other years, predict VIIRS-equivalent counts
// from MODIS (f·M) for y*, compare with observed VIIRS V (paired days) at country / province / cell level.
// Sets: TA = f_TA·(T+A) (used for 2002-07 → 2011); T = f_T·T (Terra only, used for 2000-11 → 2002-06).
// Band calibration: q80 = 80th percentile of |log(V/P)| over all out-of-sample unit-months (V ≥ threshold) per level and
// set. A symmetric band H·exp(±q80) then covers 80 % of out-of-sample values by construction; the table reports the
// coverage of the previous band (median·1.28) for transparency.
//
// Usage: node scripts/05_loyo.mjs [--years=2012-2023] [--k=10] [--sweep] [--ablation] [--no-regions] [--tag=x]
// Output: data/validation/loyo_summary{tag}.json/.csv, loyo_by_province{tag}.csv, loyo_folds{tag}.csv, band_calibration.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFactors } from '../lib/factors.js';
import { REGION_OF } from '../lib/regions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'validation');
await mkdir(OUT, { recursive: true });
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const SWEEP = process.argv.includes('--sweep'), ABLATION = process.argv.includes('--ablation'), useRegions = !process.argv.includes('--no-regions'), ADDITIVE = process.argv.includes('--additive'); // additive term tested and not adopted (see lib/factors.js)
const DAYNIGHT = process.argv.includes('--daynight'); // adds the day/night-split sets TAdn and Tdn to the evaluation
const TAG = arg('tag', ''), K0 = +arg('k', 10);
const [LY0, LY1] = arg('years', '2012-2023').split('-').map(Number);
const YEARS = []; for (let y = LY0; y <= LY1; y++) YEARS.push(y);
const FORWARD = [2024, 2025].filter(y => y > LY1);
const SEASON = [7, 8, 9, 10, 11], Z = 1.2816;
// Each province also gets its OWN fire season (the 5 calendar months with the highest mean observed VIIRS count over the
// window): Patagonia burns in Dec–Mar, not Jul–Nov, so the national season under-counts its fire and inflates its error.
const OWN_SEASON = {};
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const SETS = { TA: { V: r => r[6] ?? 0, M: r => (r[7] ?? 0) + (r[8] ?? 0) }, T: { V: r => r[6] ?? 0, M: r => r[7] ?? 0 },
  // day/night split: V = total paired VIIRS; prediction uses two factors (see predict)
  TAdn: { V: r => r[6] ?? 0, M: r => (r[7] ?? 0) + (r[8] ?? 0), d: 'TAd', n: 'TAn', Md: r => (r[14] ?? 0) + (r[16] ?? 0), Mn: r => (r[15] ?? 0) + (r[17] ?? 0) },
  Tdn: { V: r => r[6] ?? 0, M: r => r[7] ?? 0, d: 'Td', n: 'Tn', Md: r => r[14] ?? 0, Mn: r => r[15] ?? 0 } };
const EVAL_SETS = DAYNIGHT ? ['TA', 'T', 'TAdn', 'Tdn'] : ['TA', 'T'];
{ const clim = {}; for (const [cid, yrs] of Object.entries(agg.cells)) { const p = provOf.get(+cid); if (!p) continue; for (const y of YEARS) { const ym = yrs[y]; if (!ym) continue; for (const [m, r] of Object.entries(ym)) ((clim[p] ??= Array(13).fill(0)))[+m] += r[6] ?? 0; } }
  for (const [p, a] of Object.entries(clim)) OWN_SEASON[p] = a.map((v, m) => [v, m]).slice(1).sort((x, y) => y[0] - x[0]).slice(0, 5).map(x => x[1]).sort((x, y) => x - y); }
const THR = { cell: { season: 20, month: 10 }, prov: { season: 50, month: 30 }, country: { season: 50, month: 30 } };
const ZERO = Array(12).fill(0);
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const quant = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };

function predict(fit, set, yStar) { // -> { units: {cell,prov,country: Map(unit -> {V[13],P[13],S[13]})}, scalar }
  const base = SETS[set].d ? (set === 'TAdn' ? 'TA' : 'T') : set;
  let sV = 0, sM = 0; for (const c of fit.country[base]) { sV += c.V; sM += c.M; }
  const scalar = sV / sM;
  const units = { cell: new Map(), prov: new Map(), country: new Map([['AR', { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) }]]) };
  for (const [cid, yrs] of Object.entries(agg.cells)) {
    const cell = +cid, prov = provOf.get(cell); if (!prov) continue; const fc = fit.cell[base][cell]; if (!fc) continue;
    const fd = SETS[set].d ? fit.cell[SETS[set].d][cell] : null, fn = SETS[set].n ? fit.cell[SETS[set].n][cell] : null;
    const ym = yrs[yStar] || {}; const ac = fit.add?.[base]?.cell?.[cell];
    if (!ac && !yrs[yStar]) continue;
    if (!units.cell.has(cell)) units.cell.set(cell, { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) });
    if (!units.prov.has(prov)) units.prov.set(prov, { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) });
    // iterate ALL 12 months (absent entries = no detections by any sensor) so that the additive term is applied without
    // conditioning on the outcome; without the additive term absent months contribute 0 to both V and P
    for (let m = 1; m <= 12; m++) { const r = ym[m] || ZERO; const V = SETS[set].V(r), M = SETS[set].M(r); let P = M > 0 ? fc[m - 1][0] * M : (ac ? ac[m - 1] : 0);
      if (fd && fn) P = fd[m - 1][0] * SETS[set].Md(r) + fn[m - 1][0] * SETS[set].Mn(r);
      if (!V && !P && !M) continue; for (const u of [units.cell.get(cell), units.prov.get(prov), units.country.get('AR')]) { u.V[m] += V; u.P[m] += P; u.S[m] += scalar * M; } }
  }
  return { units, scalar };
}
function metrics(units, level, resid, year) {
  const ape = [], apeS = [], monthly = [], monthlyS = []; let sumV = 0, sumP = 0, sumS = 0; const perUnit = {};
  for (const [name, u] of units[level]) {
    if (resid) for (let m = 1; m <= 12; m++) if (u.P[m] >= 1) resid.push({ P: u.P[m], r: Math.log((u.V[m] + 0.5) / (u.P[m] + 0.5)), unit: name, level, y: year });
    const sV = SEASON.reduce((a, m) => a + u.V[m], 0), sP = SEASON.reduce((a, m) => a + u.P[m], 0), sS = SEASON.reduce((a, m) => a + u.S[m], 0);
    if (sV >= THR[level].season) { ape.push(Math.abs(sP - sV) / sV); apeS.push(Math.abs(sS - sV) / sV); perUnit[name] = Math.abs(sP - sV) / sV; }
    if (level === 'prov' && OWN_SEASON[name]) { const oV = OWN_SEASON[name].reduce((a, m) => a + u.V[m], 0), oP = OWN_SEASON[name].reduce((a, m) => a + u.P[m], 0); if (oV >= THR.prov.season) perUnit[name + '|own'] = Math.abs(oP - oV) / oV; }
    for (let m = 1; m <= 12; m++) if (u.V[m] >= THR[level].month) { monthly.push(Math.abs(u.P[m] - u.V[m]) / u.V[m]); monthlyS.push(Math.abs(u.S[m] - u.V[m]) / u.V[m]); }
    sumV += u.V.reduce((a, b) => a + b, 0); sumP += u.P.reduce((a, b) => a + b, 0); sumS += u.S.reduce((a, b) => a + b, 0);
  }
  return { n_units: ape.length, season_mape: ape.length ? ape.reduce((a, b) => a + b, 0) / ape.length : null, season_mape_scalar: apeS.length ? apeS.reduce((a, b) => a + b, 0) / apeS.length : null, monthly_median_ape: median(monthly), monthly_median_ape_scalar: median(monthlyS), annual_ratio: sumP / sumV, annual_ratio_scalar: sumS / sumV, perUnit };
}

const configs = SWEEP ? [10, 20, 50].flatMap(K => [100, 200, 500].map(CAP => ({ K, CAP, depth: 'cell' }))) : ABLATION ? ['country', 'region', 'prov', 'cell'].map(depth => ({ K: K0, CAP: 200, depth })) : [{ K: K0, CAP: 200, depth: 'cell' }];
const folds = [], provFolds = {}, resid = {}; const t0 = Date.now();
const fitCache = new Map();
for (const cfg of configs) for (const set of EVAL_SETS) {
  for (const yStar of YEARS) {
    const ck = `${cfg.K}|${cfg.CAP}|${cfg.depth}|${yStar}`;
    if (!fitCache.has(ck)) fitCache.set(ck, fitFactors(agg.cells, provOf, { K: cfg.K, CAP: cfg.CAP, years: YEARS.filter(y => y !== yStar), useRegions, depth: cfg.depth, additive: ADDITIVE, daynight: DAYNIGHT }));
    const fit = fitCache.get(ck);
    const { units, scalar } = predict(fit, set, yStar);
    for (const level of ['country', 'prov', 'cell']) {
      const isBase = cfg.K === K0 && cfg.CAP === 200 && cfg.depth === 'cell';
      const r = metrics(units, level, isBase ? (resid[set] ??= []) : null, yStar);
      if (level === 'prov' && isBase) for (const [p, e] of Object.entries(r.perUnit)) (provFolds[`${set}|${p}`] ??= []).push(e); // keys 'prov' and 'prov|own'
      delete r.perUnit;
      folds.push({ set, K: cfg.K, CAP: cfg.CAP, depth: cfg.depth, year: yStar, level, scalar: +scalar.toFixed(3), ...r });
    }
  }
  process.stderr.write(`${set} k=${cfg.K} cap=${cfg.CAP} depth=${cfg.depth} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
// summary per config × set × level
const summary = [];
for (const cfg of configs) for (const set of EVAL_SETS) for (const level of ['country', 'prov', 'cell']) {
  const rows = folds.filter(r => r.set === set && r.K === cfg.K && r.CAP === cfg.CAP && r.depth === cfg.depth && r.level === level);
  const mean = k => rows.reduce((a, r) => a + (r[k] ?? 0), 0) / rows.length;
  summary.push({ set, K: cfg.K, CAP: cfg.CAP, depth: cfg.depth, level, season_mape: +mean('season_mape').toFixed(4), season_mape_scalar: +mean('season_mape_scalar').toFixed(4), monthly_median_ape: +mean('monthly_median_ape').toFixed(4), monthly_median_ape_scalar: +mean('monthly_median_ape_scalar').toFixed(4), annual_ratio_min: +Math.min(...rows.map(r => r.annual_ratio)).toFixed(3), annual_ratio_max: +Math.max(...rows.map(r => r.annual_ratio)).toFixed(3), annual_ratio_rms_dev: +Math.sqrt(rows.reduce((a, r) => a + (r.annual_ratio - 1) ** 2, 0) / rows.length).toFixed(4) });
}
// band calibration from out-of-sample residuals (base config): per set, (a) per level: quantiles of |log| (reference),
// (b) BINNED BY PREDICTED COUNT, pooled over levels: signed p10 / p50 / p90 → the band used by 06_harmonize and the app.
const BINS = [1, 5, 15, 40, 100, 300, 1000, 3000, 1e12]; // 1–5 added (round 3): reconstructed cell-months with H < 5 were borrowing the 5–15 bin
const binOf = P => { for (let i = 0; i < BINS.length - 1; i++) if (P < BINS[i + 1]) return i; return BINS.length - 2; };
const band = {}, coverage = {};
for (const [set, recs] of Object.entries(resid)) {
  band[set] = { by_level: {}, by_count: [] };
  for (const level of ['country', 'prov', 'cell']) {
    const rs = recs.filter(x => x.level === level && x.P >= (level === 'cell' ? 10 : 30)).map(x => x.r); if (!rs.length) continue;
    const abs = rs.map(Math.abs);
    band[set].by_level[level] = { n: rs.length, median_abs_log: +median(abs).toFixed(4), q80_abs_log: +quant(abs, 0.8).toFixed(4), p10_log: +quant(rs, 0.1).toFixed(4), p90_log: +quant(rs, 0.9).toFixed(4), bias_median_log: +median(rs).toFixed(4), sigma_equiv_for_80pct: +(quant(abs, 0.8) / Z).toFixed(4) };
  }
  for (let i = 0; i < BINS.length - 1; i++) {
    const rs = recs.filter(x => binOf(x.P) === i).map(x => x.r); if (rs.length < 30) continue;
    band[set].by_count.push({ P_min: BINS[i], P_max: BINS[i + 1] === 1e12 ? null : BINS[i + 1], n: rs.length, p10_log: +quant(rs, 0.1).toFixed(4), p50_log: +quant(rs, 0.5).toFixed(4), p90_log: +quant(rs, 0.9).toFixed(4), share_V_zero: +(recs.filter(x => binOf(x.P) === i && Math.exp(x.r) * (x.P + 0.5) - 0.5 < 0.5).length / rs.length).toFixed(3) });
  }
  // coverage of the count-binned band, per province (province-months with P >= 30) and per level
  const cov = (arr) => { let inside = 0, n = 0; for (const x of arr) { const b = band[set].by_count.find(c => x.P >= c.P_min && (c.P_max === null || x.P < c.P_max)); if (!b) continue; n++; if (x.r >= b.p10_log && x.r <= b.p90_log) inside++; } return n ? +(inside / n).toFixed(3) : null; };
  coverage[set] = { by_level: Object.fromEntries(['country', 'prov', 'cell'].map(l => [l, cov(recs.filter(x => x.level === l))])), by_province: {} };
  const provs = [...new Set(recs.filter(x => x.level === 'prov').map(x => x.unit))];
  for (const p of provs) coverage[set].by_province[p] = cov(recs.filter(x => x.level === 'prov' && x.unit === p && x.P >= 30));
}
// ---- regional band test (pending item 4): Patagonia is under-covered by the pooled bins (dominated by the Chaco and the Litoral).
// Fit the same count bins per fire-regime region (cell- and province-level residuals of that region; country stays pooled);
// bins with fewer than MIN_BIN residuals fall back to the pooled bin. Coverage is measured OUT-OF-SAMPLE FOR THE BAND:
// for each year, quantiles from the other 11 years' residuals, coverage on that year's residuals (both bands, same folds).
const MIN_BIN = 30;
const regionOfRec = x => x.level === 'cell' ? (REGION_OF[provOf.get(x.unit)] || null) : x.level === 'prov' ? (REGION_OF[x.unit] || null) : null;
const fitBins = recs => { const out = Array(BINS.length - 1).fill(null); for (let i = 0; i < BINS.length - 1; i++) { const rs = recs.filter(x => binOf(x.P) === i).map(x => x.r); if (rs.length < MIN_BIN) continue; out[i] = { P_min: BINS[i], P_max: BINS[i + 1] === 1e12 ? null : BINS[i + 1], n: rs.length, p10_log: +quant(rs, 0.1).toFixed(4), p50_log: +quant(rs, 0.5).toFixed(4), p90_log: +quant(rs, 0.9).toFixed(4) }; } return out; };
const fitRegional = recs => Object.fromEntries(Object.values(REGION_OF).filter((v, i, a) => a.indexOf(v) === i).map(reg => [reg, fitBins(recs.filter(x => regionOfRec(x) === reg))]));
// variant: region × level (province residuals separate from cell residuals), falling back to region (any level), then pooled
const fitRegionalLevel = recs => Object.fromEntries(Object.values(REGION_OF).filter((v, i, a) => a.indexOf(v) === i).flatMap(reg => ['prov', 'cell'].map(l => [`${reg}|${l}`, fitBins(recs.filter(x => regionOfRec(x) === reg && x.level === l))])));
const inside = (x, b) => b ? (x.r >= b.p10_log && x.r <= b.p90_log ? 1 : 0) : null;
// variant D (round 3, low-count aggregates): region × CLASS, class = 'cell' (one 0.25° cell) or 'agg' (any aggregate of cells:
// province, country, user AOI). A cell with P >= 1 is a selected over-prediction (median residual −0.4 at 5–15); an aggregate
// with a small total is under-predicted (the structural zeros of its other cells add VIIRS to V but nothing to P). Pooling
// the two gave 65 % coverage for province-months with P < 30. Fallback chain: region|class → national|class → region → pooled.
const classOf = x => x.level === 'cell' ? 'cell' : 'agg';
const fitClass = recs => { const out = {}; for (const cls of ['cell', 'agg']) { out[`national|${cls}`] = fitBins(recs.filter(x => classOf(x) === cls)); for (const reg of Object.values(REGION_OF).filter((v, i, a) => a.indexOf(v) === i)) out[`${reg}|${cls}`] = fitBins(recs.filter(x => classOf(x) === cls && regionOfRec(x) === reg)); } return out; };
const pickClass = (C, R, Pl, x, i) => { const reg = regionOfRec(x), cls = classOf(x); return (reg && C[`${reg}|${cls}`]?.[i]) || C[`national|${cls}`]?.[i] || (reg && R[reg]?.[i]) || Pl[i]; };
const regionalTest = {};
for (const [set, recs] of Object.entries(resid)) {
  const pooledAll = fitBins(recs), regionalAll = fitRegional(recs), regionalLevelAll = fitRegionalLevel(recs), classAll = fitClass(recs);
  // coverage accumulators: key -> [inside_pooled, inside_regional, inside_regional_level, inside_class, n]
  const acc = {}; const add = (key, ip, ir, il, ic) => { if (ip === null || ir === null || il === null || ic === null) return; const a = (acc[key] ??= [0, 0, 0, 0, 0]); a[0] += ip; a[1] += ir; a[2] += il; a[3] += ic; a[4]++; };
  for (const y of YEARS) {
    const train = recs.filter(x => x.y !== y), test = recs.filter(x => x.y === y);
    const pooled = fitBins(train), regional = fitRegional(train), regionalLevel = fitRegionalLevel(train), cls = fitClass(train);
    for (const x of test) {
      const i = binOf(x.P), reg = regionOfRec(x); const bp = pooled[i], br = (reg && regional[reg][i]) || pooled[i], bl = (reg && regionalLevel[`${reg}|${x.level}`]?.[i]) || br, bc = pickClass(cls, regional, pooled, x, i);
      const ip = inside(x, bp), ir = inside(x, br), il = inside(x, bl), ic = inside(x, bc);
      if (x.P >= (x.level === 'cell' ? 10 : 30)) { add(`level|${x.level}`, ip, ir, il, ic); if (reg) add(`region|${reg}|${x.level}`, ip, ir, il, ic); }
      if (x.level === 'prov' && x.P >= 30) add(`prov|${x.unit}`, ip, ir, il, ic);
      if (x.level === 'prov' && x.P < 30 && x.P >= 5) add(`lowcount|prov P 5-30`, ip, ir, il, ic);
      if (x.level === 'cell' && x.P < 5) add(`lowcount|cell P 1-5`, ip, ir, il, ic);
      if (x.level === 'cell' && x.P >= 5 && x.P < 15) add(`lowcount|cell P 5-15`, ip, ir, il, ic);
      if (x.level === 'prov') add(`lowcount|prov all P>=1`, ip, ir, il, ic);
    }
  }
  const fmt = a => ({ n: a[4], pooled: +(a[0] / a[4]).toFixed(3), regional: +(a[1] / a[4]).toFixed(3), regional_level: +(a[2] / a[4]).toFixed(3), region_class: +(a[3] / a[4]).toFixed(3) });
  const pick = pre => Object.fromEntries(Object.entries(acc).filter(([k]) => k.startsWith(pre)).map(([k, a]) => [k.slice(pre.length), fmt(a)]));
  const withSource = (obj, src) => Object.fromEntries(Object.entries(obj).map(([k, bins]) => [k, bins.map((b, i) => b ? { ...b, source: src } : { P_min: BINS[i], P_max: BINS[i + 1] === 1e12 ? null : BINS[i + 1], source: 'fallback (n < ' + MIN_BIN + ')' })]));
  regionalTest[set] = { min_bin: MIN_BIN, bins_regional: withSource(regionalAll, 'region'), bins_regional_level: withSource(regionalLevelAll, 'region|level'), bins_region_class: withSource(classAll, 'region|class'), bins_pooled: pooledAll.filter(Boolean),
    coverage_oos: { by_level: pick('level|'), by_region_level: pick('region|'), by_province: pick('prov|'), low_count: pick('lowcount|') } };
  // Variant A (adopted 14:25): regional bins, any level. Bins with n < MIN_BIN residuals carry the pooled values (source 'pooled').
  band[set].by_region = Object.fromEntries(Object.entries(regionalAll).map(([reg, bins]) => [reg, bins.map((b, i) => { const q = band[set].by_count.find(x => x.P_min === BINS[i]); return b ? { ...b, source: 'region' } : { P_min: q.P_min, P_max: q.P_max, n: q.n, p10_log: q.p10_log, p50_log: q.p50_log, p90_log: q.p90_log, source: 'pooled' }; })]));
  // Variant D (round 3): region × class bins with the fallback chain resolved, so that 06 and the app only look up [region][class][bin]
  band[set].by_region_class = {}; const resolveD = (key, reg, cls) => Array.from({ length: BINS.length - 1 }, (_, i) => { const own = classAll[key]?.[i]; if (own) return { ...own, source: 'region|class' }; const nat = classAll[`national|${cls}`]?.[i]; if (nat) return { ...nat, source: 'national|class' }; const rg = reg && regionalAll[reg]?.[i]; if (rg) return { ...rg, source: 'region' }; const q = band[set].by_count.find(x => x.P_min === BINS[i]); return { P_min: q.P_min, P_max: q.P_max, n: q.n, p10_log: q.p10_log, p50_log: q.p50_log, p90_log: q.p90_log, source: 'pooled' }; });
  for (const reg of [...Object.values(REGION_OF).filter((v, i, a) => a.indexOf(v) === i), 'national']) band[set].by_region_class[reg] = { cell: resolveD(`${reg}|cell`, reg === 'national' ? null : reg, 'cell'), agg: resolveD(`${reg}|agg`, reg === 'national' ? null : reg, 'agg') };
}
// split-window tests: extrapolation in time (base config)
const half = Math.floor(YEARS.length / 2), W1 = YEARS.slice(0, half), W2 = YEARS.slice(half);
const split = {};
for (const [name, train, test] of [['train_early_test_late', W1, W2], ['train_late_test_early', W2, W1]]) {
  const fit = fitFactors(agg.cells, provOf, { K: K0, CAP: 200, years: train, useRegions, additive: ADDITIVE });
  split[name] = { train: [train[0], train.at(-1)], test: {} };
  for (const set of ['TA', 'T']) { const ys = {}; for (const y of test) { const { units } = predict(fit, set, y); ys[y] = { country_pred_over_obs: +metrics(units, 'country').annual_ratio.toFixed(3), prov_season_mape: +metrics(units, 'prov').season_mape.toFixed(4) }; } const vals = Object.values(ys); split[name].test[set] = { per_year: ys, country_pred_over_obs_mean: +(vals.reduce((a, v) => a + v.country_pred_over_obs, 0) / vals.length).toFixed(3), prov_season_mape_mean: +(vals.reduce((a, v) => a + v.prov_season_mape, 0) / vals.length).toFixed(4) }; }
}
// backward test inside the MODIS era: 2003–2011, Terra-only reconstruction vs Terra+Aqua reconstruction (all days)
const backward = {};
{ const fit = fitFactors(agg.cells, provOf, { K: K0, CAP: 200, years: YEARS, useRegions }); const provLog = [];
  for (let y = 2003; y <= 2011; y++) {
    let sT = 0, sTA = 0; const pu = new Map();
    for (const [cid, yrs] of Object.entries(agg.cells)) { const cell = +cid, prov = provOf.get(cell); const ym = yrs[y]; if (!ym || !prov) continue; const fT = fit.cell.T[cell], fTA = fit.cell.TA[cell]; if (!fT || !fTA) continue;
      for (const [m, r] of Object.entries(ym)) { const pT = fT[m - 1][0] * r[1], pTA = fTA[m - 1][0] * (r[1] + r[2]); sT += pT; sTA += pTA; const u = (pu.get(prov) ?? pu.set(prov, [0, 0]).get(prov)); u[0] += pT; u[1] += pTA; } }
    backward[y] = { terra_only_over_terra_aqua: +(sT / sTA).toFixed(3) };
    for (const [, [a, b]] of pu) if (b >= 50) provLog.push(Math.abs(Math.log((a + 0.5) / (b + 0.5))));
  }
  backward.summary = { country_min: Math.min(...Object.values(backward).filter(v => v.terra_only_over_terra_aqua).map(v => v.terra_only_over_terra_aqua)), country_max: Math.max(...Object.values(backward).filter(v => v.terra_only_over_terra_aqua).map(v => v.terra_only_over_terra_aqua)), province_year_q80_abs_log: +quant(provLog, 0.8).toFixed(3), n_province_years: provLog.length };
}
// forward test: factors from the full window applied to 2024, 2025 — including the coverage of the final 80 % interval
// (regional bins for cells and provinces, pooled for the country) on those two years, which were used neither for the
// factors nor for the bins: the cleanest coverage evidence available.
const forward = {};
if (FORWARD.length) { const fit = fitFactors(agg.cells, provOf, { K: K0, CAP: 200, years: YEARS, useRegions, additive: ADDITIVE }); for (const set of ['TA', 'T']) for (const y of FORWARD) { const { units } = predict(fit, set, y); const c = metrics(units, 'country'), p = metrics(units, 'prov');
    const covF = {}; for (const level of ['country', 'prov', 'cell']) { let inside = 0, n = 0; const thr = level === 'cell' ? 10 : 30; for (const [name, u] of units[level]) { const reg = level === 'cell' ? REGION_OF[provOf.get(name)] : level === 'prov' ? REGION_OF[name] : null; const cls = level === 'cell' ? 'cell' : 'agg'; const bins = band[set]?.by_region_class?.[reg || 'national']?.[cls] || band[set]?.by_region_class?.national?.[cls] || band[set]?.by_count; if (!bins) continue; for (let m = 1; m <= 12; m++) { const P = u.P[m]; if (P < thr) continue; const b = bins[binOf(P)] || bins.find(x => P >= x.P_min && (x.P_max === null || P < x.P_max)); if (!b) continue; const r = Math.log((u.V[m] + 0.5) / (P + 0.5)); n++; if (r >= b.p10_log && r <= b.p90_log) inside++; } } covF[level] = n ? { coverage: +(inside / n).toFixed(3), n } : null; }
    (forward[set] ??= {})[y] = { country_pred_over_obs: +c.annual_ratio.toFixed(3), prov_season_mape: +p.season_mape.toFixed(4), country_monthly_median_ape: +c.monthly_median_ape.toFixed(4), interval_coverage: covF }; } }
const byProv = Object.entries(provFolds).filter(([k]) => !k.endsWith('|own')).map(([k, arr]) => { const [set, prov] = k.split('|'); const own = provFolds[`${set}|${prov}|own`] || []; return { set, prov, n_folds: arr.length, season_mape_mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(4), season_mape_median: +median(arr).toFixed(4), own_season_months: (OWN_SEASON[prov] || []).join('-'), own_season_mape_mean: own.length ? +(own.reduce((a, b) => a + b, 0) / own.length).toFixed(4) : null, own_season_mape_median: own.length ? +median(own).toFixed(4) : null }; });
const toCsv = rows => Object.keys(rows[0]).join(',') + '\n' + rows.map(r => Object.values(r).map(v => v === null ? '' : typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',')).join('\n') + '\n';
await writeFile(path.join(OUT, `loyo_folds${TAG}.csv`), toCsv(folds));
await writeFile(path.join(OUT, `loyo_summary${TAG}.csv`), toCsv(summary));
if (byProv.length) await writeFile(path.join(OUT, `loyo_by_province${TAG}.csv`), toCsv(byProv));
await writeFile(path.join(OUT, `loyo_summary${TAG}.json`), JSON.stringify({ generated: new Date().toISOString(), years: YEARS, season: SEASON, K: K0, configs, useRegions, summary, by_province: byProv, band_calibration: band, band_coverage: coverage, split_window: split, backward_test_2003_2011: backward, forward_test: forward, folds }, null, 1));
  if (!SWEEP && !ABLATION && !TAG && !DAYNIGHT) await writeFile(path.join(OUT, 'band_calibration.json'), JSON.stringify({ generated: new Date().toISOString(), years: YEARS, z: Z, note: 'by_count: signed p10/p90 of log(V/P) of out-of-sample unit-months binned by PREDICTED count P (pooled cell/province/country), per satellite set; used for the country. by_region: the same bins per fire-regime region (cell+province residuals of the region; source=pooled where n<30); used for cells, provinces and user AOIs (region with the largest predicted count). 80% prediction interval = [P*exp(p10), P*exp(p90)]. by_level: reference quantiles. band_coverage: in-sample coverage of the pooled band. regional_band_test: coverage of pooled / regional / region×level bands measured out-of-sample for the band (leave-one-year-out on the residuals).', band, band_coverage: coverage, regional_band_test: regionalTest, split_window: split, backward_test_2003_2011: backward, forward_test: forward }, null, 1));

const pct = x => (100 * x).toFixed(1).padStart(5) + '%';
console.log(`LOYO ${YEARS.length} folds (${YEARS[0]}–${YEARS.at(-1)}) · season Jul–Nov · K=${K0} · additive=${ADDITIVE} · ${configs.length} config(s) · sets TA and T\n`);
console.log('set K   CAP  depth    level     season MAPE  (scalar)   monthly med|err| (scalar)   annual pred/obs range  rms');
for (const s of summary) console.log(`${s.set.padEnd(3)} ${String(s.K).padEnd(3)} ${String(s.CAP).padEnd(4)} ${s.depth.padEnd(8)} ${s.level.padEnd(8)}  ${pct(s.season_mape)}  (${pct(s.season_mape_scalar)})   ${pct(s.monthly_median_ape)}  (${pct(s.monthly_median_ape_scalar)})     ${s.annual_ratio_min}–${s.annual_ratio_max}   ${s.annual_ratio_rms_dev}`);
if (Object.keys(band).length) {
  console.log('\nband by predicted count (signed log residual quantiles, pooled levels): set  P range      n     p10     p50     p90   share V=0');
  for (const set of Object.keys(band)) for (const b of band[set].by_count) console.log(`  ${set.padEnd(3)} ${String(b.P_min).padStart(5)}–${String(b.P_max ?? '∞').padEnd(6)} ${String(b.n).padStart(6)}  ${b.p10_log.toFixed(3).padStart(6)}  ${b.p50_log.toFixed(3).padStart(6)}  ${b.p90_log.toFixed(3).padStart(6)}   ${pct(b.share_V_zero)}`);
  console.log('\ncoverage of the count-binned 80 % interval (out-of-sample): set  country  prov  cell  | provinces min…max');
  for (const set of Object.keys(coverage)) { const c = coverage[set]; const pv = Object.entries(c.by_province).filter(([, v]) => v !== null).sort((a, b) => a[1] - b[1]); console.log(`  ${set.padEnd(3)} ${pct(c.by_level.country)}  ${pct(c.by_level.prov)}  ${pct(c.by_level.cell)}  | ${pv[0]?.[0].split(',')[0]} ${pct(pv[0]?.[1])} … ${pv.at(-1)?.[0].split(',')[0]} ${pct(pv.at(-1)?.[1])}`); }
  console.log('\nregional band test — coverage measured out-of-sample for the band itself (quantiles from 11 years, coverage on the 12th):');
  for (const [set, t] of Object.entries(regionalTest)) {
    const tri = v => `pooled ${pct(v.pooled)} → region ${pct(v.regional)} → region×level ${pct(v.regional_level)} → region×class ${pct(v.region_class)}`;
    console.log(`  ${set}  LOW COUNTS (the round-3 defect):`); for (const [k, v] of Object.entries(t.coverage_oos.low_count)) console.log(`     ${k.padEnd(16)} ${tri(v)}  (n ${v.n})`);
    console.log(`  ${set}  by level: ` + Object.entries(t.coverage_oos.by_level).map(([l, v]) => `${l}: ${tri(v)} (n ${v.n})`).join(' · '));
    console.log(`  ${set}  by region (prov-months | cell-months):`);
    for (const reg of Object.keys(t.bins_regional)) { const p = t.coverage_oos.by_region_level[`${reg}|prov`], c = t.coverage_oos.by_region_level[`${reg}|cell`]; console.log(`     ${reg.padEnd(15)} prov ${p ? tri(p) : '-'} (n ${p?.n ?? 0}) | cell ${c ? tri(c) : '-'} (n ${c?.n ?? 0})`); }
    console.log(`  ${set}  by province (province-months with P ≥ 30), sorted by pooled coverage:`);
    for (const [p, v] of Object.entries(t.coverage_oos.by_province).sort((a, b) => a[1].pooled - b[1].pooled)) console.log(`     ${p.split(',')[0].slice(0, 22).padEnd(22)} ${tri(v)}  (n ${v.n})`);
    const pat = t.bins_regional['Patagonia'];
    console.log(`  ${set}  patagonia bins vs pooled (p10 / p50 / p90 in log):`);
    for (let i = 0; i < pat.length; i++) { const b = pat[i], q = t.bins_pooled.find(x => x.P_min === BINS[i]); console.log(`     ${String(BINS[i]).padStart(5)}+  pooled ${q ? `${q.p10_log.toFixed(2)} / ${q.p50_log.toFixed(2)} / ${q.p90_log.toFixed(2)} (n ${q.n})` : '-'.padEnd(28)}  | patagonia ${b.source === 'region' ? `${b.p10_log.toFixed(2)} / ${b.p50_log.toFixed(2)} / ${b.p90_log.toFixed(2)} (n ${b.n})` : b.source}`); }
  }
  console.log('\nsplit-window (extrapolation in time), country pred/obs mean and province season MAPE:');
  for (const [name, s] of Object.entries(split)) for (const set of ['TA', 'T']) console.log(`  ${name.padEnd(24)} ${set.padEnd(3)} train ${s.train.join('–')}: pred/obs ${s.test[set].country_pred_over_obs_mean}  prov MAPE ${pct(s.test[set].prov_season_mape_mean)}   per year ${Object.entries(s.test[set].per_year).map(([y, v]) => `${y}:${v.country_pred_over_obs}`).join(' ')}`);
  console.log(`\nbackward test 2003–2011 (Terra-only / Terra+Aqua reconstruction, country): ${Object.entries(backward).filter(([k]) => k !== 'summary').map(([y, v]) => `${y}:${v.terra_only_over_terra_aqua}`).join(' ')}  | range ${backward.summary.country_min}–${backward.summary.country_max}, province-year q80|log| ${backward.summary.province_year_q80_abs_log}`);
}
if (Object.keys(forward).length) { console.log('\nforward test (factors from the full window applied to years never used; interval coverage with the final bins):'); for (const set of Object.keys(forward)) for (const [y, f] of Object.entries(forward[set])) console.log(`  ${set} ${y}: country pred/obs ${f.country_pred_over_obs}  province season MAPE ${pct(f.prov_season_mape)}  country monthly med|err| ${pct(f.country_monthly_median_ape)}  | 80% interval coverage: ${['country', 'prov', 'cell'].map(l => `${l} ${f.interval_coverage[l] ? pct(f.interval_coverage[l].coverage) + ' (n ' + f.interval_coverage[l].n + ')' : '-'}`).join(' · ')}`); }
if (byProv.length && !SWEEP && !ABLATION) { console.log('\nper-province MAPE (TA, mean over folds): national season Jul–Nov | own 5-month season'); for (const r of byProv.filter(r => r.set === 'TA').sort((a, b) => a.prov.localeCompare(b.prov))) console.log(`  ${r.prov.split(',')[0].slice(0, 22).padEnd(22)} ${pct(r.season_mape_mean)} (med ${pct(r.season_mape_median)})  | own ${r.own_season_months.padEnd(12)} ${r.own_season_mape_mean === null ? '    -' : pct(r.own_season_mape_mean)} (med ${r.own_season_mape_median === null ? '-' : pct(r.own_season_mape_median)})`); }
