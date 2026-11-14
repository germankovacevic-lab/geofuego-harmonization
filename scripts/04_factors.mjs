#!/usr/bin/env node
// 04_factors.mjs — Hierarchical VIIRS/MODIS harmonization factors per cell × calendar month × satellite set.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Method: lib/factors.js (ratio of sums on paired days, shrinkage cell → province → region → country in log space).
// Two satellite sets: TA (M = Terra+Aqua, used Jul-2002→2011) and T (M = Terra only, used 2000→Jun-2002).
// Calibration window 2012–2023: Terra's equator-crossing time drifts earlier since 2020 and Aqua's later since 2022; the
// effect is visible in 2024–2025 (Aqua/Terra 2.2–2.5 vs 1.7–1.9 before, VIIRS/Terra 11.6 in 2025 vs ~9). Factors fitted
// with those years would be applied to 2000–2011, when both satellites were at nominal crossing times.
//
// Usage: node scripts/04_factors.mjs [--k=20] [--cap=200] [--years=2012-2023] [--no-regions] [--out=data/factors]
// Output: <out>/factors.csv, <out>/factors.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFactors } from '../lib/factors.js';
import { REGION_OF } from '../lib/regions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const K = +arg('k', 20), CAP = +arg('cap', 200);
const [Y0, Y1] = arg('years', '2012-2023').split('-').map(Number);
const useRegions = !process.argv.includes('--no-regions');
const OUT = path.join(ROOT, arg('out', 'data/factors'));
const YEARS = []; for (let y = Y0; y <= Y1; y++) YEARS.push(y);

const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const provOf = new Map(index.cells.map(c => [c.id, c.prov]));

const fit = fitFactors(agg.cells, provOf, { K, CAP, years: YEARS, useRegions });
fit.meta.generated = new Date().toISOString();
let csv = 'cell,prov,region,month,set,f,sigma,n_eff,w_cell,level\n';
for (const s of Object.keys(fit.cell)) for (const [cell, rows] of Object.entries(fit.cell[s])) {
  const prov = provOf.get(+cell);
  rows.forEach((r, i) => { csv += `${cell},"${prov}",${REGION_OF[prov] || 'other'},${i + 1},${s},${r[0]},${r[1]},${r[2]},${r[3]},${fit.level[s][cell][i]}\n`; });
}
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'factors.csv'), csv);
await writeFile(path.join(OUT, 'factors.json'), JSON.stringify(fit));

const fmt = x => x.toFixed(2).padStart(6);
console.log(`k=${K} cap=${CAP} years=${YEARS[0]}-${YEARS.at(-1)} regions=${useRegions}  cells=${Object.keys(fit.cell.TA).length}  → ${path.relative(ROOT, OUT)}/`);
console.log('country f (TA) by month: ' + fit.country.TA.map(x => fmt(x.f)).join(''));
console.log('country f (T)  by month: ' + fit.country.T.map(x => fmt(x.f)).join(''));
console.log('\nregion f (TA), Aug / annual V/M:');
for (const [reg, rows] of Object.entries(fit.region.TA)) { const V = rows.reduce((a, r) => a + r.V, 0), M = rows.reduce((a, r) => a + r.M, 0); console.log(`  ${reg.padEnd(16)} aug f=${fmt(rows[7].f)} w=${rows[7].w.toFixed(2)}   V/M=${fmt(V / M)}  (M=${M})`); }
console.log('\nprovince f (TA), Aug / annual V/M:');
for (const [p, rows] of Object.entries(fit.prov.TA).sort((a, b) => b[1].reduce((s, r) => s + r.M, 0) - a[1].reduce((s, r) => s + r.M, 0))) {
  const V = rows.reduce((s, r) => s + r.V, 0), M = rows.reduce((s, r) => s + r.M, 0);
  console.log(`  ${p.slice(0, 22).padEnd(22)} aug f=${fmt(rows[7].f)} w=${rows[7].w.toFixed(2)}   V/M=${fmt(V / M)}  (V=${V} M=${M})`);
}
const lv = {}; for (const s of Object.keys(fit.level)) for (const arr of Object.values(fit.level[s])) for (const l of arr) lv[l] = (lv[l] || 0) + 1;
console.log('\ncell-month source level:', lv);
