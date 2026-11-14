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

import { REGION_OF } from './regions.js';

export const SETS = { TA: r => (r[7] ?? 0) + (r[8] ?? 0), T: r => r[7] ?? 0 };
export const VCOL = 6;
const mk = () => ({ V: 0, M: 0, neff: 0, logs: [], py: {} }); // py: year -> [V, M] for σ and n_eff at aggregate levels
const sd = xs => { if (xs.length < 2) return null; const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1)); };

export function fitFactors(aggCells, provOf, { K = 20, CAP = 200, K_MIN = 5, years, useRegions = true }) {
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
      for (const y of Object.keys(yrs)) {
        if (!Y.has(+y)) continue;
        for (const [m, r] of Object.entries(yrs[y])) {
          const V = r[VCOL] ?? 0, M = Mof(r);
          for (const L of levels) { L[m].V += V; L[m].M += M; const p = (L[m].py[y] ??= [0, 0]); p[0] += V; p[1] += M; }
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
  const shrink = (node, parentF, parentS) => { // returns [f(log), σ, w] arrays indexed by month
    const f = [], sg = [], w = [];
    for (let m = 1; m <= 12; m++) {
      const lr = logr(node[m]); const wx = lr === null ? 0 : node[m].neff / (node[m].neff + K);
      f[m] = wx * (lr ?? 0) + (1 - wx) * parentF[m]; const sx = sd(node[m].logs); sg[m] = Math.sqrt(wx * (sx ?? parentS[m]) ** 2 + (1 - wx) * parentS[m] ** 2); w[m] = wx;
    }
    return [f, sg, w];
  };
  const out = { country: {}, region: {}, prov: {}, cell: {}, level: {}, meta: { K, CAP, K_MIN, years, useRegions } };
  for (const s of Object.keys(SETS)) {
    const C = acc[s].country, cF = [], cS = [];
    for (let m = 1; m <= 12; m++) { cF[m] = logr(C[m]) ?? Math.log(3.3); cS[m] = sd(C[m].logs) ?? 0.3; }
    out.country[s] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(cF[i + 1]).toFixed(4), sigma: +cS[i + 1].toFixed(4), V: C[i + 1].V, M: C[i + 1].M }));
    const RF = new Map(); out.region[s] = {};
    for (const [reg, R] of acc[s].region) {
      const [f, sg, w] = useRegions ? shrink(R, cF, cS) : [cF, cS, Array(13).fill(0)];
      RF.set(reg, [f, sg]);
      out.region[s][reg] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(f[i + 1]).toFixed(4), sigma: +sg[i + 1].toFixed(4), w: +w[i + 1].toFixed(3), V: R[i + 1].V, M: R[i + 1].M }));
    }
    const PF = new Map(); out.prov[s] = {};
    for (const [prov, P] of acc[s].prov) {
      const [rf, rs] = RF.get(REGION_OF[prov] || 'other');
      const [f, sg, w] = shrink(P, rf, rs); PF.set(prov, [f, sg, w]);
      out.prov[s][prov] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(f[i + 1]).toFixed(4), sigma: +sg[i + 1].toFixed(4), w: +w[i + 1].toFixed(3), V: P[i + 1].V, M: P[i + 1].M }));
    }
    out.cell[s] = {}; out.level[s] = {};
    for (const [cell, A] of acc[s].cell) {
      const prov = provOf.get(cell), [pf, ps, pw] = PF.get(prov);
      const [f, sg, w] = shrink(A, pf, ps); const rows = [], lv = [];
      for (let m = 1; m <= 12; m++) { rows.push([+Math.exp(f[m]).toFixed(4), +sg[m].toFixed(4), A[m].neff, +w[m].toFixed(3)]); lv.push(logr(A[m]) !== null ? 'cell' : pw[m] > 0 ? 'prov' : (out.region[s][REGION_OF[prov] || 'other']?.[m - 1]?.w > 0 ? 'region' : 'country')); }
      out.cell[s][cell] = rows; out.level[s][cell] = lv;
    }
  }
  return out;
}
