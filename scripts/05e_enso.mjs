#!/usr/bin/env node
// 05e_enso.mjs — Does the VIIRS/MODIS ratio depend on the ENSO phase of the year? Three tests.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Hypothesis (team, from GeoFuego/GFI experience): in dry (La Niña) years much more small, fragmented fire burns
// (pasture, dried wetlands, field edges) which VIIRS detects and MODIS misses → higher ratio; in wet years mostly large
// forest fire remains → lower ratio. If true, a phase-blind factor biases the reconstruction of e.g. 2008–09 (La Niña).
//   Test 1  correlation of the annual and monthly log(V/M) with ONI (NOAA CPC, 3-month centred), country and regions.
//   Test 2  leave-one-PHASE-out: fit on the other phases, predict the held-out phase's years; bias and error vs LOYO.
//   Test 3  ENSO-conditioned factor: log f = log f_base(cell,month) + β_region · ONI(month); β fitted on training years
//           from monthly residuals at region level; validated by LOYO against the baseline (same folds).
// Output: data/validation/enso_tests.json, enso_beta.json (if adopted, used by 06)

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFactors } from '../lib/factors.js';
import { REGION_OF } from '../lib/regions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'validation');
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const YEARS = []; for (let y = 2012; y <= 2023; y++) YEARS.push(y);
const SEASON = [7, 8, 9, 10, 11];

// ---- ONI: season label → centre month ----
const SEAS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'];
const ONI = {}; // 'YYYY-M' -> anomaly
for (const line of (await readFile(path.join(process.env.HOME, '.openclaw', 'data', 'firms_ar', 'oni.ascii.txt'), 'utf8')).split('\n').slice(1)) {
  const f = line.trim().split(/\s+/); if (f.length < 4) continue; const m = SEAS.indexOf(f[0]) + 1; if (!m) continue; ONI[`${f[1]}-${m}`] = +f[3];
}
const oni = (y, m) => ONI[`${y}-${m}`];
const oniSeason = y => SEASON.reduce((a, m) => a + oni(y, m), 0) / SEASON.length;
const phase = y => { const o = oniSeason(y); return o >= 0.5 ? 'Niño' : o <= -0.5 ? 'Niña' : 'neutral'; };
const PH = Object.fromEntries(YEARS.map(y => [y, phase(y)]));

// ---- helpers: region/country monthly V and M (paired days) per year ----
const regOf = cid => REGION_OF[provOf.get(+cid)] || 'other';
const RM = {}; // region -> year -> month -> [V, M]
for (const [cid, yrs] of Object.entries(agg.cells)) { const prov = provOf.get(+cid); if (!prov) continue; const reg = regOf(cid); for (const y of YEARS) { const ym = yrs[y]; if (!ym) continue; for (const [m, r] of Object.entries(ym)) { for (const k of [reg, 'Argentina']) { const o = (((RM[k] ??= {})[y] ??= {})[m] ??= [0, 0]); o[0] += r[6] ?? 0; o[1] += (r[7] ?? 0) + (r[8] ?? 0); } } } }
const pearson = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };

// ---- Test 1 ----
const t1 = {};
for (const k of Object.keys(RM)) {
  const ann = YEARS.map(y => { let V = 0, M = 0; for (const [m, [v, mm]] of Object.entries(RM[k][y] || {})) { V += v; M += mm; } return { y, r: Math.log((V + 0.5) / (M + 0.5)), o: oniSeason(y), ratio: +(V / M).toFixed(3) }; });
  const mon = []; for (const y of YEARS) for (let m = 1; m <= 12; m++) { const vm = RM[k][y]?.[m]; if (!vm || vm[1] < 100) continue; mon.push({ r: Math.log((vm[0] + 0.5) / (vm[1] + 0.5)), o: oni(y, m) }); }
  // monthly: remove the calendar-month mean first (seasonality), then correlate residual with ONI
  const byM = {}; for (const y of YEARS) for (let m = 1; m <= 12; m++) { const vm = RM[k][y]?.[m]; if (!vm || vm[1] < 100) continue; (byM[m] ??= []).push({ r: Math.log((vm[0] + 0.5) / (vm[1] + 0.5)), o: oni(y, m) }); }
  const res = []; for (const arr of Object.values(byM)) { const mu = arr.reduce((a, b) => a + b.r, 0) / arr.length; for (const x of arr) res.push({ r: x.r - mu, o: x.o }); }
  t1[k] = { annual_r: +pearson(ann.map(a => a.r), ann.map(a => a.o)).toFixed(3), monthly_resid_r: +pearson(res.map(a => a.r), res.map(a => a.o)).toFixed(3), n_months: res.length, by_year: ann.map(a => ({ y: a.y, ratio: a.ratio, oni: +a.o.toFixed(2), phase: PH[a.y] })) };
}

// ---- generic evaluation of a factor model on a set of test years ----
function evaluate(fitFn, testYears) { // fitFn(trainYears) -> { fit, beta(region)->number }
  const out = { prov_season_ape: [], annual_pred: 0, annual_obs: 0, per_year: {} };
  for (const yStar of testYears) {
    const { fit, beta } = fitFn(YEARS.filter(y => !testYears.includes(y)), yStar);
    const units = new Map(); let sP = 0, sV = 0;
    for (const [cid, yrs] of Object.entries(agg.cells)) {
      const prov = provOf.get(+cid); if (!prov) continue; const ym = yrs[yStar]; if (!ym) continue; const fc = fit.cell.TA[+cid]; if (!fc) continue;
      const b = beta ? (beta[regOf(cid)] ?? 0) : 0;
      if (!units.has(prov)) units.set(prov, { V: Array(13).fill(0), P: Array(13).fill(0) });
      const u = units.get(prov);
      for (const [m, r] of Object.entries(ym)) { const V = r[6] ?? 0, M = (r[7] ?? 0) + (r[8] ?? 0); const P = fc[m - 1][0] * M * Math.exp(b * oni(yStar, +m)); u.V[m] += V; u.P[m] += P; sP += P; sV += V; }
    }
    const apes = []; for (const u of units.values()) { const v = SEASON.reduce((a, m) => a + u.V[m], 0), p = SEASON.reduce((a, m) => a + u.P[m], 0); if (v >= 50) apes.push(Math.abs(p - v) / v); }
    out.prov_season_ape.push(...apes); out.annual_pred += sP; out.annual_obs += sV; out.per_year[yStar] = { prov_mape: +(apes.reduce((a, b) => a + b, 0) / apes.length).toFixed(4), pred_over_obs: +(sP / sV).toFixed(3), phase: PH[yStar] };
  }
  out.prov_mape = +(out.prov_season_ape.reduce((a, b) => a + b, 0) / out.prov_season_ape.length).toFixed(4); out.pred_over_obs = +(out.annual_pred / out.annual_obs).toFixed(3); delete out.prov_season_ape; delete out.annual_pred; delete out.annual_obs;
  return out;
}
const baseFit = (train) => ({ fit: fitFactors(agg.cells, provOf, { K: 20, CAP: 200, years: train }), beta: null });
// ENSO-conditioned: β per region from monthly residuals (log V − log(f_base·M)) vs ONI, weighted by M, on training years
const COUNTRY_BETA = process.argv.includes('--country-beta');
function ensoFit(train) {
  const fit = fitFactors(agg.cells, provOf, { K: 20, CAP: 200, years: train });
  const acc = {}; // region -> {sxy, sxx}
  for (const [cid, yrs] of Object.entries(agg.cells)) {
    const prov = provOf.get(+cid); if (!prov) continue; const reg = regOf(cid); const fc = fit.cell.TA[+cid]; if (!fc) continue;
    for (const y of train) { const ym = yrs[y]; if (!ym) continue; for (const [m, r] of Object.entries(ym)) { const V = r[6] ?? 0, M = (r[7] ?? 0) + (r[8] ?? 0); if (M < 5) continue; const P = fc[m - 1][0] * M; const resid = Math.log((V + 0.5) / (P + 0.5)), o = oni(y, +m); const a = (acc[reg] ??= { sxy: 0, sxx: 0, n: 0 }); const w = Math.min(M, 200); a.sxy += w * resid * o; a.sxx += w * o * o; a.n++; } }
  }
  const beta = {};
  if (COUNTRY_BETA) { let sxy = 0, sxx = 0; for (const a of Object.values(acc)) { sxy += a.sxy; sxx += a.sxx; } const b = sxx ? sxy / sxx : 0; for (const reg of Object.keys(acc)) beta[reg] = b; }
  else for (const [reg, a] of Object.entries(acc)) beta[reg] = a.sxx ? a.sxy / a.sxx : 0;
  return { fit, beta };
}

// ---- Test 2: leave-one-phase-out (baseline model) ----
const t2 = {};
for (const ph of ['Niña', 'Niño', 'neutral']) { const test = YEARS.filter(y => PH[y] === ph); if (test.length < 2) continue; t2[ph] = { test_years: test, ...evaluate(baseFit, test) }; }
// same years but standard LOYO (each year alone) for comparison
const loyoBase = {}; for (const y of YEARS) loyoBase[y] = evaluate(baseFit, [y]).per_year[y];
for (const ph of Object.keys(t2)) { const ys = t2[ph].test_years; t2[ph].loyo_same_years = { prov_mape: +(ys.reduce((a, y) => a + loyoBase[y].prov_mape, 0) / ys.length).toFixed(4), pred_over_obs_mean: +(ys.reduce((a, y) => a + loyoBase[y].pred_over_obs, 0) / ys.length).toFixed(3) }; }

// ---- Test 3: ENSO-conditioned factor, LOYO vs baseline ----
const t3 = { baseline: {}, enso: {} };
const lb = [], le = [];
for (const y of YEARS) { const e = evaluate(ensoFit, [y]).per_year[y]; t3.baseline[y] = loyoBase[y]; t3.enso[y] = e; lb.push(loyoBase[y]); le.push(e); }
const summ = arr => ({ prov_mape_mean: +(arr.reduce((a, r) => a + r.prov_mape, 0) / arr.length).toFixed(4), pred_over_obs_min: +Math.min(...arr.map(r => r.pred_over_obs)).toFixed(3), pred_over_obs_max: +Math.max(...arr.map(r => r.pred_over_obs)).toFixed(3), pred_over_obs_sd: +Math.sqrt(arr.reduce((a, r) => a + (r.pred_over_obs - 1) ** 2, 0) / arr.length).toFixed(4) });
t3.summary = { baseline: summ(lb), enso: summ(le), beta_all_years: ensoFit(YEARS).beta };

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, COUNTRY_BETA ? 'enso_tests_country_beta.json' : 'enso_tests.json'), JSON.stringify({ generated: new Date().toISOString(), phases: PH, test1: t1, test2: t2, test3: t3 }, null, 1));

// ---- report ----
console.log('phase by year (ONI Jul–Nov mean): ' + YEARS.map(y => `${y}:${PH[y][0]}${oniSeason(y) >= 0 ? '+' : ''}${oniSeason(y).toFixed(1)}`).join(' '));
console.log('\nTEST 1 — correlation of log(V/M) with ONI:   region            annual r   monthly-residual r (n)');
for (const [k, v] of Object.entries(t1)) console.log(`   ${k.padEnd(18)} ${String(v.annual_r).padStart(7)}   ${String(v.monthly_resid_r).padStart(7)} (${v.n_months})`);
console.log('   Argentina by year: ' + t1.Argentina.by_year.map(a => `${a.y} ${a.ratio}`).join(' · '));
console.log('\nTEST 2 — leave-one-phase-out (baseline factor):  phase    years            prov MAPE  pred/obs   | same years in LOYO: MAPE  pred/obs');
for (const [ph, v] of Object.entries(t2)) console.log(`   ${ph.padEnd(8)} ${v.test_years.join(',').padEnd(30)} ${(100 * v.prov_mape).toFixed(1).padStart(6)}%   ${v.pred_over_obs.toFixed(3)}    | ${(100 * v.loyo_same_years.prov_mape).toFixed(1).padStart(6)}%  ${v.loyo_same_years.pred_over_obs_mean.toFixed(3)}`);
console.log('\nTEST 3 — ENSO-conditioned factor vs baseline (LOYO, 12 folds):');
console.log(`   baseline: prov MAPE ${(100 * t3.summary.baseline.prov_mape_mean).toFixed(1)}%  pred/obs ${t3.summary.baseline.pred_over_obs_min}–${t3.summary.baseline.pred_over_obs_max} (rms dev ${t3.summary.baseline.pred_over_obs_sd})`);
console.log(`   ENSO:     prov MAPE ${(100 * t3.summary.enso.prov_mape_mean).toFixed(1)}%  pred/obs ${t3.summary.enso.pred_over_obs_min}–${t3.summary.enso.pred_over_obs_max} (rms dev ${t3.summary.enso.pred_over_obs_sd})`);
console.log('   β per region (all years): ' + Object.entries(t3.summary.beta_all_years).map(([r, b]) => `${r} ${b.toFixed(3)}`).join(' · '));
console.log('   per year  base MAPE / ENSO MAPE   base p/o / ENSO p/o');
for (const y of YEARS) console.log(`   ${y} ${PH[y].padEnd(7)} ${(100 * t3.baseline[y].prov_mape).toFixed(1).padStart(5)}% / ${(100 * t3.enso[y].prov_mape).toFixed(1).padStart(5)}%     ${t3.baseline[y].pred_over_obs.toFixed(3)} / ${t3.enso[y].pred_over_obs.toFixed(3)}`);
