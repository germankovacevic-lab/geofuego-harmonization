// factors.js — hierarchical ratio-of-sums harmonization factors (used by 04_factors and 05_loyo).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Column layout of counts arrays (03_aggregate): [V,T,A,Vs,Ts,As, Vp,Tp,Ap, M_snppOut, A_terraOut, T_aquaOut].
// Calibration uses the PAIRED-day columns (6..8): days on which Terra, Aqua and S-NPP all operated.
//
// Hierarchy (log space, empirical-Bayes style shrinkage, w = n_eff / (n_eff + K), n_eff = Σ_y min(M, CAP)):
//   log f_region = w_r·log r_region + (1 − w_r)·log r_country
//   log f_prov   = w_p·log r_prov   + (1 − w_p)·log f_region        (region level can be disabled: useRegions=false)
//   log f_cell   = w_c·log r_cell   + (1 − w_c)·log f_prov
// r_L[m] = (Σ_y V + 0.5) / (Σ_y M + 0.5), valid if Σ_y M >= K_MIN. σ: interannual SD of the log ratio, shrunk the same way.
//
// ADDITIVE TERM for months where MODIS saw nothing (M = 0): a multiplicative model returns 0 there although VIIRS often saw
// fire (23 % of Terra-only cell-months with 5–15 expected). a[c,m] = expected VIIRS count given M = 0, estimated on the overlap
// as Σ_y V[c,m,y] / n0 over the years with M = 0 (paired days), shrunk cell → province → region → country with
// w = n0 / (n0 + K_ADD). Prediction: P = f·M + a·1[M = 0]; with additive=true the ratio f is fitted on M > 0 months only.
// TESTED AND NOT ADOPTED (14/11, LOYO): it improves single cells (Terra-only cell error 54 → 42 %) but degrades every
// aggregate (country 3.3 → 4.2 %, province 10.2 → 12.9 %, forward test 1.035 → 1.079, backward test 0.94–1.04 → 0.82–0.91):
// a constant term does not follow the year's activity the way f·M does. Default additive = false; kept as an option.

import { REGION_OF } from './regions.js';

export const SETS = { TA: r => (r[7] ?? 0) + (r[8] ?? 0), T: r => r[7] ?? 0 };
const BASE_SETS = SETS;
export const VCOL = 6;
// Day/night split sets (paired-day columns 12..17 = Vpd, Vpn, Tpd, Tpn, Apd, Apn), enabled with daynight=true:
//   TAd: Vd / (Td + Ad), TAn: Vn / (Tn + An); Td: Vd / Td, Tn: Vn / Tn. Prediction of a month = f_d·M_d + f_n·M_n.
export const SETS_DN = { TAd: r => (r[14] ?? 0) + (r[16] ?? 0), TAn: r => (r[15] ?? 0) + (r[17] ?? 0), Td: r => r[14] ?? 0, Tn: r => r[15] ?? 0 };
export const VCOL_DN = { TAd: 12, TAn: 13, Td: 12, Tn: 13 };
const mk = () => ({ V: 0, M: 0, neff: 0, logs: [], py: {} }); // py: year -> [V, M] for σ and n_eff at aggregate levels
const sd = xs => { if (xs.length < 2) return null; const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1)); };

// depth: 'cell' (full hierarchy, default) | 'prov' (no cell level) | 'region' | 'country' (national month factor only) — for ablation.
export function fitFactors(aggCells, provOf, { K = 10, CAP = 200, K_MIN = 5, years, useRegions = true, depth = 'cell', K_ADD = 3, additive = false, daynight = false }) {
  const D = { country: 0, region: 1, prov: 2, cell: 3 }[depth] ?? 3;
  const SETS = daynight ? { ...BASE_SETS, ...SETS_DN } : BASE_SETS;
  const vcol = s => VCOL_DN[s] ?? VCOL;
  const Z0 = {}; // additive accumulators: set -> level -> key -> [13] of {V, n0}
  for (const s of Object.keys(SETS)) Z0[s] = { cell: new Map(), prov: new Map(), region: new Map(), country: Array.from({ length: 13 }, () => ({ V: 0, n0: 0 })) };
  const Y = new Set(years);
  const acc = {};
  for (const s of Object.keys(SETS)) acc[s] = { cell: new Map(), prov: new Map(), region: new Map(), country: Array.from({ length: 13 }, mk) };
  const months = () => Array.from({ length: 13 }, mk);
  for (const [cid, yrs] of Object.entries(aggCells)) {
    const cell = +cid, prov = provOf.get(cell); if (!prov) continue;
    const region = REGION_OF[prov] || 'other';
    for (const s of Object.keys(SETS)) {
      const Mof = SETS[s], A = acc[s];
      if (!A.cell.has(cell)) A.cell.set(cell, months());
      if (!A.prov.has(prov)) A.prov.set(prov, months());
      if (!A.region.has(region)) A.region.set(region, months());
      const levels = [A.cell.get(cell), A.prov.get(prov), A.region.get(region), A.country];
      const Zc = Z0[s]; if (!Zc.cell.has(cell)) Zc.cell.set(cell, Array.from({ length: 13 }, () => ({ V: 0, n0: 0 }))); if (!Zc.prov.has(prov)) Zc.prov.set(prov, Array.from({ length: 13 }, () => ({ V: 0, n0: 0 }))); if (!Zc.region.has(region)) Zc.region.set(region, Array.from({ length: 13 }, () => ({ V: 0, n0: 0 })));
      const zl = [Zc.cell.get(cell), Zc.prov.get(prov), Zc.region.get(region), Zc.country];
      for (const y of Object.keys(yrs)) {
        if (!Y.has(+y)) continue;
        for (const [m, r] of Object.entries(yrs[y])) {
          const V0 = r[vcol(s)] ?? 0, M = Mof(r);
          // with the additive term, VIIRS counts of cell-months where MODIS saw nothing belong to the additive term, not to
          // the ratio (otherwise they are counted twice: once inside f, once in a)
          const V = additive && M === 0 ? 0 : V0;
          for (const L of levels) { L[m].V += V; L[m].M += M; const p = (L[m].py[y] ??= [0, 0]); p[0] += V; p[1] += M; }
          if (M === 0 && V0 > 0) for (const L of zl) { L[m].V += V0; L[m].n0++; }
        }
      }
    }
  }
  // n_eff and interannual logs from per-year sums at every level
  for (const s of Object.keys(SETS)) {
    const A = acc[s];
    const finish = L => { for (let m = 1; m <= 12; m++) for (const [V, M] of Object.values(L[m].py)) { L[m].neff += Math.min(M, CAP); if (M > 0) L[m].logs.push(Math.log((V + 0.5) / (M + 0.5))); } };
    for (const L of A.cell.values()) finish(L); for (const L of A.prov.values()) finish(L); for (const L of A.region.values()) finish(L); finish(A.country);
  }
  const logr = a => a.M >= K_MIN ? Math.log((a.V + 0.5) / (a.M + 0.5)) : null;
  const shrink = (node, parentF, parentS, enabled = true) => { // returns [f(log), σ, w] arrays indexed by month
    const f = [], sg = [], w = [];
    for (let m = 1; m <= 12; m++) {
      const lr = logr(node[m]); const wx = !enabled || lr === null ? 0 : node[m].neff / (node[m].neff + K);
      f[m] = wx * (lr ?? 0) + (1 - wx) * parentF[m]; const sx = sd(node[m].logs); sg[m] = Math.sqrt(wx * (sx ?? parentS[m]) ** 2 + (1 - wx) * parentS[m] ** 2); w[m] = wx;
    }
    return [f, sg, w];
  };
  const out = { country: {}, region: {}, prov: {}, cell: {}, level: {}, add: {}, meta: { K, CAP, K_MIN, K_ADD, additive, years, useRegions, depth } };
  // additive term: note n0 counts only cell-month-years with M = 0 AND V > 0; cell-month-years with M = 0 and V = 0 are not
  // observable as such in the sparse aggregation (absent entries). The expected count given M = 0 therefore needs the number
  // of overlap years with M = 0 for that cell-month, which includes the absent (V = 0) years: nYears − years with M > 0.
  if (additive) {
    const nY = years.length;
    for (const s of Object.keys(SETS)) {
      const Mof = SETS[s];
      // per cell-month: S = Σ_y V·1[M=0] (from Z0, entries with M=0 exist only when V>0), n0 = nY − |years with M>0|
      const yM = new Map(); // cell -> [13] Set(years with M>0)
      for (const [cid, yrs] of Object.entries(aggCells)) { const cell = +cid; if (!provOf.get(cell)) continue; for (const y of Object.keys(yrs)) { if (!Y.has(+y)) continue; for (const [m, r] of Object.entries(yrs[y])) if (Mof(r) > 0) { if (!yM.has(cell)) yM.set(cell, Array.from({ length: 13 }, () => new Set())); yM.get(cell)[m].add(y); } } }
      const agg2 = { prov: new Map(), region: new Map(), country: Array.from({ length: 13 }, () => [0, 0]) }; // [S, n0]
      const cellSN = new Map();
      for (const cell of new Set([...Z0[s].cell.keys(), ...yM.keys()])) {
        const prov = provOf.get(cell), region = REGION_OF[prov] || 'other'; const z = Z0[s].cell.get(cell), ym = yM.get(cell); const sn = [];
        for (let m = 1; m <= 12; m++) { const S = z ? z[m].V : 0, n0 = nY - (ym ? ym[m].size : 0); sn[m] = [S, n0];
          for (const [lvl, key] of [['prov', prov], ['region', region]]) { if (!agg2[lvl].has(key)) agg2[lvl].set(key, Array.from({ length: 13 }, () => [0, 0])); const t = agg2[lvl].get(key)[m]; t[0] += S; t[1] += n0; }
          agg2.country[m][0] += S; agg2.country[m][1] += n0; }
        cellSN.set(cell, sn);
      }
      const aC = []; for (let m = 1; m <= 12; m++) aC[m] = agg2.country[m][1] ? agg2.country[m][0] / agg2.country[m][1] : 0;
      const aR = new Map(); for (const [reg, t] of agg2.region) { const a = []; for (let m = 1; m <= 12; m++) { const w = t[m][1] / (t[m][1] + 100); a[m] = w * (t[m][1] ? t[m][0] / t[m][1] : 0) + (1 - w) * aC[m]; } aR.set(reg, a); }
      const aP = new Map(); for (const [prov, t] of agg2.prov) { const ra = aR.get(REGION_OF[prov] || 'other') || aC; const a = []; for (let m = 1; m <= 12; m++) { const w = t[m][1] / (t[m][1] + 30); a[m] = w * (t[m][1] ? t[m][0] / t[m][1] : 0) + (1 - w) * ra[m]; } aP.set(prov, a); }
      const cellA = {}; for (const [cell, sn] of cellSN) { const pa = aP.get(provOf.get(cell)) || aC; const rows = []; for (let m = 1; m <= 12; m++) { const [S, n0] = sn[m]; const w = n0 / (n0 + K_ADD); rows.push(+(w * (n0 ? S / n0 : 0) + (1 - w) * pa[m]).toFixed(3)); } cellA[cell] = rows; }
      out.add[s] = { cell: cellA, prov: Object.fromEntries([...aP].map(([p, a]) => [p, a.slice(1).map(x => +x.toFixed(3))])), country: aC.slice(1).map(x => +x.toFixed(3)) };
    }
  }
  for (const s of Object.keys(SETS)) {
    const C = acc[s].country, cF = [], cS = [];
    for (let m = 1; m <= 12; m++) { cF[m] = logr(C[m]) ?? Math.log(3.3); cS[m] = sd(C[m].logs) ?? 0.3; }
    out.country[s] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(cF[i + 1]).toFixed(4), sigma: +cS[i + 1].toFixed(4), V: C[i + 1].V, M: C[i + 1].M }));
    const RF = new Map(); out.region[s] = {};
    for (const [reg, R] of acc[s].region) {
      const [f, sg, w] = useRegions && D >= 1 ? shrink(R, cF, cS) : [cF, cS, Array(13).fill(0)];
      RF.set(reg, [f, sg]);
      out.region[s][reg] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(f[i + 1]).toFixed(4), sigma: +sg[i + 1].toFixed(4), w: +w[i + 1].toFixed(3), V: R[i + 1].V, M: R[i + 1].M }));
    }
    const PF = new Map(); out.prov[s] = {};
    for (const [prov, P] of acc[s].prov) {
      const [rf, rs] = RF.get(REGION_OF[prov] || 'other');
      const [f, sg, w] = shrink(P, rf, rs, D >= 2); PF.set(prov, [f, sg, w]);
      out.prov[s][prov] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(f[i + 1]).toFixed(4), sigma: +sg[i + 1].toFixed(4), w: +w[i + 1].toFixed(3), V: P[i + 1].V, M: P[i + 1].M }));
    }
    out.cell[s] = {}; out.level[s] = {};
    for (const [cell, A] of acc[s].cell) {
      const prov = provOf.get(cell), [pf, ps, pw] = PF.get(prov);
      const [f, sg, w] = shrink(A, pf, ps, D >= 3); const rows = [], lv = [];
      for (let m = 1; m <= 12; m++) { rows.push([+Math.exp(f[m]).toFixed(4), +sg[m].toFixed(4), A[m].neff, +w[m].toFixed(3)]); lv.push(logr(A[m]) !== null ? 'cell' : pw[m] > 0 ? 'prov' : (out.region[s][REGION_OF[prov] || 'other']?.[m - 1]?.w > 0 ? 'region' : 'country')); }
      out.cell[s][cell] = rows; out.level[s][cell] = lv;
    }
  }
  return out;
}
