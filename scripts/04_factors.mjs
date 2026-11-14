#!/usr/bin/env node
// 04_factors.mjs — Hierarchical VIIRS/MODIS harmonization factors per cell × calendar month × satellite set.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Method (METHOD_DESIGN §2.2): ratio of sums over the overlap years, per level L ∈ {cell, province, country}:
//     r_L[m] = (Σ_y V_L[m,y] + 0.5) / (Σ_y M_L[m,y] + 0.5)      valid if Σ_y M_L[m,y] >= K_MIN
// Shrinkage in log space (empirical-Bayes style):
//     log f_prov = w_p·log r_prov + (1−w_p)·log r_country ;  log f_cell = w_c·log r_cell + (1−w_c)·log f_prov
//     w = n_eff / (n_eff + K) ;  n_eff = Σ_y min(M[m,y], CAP)
// Two satellite sets: TA (M = Terra+Aqua, used Jul-2002→2011) and T (M = Terra only, used 2000→Jun-2002).
// Uncertainty: interannual SD of log((V+0.5)/(M+0.5)) over overlap years with M>0, shrunk with the same weights.
//
// Usage: node scripts/04_factors.mjs [--k=20] [--cap=200] [--years=2012-2025] [--exclude=YYYY] [--out=data/factors]
// Output: <out>/factors.csv, <out>/factors.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const K = +arg('k', 20), CAP = +arg('cap', 200), K_MIN = 5;
const [Y0, Y1] = arg('years', '2012-2025').split('-').map(Number);
const EXCLUDE = new Set((arg('exclude', '') || '').split(',').filter(Boolean).map(Number));
const OUT = path.join(ROOT, arg('out', 'data/factors'));
const YEARS = []; for (let y = Y0; y <= Y1; y++) if (!EXCLUDE.has(y)) YEARS.push(y);

const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));
const SETS = { TA: r => r[1] + r[2], T: r => r[1] };

// ---- accumulate sums per level ----
// acc[set][level][key][month] = { V, M, neff, logs: [] }
const mk = () => ({ V: 0, M: 0, neff: 0, logs: [] });
const acc = {};
for (const s of Object.keys(SETS)) acc[s] = { cell: new Map(), prov: new Map(), country: new Map([['AR', Array.from({ length: 13 }, mk)]]) };

for (const [cid, years] of Object.entries(agg.cells)) {
  const cell = +cid, prov = provOf.get(cell);
  if (!prov) continue;
  for (const s of Object.keys(SETS)) {
    const Mof = SETS[s];
    if (!acc[s].cell.has(cell)) acc[s].cell.set(cell, Array.from({ length: 13 }, mk));
    if (!acc[s].prov.has(prov)) acc[s].prov.set(prov, Array.from({ length: 13 }, mk));
    const A = [acc[s].cell.get(cell), acc[s].prov.get(prov), acc[s].country.get('AR')];
    // per-year V and M at cell level (for logs and n_eff) — province/country logs need per-year sums, done below
    for (const y of YEARS) {
      const ym = years[y]; if (!ym) continue;
      for (const [m, r] of Object.entries(ym)) {
        const V = r[0], M = Mof(r);
        for (const a of A) { a[m].V += V; a[m].M += M; }
        A[0][m].neff += Math.min(M, CAP);
        if (M > 0) A[0][m].logs.push(Math.log((V + 0.5) / (M + 0.5)));
      }
    }
  }
}
// province / country per-year sums for σ and n_eff
for (const s of Object.keys(SETS)) {
  const Mof = SETS[s];
  const perYear = { prov: new Map(), country: new Map() }; // key -> month -> year -> [V,M]
  for (const [cid, years] of Object.entries(agg.cells)) {
    const prov = provOf.get(+cid); if (!prov) continue;
    for (const y of YEARS) {
      const ym = years[y]; if (!ym) continue;
      for (const [m, r] of Object.entries(ym)) {
        for (const [lvl, key] of [['prov', prov], ['country', 'AR']]) {
          const P = perYear[lvl]; if (!P.has(key)) P.set(key, Array.from({ length: 13 }, () => ({})));
          const slot = (P.get(key)[m][y] ??= [0, 0]); slot[0] += r[0]; slot[1] += Mof(r);
        }
      }
    }
  }
  for (const lvl of ['prov', 'country']) for (const [key, months] of perYear[lvl]) {
    const a = acc[s][lvl].get(key);
    for (let m = 1; m <= 12; m++) for (const [, [V, M]] of Object.entries(months[m])) {
      a[m].neff += Math.min(M, CAP);
      if (M > 0) a[m].logs.push(Math.log((V + 0.5) / (M + 0.5)));
    }
  }
}

const sd = xs => { if (xs.length < 2) return null; const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1)); };
const logr = a => a.M >= K_MIN ? Math.log((a.V + 0.5) / (a.M + 0.5)) : null;

// ---- shrink ----
const out = { meta: { k: K, cap: CAP, k_min: K_MIN, years: YEARS, generated: new Date().toISOString() }, country: {}, prov: {}, cell: {} };
let csv = 'cell,prov,month,set,f,sigma,n_eff,w_cell,w_prov,level\n';
for (const s of Object.keys(SETS)) {
  const C = acc[s].country.get('AR');
  const cF = [], cS = [];
  for (let m = 1; m <= 12; m++) { cF[m] = logr(C[m]); cS[m] = sd(C[m].logs) ?? 0.3; }
  out.country[s] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, f: +Math.exp(cF[i + 1]).toFixed(4), sigma: +cS[i + 1].toFixed(4), V: C[i + 1].V, M: C[i + 1].M }));
  const PF = new Map(), PS = new Map(), PW = new Map();
  for (const [prov, P] of acc[s].prov) {
    const f = [], sg = [], w = [];
    for (let m = 1; m <= 12; m++) {
      const lr = logr(P[m]); const wp = lr === null ? 0 : P[m].neff / (P[m].neff + K);
      f[m] = wp * (lr ?? 0) + (1 - wp) * cF[m];
      const sp = sd(P[m].logs); sg[m] = Math.sqrt(wp * (sp ?? cS[m]) ** 2 + (1 - wp) * cS[m] ** 2); w[m] = wp;
    }
    PF.set(prov, f); PS.set(prov, sg); PW.set(prov, w);
    out.prov[s] ??= {}; out.prov[s][prov] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, f: +Math.exp(f[i + 1]).toFixed(4), sigma: +sg[i + 1].toFixed(4), w: +w[i + 1].toFixed(3), V: P[i + 1].V, M: P[i + 1].M }));
  }
  out.cell[s] = {};
  for (const [cell, A] of acc[s].cell) {
    const prov = provOf.get(cell); const pf = PF.get(prov), ps = PS.get(prov), pw = PW.get(prov);
    const rows = [];
    for (let m = 1; m <= 12; m++) {
      const lr = logr(A[m]); const wc = lr === null ? 0 : A[m].neff / (A[m].neff + K);
      const lf = wc * (lr ?? 0) + (1 - wc) * pf[m];
      const sc = sd(A[m].logs); const sg = Math.sqrt(wc * (sc ?? ps[m]) ** 2 + (1 - wc) * ps[m] ** 2);
      const level = lr !== null ? 'cell' : pw[m] > 0 ? 'prov' : 'country';
      rows.push([+Math.exp(lf).toFixed(4), +sg.toFixed(4), A[m].neff, +wc.toFixed(3)]);
      csv += `${cell},"${prov}",${m},${s},${Math.exp(lf).toFixed(4)},${sg.toFixed(4)},${A[m].neff},${wc.toFixed(3)},${pw[m].toFixed(3)},${level}\n`;
    }
    out.cell[s][cell] = rows; // [month-1] -> [f, sigma, n_eff, w_cell]
  }
}
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'factors.csv'), csv);
await writeFile(path.join(OUT, 'factors.json'), JSON.stringify(out));

// ---- report ----
const fmt = x => x.toFixed(2).padStart(6);
console.log(`k=${K} cap=${CAP} years=${YEARS[0]}-${YEARS.at(-1)}${EXCLUDE.size ? ' excl ' + [...EXCLUDE] : ''}  cells=${acc.TA.cell.size}  → ${path.relative(ROOT, OUT)}/`);
console.log('country f (TA) by month: ' + out.country.TA.map(x => fmt(x.f)).join(''));
console.log('country f (T)  by month: ' + out.country.T.map(x => fmt(x.f)).join(''));
console.log('country σ (TA) by month: ' + out.country.TA.map(x => fmt(x.sigma)).join(''));
console.log('\nprovince f (TA), Aug / annual-weighted:');
for (const [p, rows] of Object.entries(out.prov.TA).sort((a, b) => b[1].reduce((s, r) => s + r.M, 0) - a[1].reduce((s, r) => s + r.M, 0))) {
  const V = rows.reduce((s, r) => s + r.V, 0), M = rows.reduce((s, r) => s + r.M, 0);
  console.log(`  ${p.slice(0, 22).padEnd(22)} aug f=${fmt(rows[7].f)} w=${rows[7].w.toFixed(2)}   V/M overlap=${fmt(V / M)}  (V=${V} M=${M})`);
}
const lv = {}; for (const line of csv.split('\n').slice(1)) { const l = line.split(',').at(-1); if (l) lv[l] = (lv[l] || 0) + 1; }
console.log('\ncell-month source level:', lv);
