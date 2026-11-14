// factors.js — hierarchical ratio-of-sums harmonization factors (shared by 04_factors and 05_loyo).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
// See scripts/04_factors.mjs header for the method; counts arrays are [V, T, A, Vs, Ts, As] (static class ignored here).

export const SETS = { TA: r => r[1] + r[2], T: r => r[1] };
const mk = () => ({ V: 0, M: 0, neff: 0, logs: [] });
const sd = xs => { if (xs.length < 2) return null; const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1)); };

/**
 * @param aggCells  counts.json .cells  { cellId: { year: { month: [V,T,A,...] } } }
 * @param provOf    Map cellId -> province
 * @param opts      { K, CAP, K_MIN, years: number[] }
 * @returns { country: {set: [12]{f,sigma,V,M}}, prov: {set: {prov: [12]{f,sigma,w,V,M}}}, cell: {set: {cellId: [12][f,sigma,neff,w]}}, level: {set:{cellId:[12]string}} }
 */
export function fitFactors(aggCells, provOf, { K = 20, CAP = 200, K_MIN = 5, years }) {
  const Y = new Set(years);
  const acc = {};
  for (const s of Object.keys(SETS)) acc[s] = { cell: new Map(), prov: new Map(), country: Array.from({ length: 13 }, mk), perYear: { prov: new Map(), country: Array.from({ length: 13 }, () => ({})) } };
  for (const [cid, yrs] of Object.entries(aggCells)) {
    const cell = +cid, prov = provOf.get(cell); if (!prov) continue;
    for (const s of Object.keys(SETS)) {
      const Mof = SETS[s], A = acc[s];
      if (!A.cell.has(cell)) A.cell.set(cell, Array.from({ length: 13 }, mk));
      if (!A.prov.has(prov)) { A.prov.set(prov, Array.from({ length: 13 }, mk)); A.perYear.prov.set(prov, Array.from({ length: 13 }, () => ({}))); }
      const ac = A.cell.get(cell), ap = A.prov.get(prov), pyP = A.perYear.prov.get(prov);
      for (const y of Object.keys(yrs)) {
        if (!Y.has(+y)) continue;
        for (const [m, r] of Object.entries(yrs[y])) {
          const V = r[0], M = Mof(r);
          ac[m].V += V; ac[m].M += M; ap[m].V += V; ap[m].M += M; A.country[m].V += V; A.country[m].M += M;
          ac[m].neff += Math.min(M, CAP); if (M > 0) ac[m].logs.push(Math.log((V + 0.5) / (M + 0.5)));
          const sp = (pyP[m][y] ??= [0, 0]); sp[0] += V; sp[1] += M;
          const sc = (A.perYear.country[m][y] ??= [0, 0]); sc[0] += V; sc[1] += M;
        }
      }
    }
  }
  for (const s of Object.keys(SETS)) {
    const A = acc[s];
    for (const [prov, months] of A.perYear.prov) { const a = A.prov.get(prov); for (let m = 1; m <= 12; m++) for (const [V, M] of Object.values(months[m])) { a[m].neff += Math.min(M, CAP); if (M > 0) a[m].logs.push(Math.log((V + 0.5) / (M + 0.5))); } }
    for (let m = 1; m <= 12; m++) for (const [V, M] of Object.values(A.perYear.country[m])) { A.country[m].neff += Math.min(M, CAP); if (M > 0) A.country[m].logs.push(Math.log((V + 0.5) / (M + 0.5))); }
  }
  const logr = a => a.M >= K_MIN ? Math.log((a.V + 0.5) / (a.M + 0.5)) : null;
  const out = { country: {}, prov: {}, cell: {}, level: {}, meta: { K, CAP, K_MIN, years } };
  for (const s of Object.keys(SETS)) {
    const C = acc[s].country, cF = [], cS = [];
    for (let m = 1; m <= 12; m++) { cF[m] = logr(C[m]) ?? Math.log(3.3); cS[m] = sd(C[m].logs) ?? 0.3; }
    out.country[s] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(cF[i + 1]).toFixed(4), sigma: +cS[i + 1].toFixed(4), V: C[i + 1].V, M: C[i + 1].M }));
    const PF = new Map(), PS = new Map(), PW = new Map(); out.prov[s] = {};
    for (const [prov, P] of acc[s].prov) {
      const f = [], sg = [], w = [];
      for (let m = 1; m <= 12; m++) {
        const lr = logr(P[m]); const wp = lr === null ? 0 : P[m].neff / (P[m].neff + K);
        f[m] = wp * (lr ?? 0) + (1 - wp) * cF[m]; const sp = sd(P[m].logs); sg[m] = Math.sqrt(wp * (sp ?? cS[m]) ** 2 + (1 - wp) * cS[m] ** 2); w[m] = wp;
      }
      PF.set(prov, f); PS.set(prov, sg); PW.set(prov, w);
      out.prov[s][prov] = Array.from({ length: 12 }, (_, i) => ({ f: +Math.exp(f[i + 1]).toFixed(4), sigma: +sg[i + 1].toFixed(4), w: +w[i + 1].toFixed(3), V: P[i + 1].V, M: P[i + 1].M }));
    }
    out.cell[s] = {}; out.level[s] = {};
    for (const [cell, A] of acc[s].cell) {
      const prov = provOf.get(cell), pf = PF.get(prov), ps = PS.get(prov), pw = PW.get(prov), rows = [], lv = [];
      for (let m = 1; m <= 12; m++) {
        const lr = logr(A[m]); const wc = lr === null ? 0 : A[m].neff / (A[m].neff + K);
        const lf = wc * (lr ?? 0) + (1 - wc) * pf[m]; const sc = sd(A[m].logs); const sg = Math.sqrt(wc * (sc ?? ps[m]) ** 2 + (1 - wc) * ps[m] ** 2);
        rows.push([+Math.exp(lf).toFixed(4), +sg.toFixed(4), A[m].neff, +wc.toFixed(3)]); lv.push(lr !== null ? 'cell' : pw[m] > 0 ? 'prov' : 'country');
      }
      out.cell[s][cell] = rows; out.level[s][cell] = lv;
    }
  }
  return out;
}
