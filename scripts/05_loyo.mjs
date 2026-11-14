#!/usr/bin/env node
// 05_loyo.mjs — Leave-one-year-out validation of the harmonization factors, for BOTH satellite sets, with:
//   - k/cap sweep (--sweep), ablation ladder (--ablation), forward test on 2024–2025 (always),
//   - empirical band calibration: signed 10th/90th percentiles of log(V/P) BINNED BY PREDICTED COUNT, per set, pooled over
//     cell / province / country unit-months with P >= 5 (conditioning on the prediction, not on the outcome) → an asymmetric
//     80 % prediction interval that depends on the predicted count, not on the number of cells; coverage reported per province,
//   - split-window tests (train 2012–2017 → test 2018–2023 and the reverse): the error of EXTRAPOLATING in time,
//   - backward test inside the MODIS era: 2003–2011 Terra-only reconstruction f_T·T vs Terra+Aqua f_TA·(T+A),
//   - per-province season MAPE.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'validation');
await mkdir(OUT, { recursive: true });
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const SWEEP = process.argv.includes('--sweep'), ABLATION = process.argv.includes('--ablation'), useRegions = !process.argv.includes('--no-regions');
const TAG = arg('tag', ''), K0 = +arg('k', 10);
const [LY0, LY1] = arg('years', '2012-2023').split('-').map(Number);
const YEARS = []; for (let y = LY0; y <= LY1; y++) YEARS.push(y);
const FORWARD = [2024, 2025].filter(y => y > LY1);
const SEASON = [7, 8, 9, 10, 11], Z = 1.2816;
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const SETS = { TA: { V: r => r[6] ?? 0, M: r => (r[7] ?? 0) + (r[8] ?? 0) }, T: { V: r => r[6] ?? 0, M: r => r[7] ?? 0 } };
const THR = { cell: { season: 20, month: 10 }, prov: { season: 50, month: 30 }, country: { season: 50, month: 30 } };
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const quant = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };

function predict(fit, set, yStar) { // -> { units: {cell,prov,country: Map(unit -> {V[13],P[13],S[13]})}, scalar }
  let sV = 0, sM = 0; for (const c of fit.country[set]) { sV += c.V; sM += c.M; }
  const scalar = sV / sM;
  const units = { cell: new Map(), prov: new Map(), country: new Map([['AR', { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) }]]) };
  for (const [cid, yrs] of Object.entries(agg.cells)) {
    const cell = +cid, prov = provOf.get(cell); if (!prov) continue; const ym = yrs[yStar]; if (!ym) continue; const fc = fit.cell[set][cell]; if (!fc) continue;
    if (!units.cell.has(cell)) units.cell.set(cell, { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) });
    if (!units.prov.has(prov)) units.prov.set(prov, { V: Array(13).fill(0), P: Array(13).fill(0), S: Array(13).fill(0) });
    for (const [m, r] of Object.entries(ym)) { const V = SETS[set].V(r), M = SETS[set].M(r), P = fc[m - 1][0] * M; for (const u of [units.cell.get(cell), units.prov.get(prov), units.country.get('AR')]) { u.V[m] += V; u.P[m] += P; u.S[m] += scalar * M; } }
  }
  return { units, scalar };
}
function metrics(units, level, resid) {
  const ape = [], apeS = [], monthly = [], monthlyS = []; let sumV = 0, sumP = 0, sumS = 0; const perUnit = {};
  for (const [name, u] of units[level]) {
    if (resid) for (let m = 1; m <= 12; m++) if (u.P[m] >= 5) resid.push({ P: u.P[m], r: Math.log((u.V[m] + 0.5) / (u.P[m] + 0.5)), unit: name, level });
    const sV = SEASON.reduce((a, m) => a + u.V[m], 0), sP = SEASON.reduce((a, m) => a + u.P[m], 0), sS = SEASON.reduce((a, m) => a + u.S[m], 0);
    if (sV >= THR[level].season) { ape.push(Math.abs(sP - sV) / sV); apeS.push(Math.abs(sS - sV) / sV); perUnit[name] = Math.abs(sP - sV) / sV; }
    for (let m = 1; m <= 12; m++) if (u.V[m] >= THR[level].month) { monthly.push(Math.abs(u.P[m] - u.V[m]) / u.V[m]); monthlyS.push(Math.abs(u.S[m] - u.V[m]) / u.V[m]); }
    sumV += u.V.reduce((a, b) => a + b, 0); sumP += u.P.reduce((a, b) => a + b, 0); sumS += u.S.reduce((a, b) => a + b, 0);
  }
  return { n_units: ape.length, season_mape: ape.length ? ape.reduce((a, b) => a + b, 0) / ape.length : null, season_mape_scalar: apeS.length ? apeS.reduce((a, b) => a + b, 0) / apeS.length : null, monthly_median_ape: median(monthly), monthly_median_ape_scalar: median(monthlyS), annual_ratio: sumP / sumV, annual_ratio_scalar: sumS / sumV, perUnit };
}

const configs = SWEEP ? [10, 20, 50].flatMap(K => [100, 200, 500].map(CAP => ({ K, CAP, depth: 'cell' }))) : ABLATION ? ['country', 'region', 'prov', 'cell'].map(depth => ({ K: K0, CAP: 200, depth })) : [{ K: K0, CAP: 200, depth: 'cell' }];
const folds = [], provFolds = {}, resid = {}; const t0 = Date.now();
for (const cfg of configs) for (const set of ['TA', 'T']) {
  for (const yStar of YEARS) {
    const fit = fitFactors(agg.cells, provOf, { K: cfg.K, CAP: cfg.CAP, years: YEARS.filter(y => y !== yStar), useRegions, depth: cfg.depth });
    const { units, scalar } = predict(fit, set, yStar);
    for (const level of ['country', 'prov', 'cell']) {
      const isBase = cfg.K === K0 && cfg.CAP === 200 && cfg.depth === 'cell';
      const r = metrics(units, level, isBase ? (resid[set] ??= []) : null);
      if (level === 'prov' && isBase) for (const [p, e] of Object.entries(r.perUnit)) (provFolds[`${set}|${p}`] ??= []).push(e);
      delete r.perUnit;
      folds.push({ set, K: cfg.K, CAP: cfg.CAP, depth: cfg.depth, year: yStar, level, scalar: +scalar.toFixed(3), ...r });
    }
  }
  process.stderr.write(`${set} k=${cfg.K} cap=${cfg.CAP} depth=${cfg.depth} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
// summary per config × set × level
const summary = [];
for (const cfg of configs) for (const set of ['TA', 'T']) for (const level of ['country', 'prov', 'cell']) {
  const rows = folds.filter(r => r.set === set && r.K === cfg.K && r.CAP === cfg.CAP && r.depth === cfg.depth && r.level === level);
  const mean = k => rows.reduce((a, r) => a + (r[k] ?? 0), 0) / rows.length;
  summary.push({ set, K: cfg.K, CAP: cfg.CAP, depth: cfg.depth, level, season_mape: +mean('season_mape').toFixed(4), season_mape_scalar: +mean('season_mape_scalar').toFixed(4), monthly_median_ape: +mean('monthly_median_ape').toFixed(4), monthly_median_ape_scalar: +mean('monthly_median_ape_scalar').toFixed(4), annual_ratio_min: +Math.min(...rows.map(r => r.annual_ratio)).toFixed(3), annual_ratio_max: +Math.max(...rows.map(r => r.annual_ratio)).toFixed(3), annual_ratio_rms_dev: +Math.sqrt(rows.reduce((a, r) => a + (r.annual_ratio - 1) ** 2, 0) / rows.length).toFixed(4) });
}
// band calibration from out-of-sample residuals (base config): per set, (a) per level: quantiles of |log| (reference),
// (b) BINNED BY PREDICTED COUNT, pooled over levels: signed p10 / p50 / p90 → the band used by 06_harmonize and the app.
const BINS = [5, 15, 40, 100, 300, 1000, 3000, 1e12];
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
// split-window tests: extrapolation in time (base config)
const half = Math.floor(YEARS.length / 2), W1 = YEARS.slice(0, half), W2 = YEARS.slice(half);
const split = {};
for (const [name, train, test] of [['train_early_test_late', W1, W2], ['train_late_test_early', W2, W1]]) {
  const fit = fitFactors(agg.cells, provOf, { K: K0, CAP: 200, years: train, useRegions });
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
// forward test: factors from the full window applied to 2024, 2025
const forward = {};
if (FORWARD.length) { const fit = fitFactors(agg.cells, provOf, { K: K0, CAP: 200, years: YEARS, useRegions }); for (const set of ['TA', 'T']) for (const y of FORWARD) { const { units } = predict(fit, set, y); const c = metrics(units, 'country'), p = metrics(units, 'prov'); (forward[set] ??= {})[y] = { country_pred_over_obs: +c.annual_ratio.toFixed(3), prov_season_mape: +p.season_mape.toFixed(4), country_monthly_median_ape: +c.monthly_median_ape.toFixed(4) }; } }
const byProv = Object.entries(provFolds).map(([k, arr]) => { const [set, prov] = k.split('|'); return { set, prov, n_folds: arr.length, season_mape_mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(4), season_mape_median: +median(arr).toFixed(4) }; });
const toCsv = rows => Object.keys(rows[0]).join(',') + '\n' + rows.map(r => Object.values(r).map(v => v === null ? '' : typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',')).join('\n') + '\n';
await writeFile(path.join(OUT, `loyo_folds${TAG}.csv`), toCsv(folds));
await writeFile(path.join(OUT, `loyo_summary${TAG}.csv`), toCsv(summary));
if (byProv.length) await writeFile(path.join(OUT, `loyo_by_province${TAG}.csv`), toCsv(byProv));
await writeFile(path.join(OUT, `loyo_summary${TAG}.json`), JSON.stringify({ generated: new Date().toISOString(), years: YEARS, season: SEASON, K: K0, configs, useRegions, summary, by_province: byProv, band_calibration: band, band_coverage: coverage, split_window: split, backward_test_2003_2011: backward, forward_test: forward, folds }, null, 1));
if (!SWEEP && !ABLATION && !TAG) await writeFile(path.join(OUT, 'band_calibration.json'), JSON.stringify({ generated: new Date().toISOString(), years: YEARS, z: Z, note: 'by_count: signed p10/p90 of log(V/P) of out-of-sample unit-months binned by PREDICTED count P (pooled cell/province/country), per satellite set. 80% prediction interval = [P*exp(p10), P*exp(p90)]. by_level: reference quantiles. band_coverage: fraction of out-of-sample months inside that interval.', band, band_coverage: coverage, split_window: split, backward_test_2003_2011: backward, forward_test: forward }, null, 1));

const pct = x => (100 * x).toFixed(1).padStart(5) + '%';
console.log(`LOYO ${YEARS.length} folds (${YEARS[0]}–${YEARS.at(-1)}) · season Jul–Nov · K=${K0} · ${configs.length} config(s) · sets TA and T\n`);
console.log('set K   CAP  depth    level     season MAPE  (scalar)   monthly med|err| (scalar)   annual pred/obs range  rms');
for (const s of summary) console.log(`${s.set.padEnd(3)} ${String(s.K).padEnd(3)} ${String(s.CAP).padEnd(4)} ${s.depth.padEnd(8)} ${s.level.padEnd(8)}  ${pct(s.season_mape)}  (${pct(s.season_mape_scalar)})   ${pct(s.monthly_median_ape)}  (${pct(s.monthly_median_ape_scalar)})     ${s.annual_ratio_min}–${s.annual_ratio_max}   ${s.annual_ratio_rms_dev}`);
if (Object.keys(band).length) {
  console.log('\nband by predicted count (signed log residual quantiles, pooled levels): set  P range      n     p10     p50     p90   share V=0');
  for (const set of Object.keys(band)) for (const b of band[set].by_count) console.log(`  ${set.padEnd(3)} ${String(b.P_min).padStart(5)}–${String(b.P_max ?? '∞').padEnd(6)} ${String(b.n).padStart(6)}  ${b.p10_log.toFixed(3).padStart(6)}  ${b.p50_log.toFixed(3).padStart(6)}  ${b.p90_log.toFixed(3).padStart(6)}   ${pct(b.share_V_zero)}`);
  console.log('\ncoverage of the count-binned 80 % interval (out-of-sample): set  country  prov  cell  | provinces min…max');
  for (const set of Object.keys(coverage)) { const c = coverage[set]; const pv = Object.entries(c.by_province).filter(([, v]) => v !== null).sort((a, b) => a[1] - b[1]); console.log(`  ${set.padEnd(3)} ${pct(c.by_level.country)}  ${pct(c.by_level.prov)}  ${pct(c.by_level.cell)}  | ${pv[0]?.[0].split(',')[0]} ${pct(pv[0]?.[1])} … ${pv.at(-1)?.[0].split(',')[0]} ${pct(pv.at(-1)?.[1])}`); }
  console.log('\nsplit-window (extrapolation in time), country pred/obs mean and province season MAPE:');
  for (const [name, s] of Object.entries(split)) for (const set of ['TA', 'T']) console.log(`  ${name.padEnd(24)} ${set.padEnd(3)} train ${s.train.join('–')}: pred/obs ${s.test[set].country_pred_over_obs_mean}  prov MAPE ${pct(s.test[set].prov_season_mape_mean)}   per year ${Object.entries(s.test[set].per_year).map(([y, v]) => `${y}:${v.country_pred_over_obs}`).join(' ')}`);
  console.log(`\nbackward test 2003–2011 (Terra-only / Terra+Aqua reconstruction, country): ${Object.entries(backward).filter(([k]) => k !== 'summary').map(([y, v]) => `${y}:${v.terra_only_over_terra_aqua}`).join(' ')}  | range ${backward.summary.country_min}–${backward.summary.country_max}, province-year q80|log| ${backward.summary.province_year_q80_abs_log}`);
}
if (Object.keys(forward).length) { console.log('\nforward test (factors from the full window applied to years never used):'); for (const set of Object.keys(forward)) for (const [y, f] of Object.entries(forward[set])) console.log(`  ${set} ${y}: country pred/obs ${f.country_pred_over_obs}  province season MAPE ${pct(f.prov_season_mape)}  country monthly med|err| ${pct(f.country_monthly_median_ape)}`); }
if (byProv.length && !SWEEP && !ABLATION) { console.log('\nper-province season MAPE (TA, mean over folds):'); for (const r of byProv.filter(r => r.set === 'TA').sort((a, b) => a.prov.localeCompare(b.prov))) console.log(`  ${r.prov.split(',')[0].slice(0, 22).padEnd(22)} ${pct(r.season_mape_mean)}  (median ${pct(r.season_mape_median)})`); }
