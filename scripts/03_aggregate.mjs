#!/usr/bin/env node
// 03_aggregate.mjs — Count filtered hotspots per cell × year × month × satellite set.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Equivalent filters (declared in METHOD_DESIGN §1.2):
//   MODIS : type == 0 (vegetation fire) AND confidence >= 30
//   VIIRS : type == 0 AND confidence != 'l'
// Satellite sets: V = VIIRS S-NPP · T = MODIS Terra · A = MODIS Aqua
// Persistent thermal sources (03a_static_sources.mjs) are counted SEPARATELY, never dropped. Satellite outage days
// (03b_coverage.mjs) are handled with extra columns. Per cell×year×month array (12 ints):
//   [0..5]  V, T, A, Vs, Ts, As        all days (s = inside a static-source 0.02° cell)
//   [6..8]  Vp, Tp, Ap                 vegetation counts on PAIRED days only (Terra, Aqua and S-NPP all operating and
//                                      none in outage) → used for the factor calibration (2012+)
//   [9]     M_snppOut  = T+A on days when S-NPP was in outage (2012+)      → fills VIIRS gaps with f·M
//   [10]    A_terraOut = Aqua on days when Terra was in outage (2002-07+)  → fills Terra gaps in reconstructed months
//   [11]    T_aquaOut  = Terra on days when Aqua was in outage (2002-07+)  → fills Aqua gaps in reconstructed months
//
// Output: data/agg/counts.json   { cells: { <cellId>: { <year>: { <month>: [V,T,A,Vs,Ts,As] } } }, drops, totals }
//         data/agg/country_year.csv  year, V, T, A, Vs, Ts, As, ratio_V_over_TA, ratio_static

import { createReadStream } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellOf } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'agg');
await mkdir(OUT, { recursive: true });

const manifest = JSON.parse(await readFile(path.join(RAW, 'MANIFEST.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const landCell = new Set(index.cells.map(c => c.id));
const STATIC = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), 'utf8'));
const staticSet = new Set(Object.keys(STATIC.cells));
const CEL = STATIC.rule.cell_deg;
const staticKey = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);
const COV = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'coverage.json'), 'utf8'));
const OUT_T = new Set(COV.outages.Terra), OUT_A = new Set(COV.outages.Aqua), OUT_V = new Set(COV.outages.SNPP);
const activeA = d => d >= COV.start.Aqua, activeV = d => d >= '2012-01-01'; // VIIRS era starts 2012-01-01; 1–19 Jan 2012 are S-NPP outage (pre-operational) days
const pairedDay = d => activeV(d) && !OUT_T.has(d) && !OUT_A.has(d) && !OUT_V.has(d);
let pairedN = 0, gapN = 0;

const cells = {};            // cellId -> year -> month -> [V,T,A]
const drops = { filtered_type: 0, filtered_conf: 0, outside_grid: 0, no_land_cell: 0, bad_row: 0 };
const country = {};          // year -> [V,T,A,Vs,Ts,As]
let kept = 0, read = 0, staticN = 0;

const NCOL = 12;
function add(cell, y, m, k, extra) {
  const cy = (cells[cell] ??= {}); const ym = (cy[y] ??= {}); const arr = (ym[m] ??= Array(NCOL).fill(0));
  arr[k]++; (country[y] ??= Array(NCOL).fill(0))[k]++;
  for (const e of extra) { arr[e]++; country[y][e]++; }
}

const t0 = Date.now();
for (const [file, meta] of Object.entries(manifest)) {
  if (!['modis', 'viirs-snpp'].includes(meta.sensor)) continue; // the VIIRS SP files for the NOAA-20/21 bridge are not part of this series
  const isModis = meta.sensor === 'modis';
  const rl = readline.createInterface({ input: createReadStream(path.join(RAW, file)) });
  let header = true, n = 0;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const f = line.split(',');
    if (f.length < 15) { drops.bad_row++; continue; }
    read++; n++;
    // columns: 0 lat,1 lon,...,5 acq_date,7 satellite,9 confidence,14 type
    if (f[14] !== '0') { drops.filtered_type++; continue; }
    let k;
    if (isModis) {
      if (+f[9] < 30) { drops.filtered_conf++; continue; }
      k = f[7] === 'Terra' ? 1 : f[7] === 'Aqua' ? 2 : -1;
      if (k < 0) { drops.bad_row++; continue; }
    } else {
      if (f[9] === 'l') { drops.filtered_conf++; continue; }
      k = 0;
    }
    const cell = cellOf(+f[0], +f[1]);
    if (cell === null) { drops.outside_grid++; continue; }
    if (!landCell.has(cell)) { drops.no_land_cell++; continue; }
    const d = f[5], y = +d.slice(0, 4), m = +d.slice(5, 7);
    const extra = [];
    if (staticSet.has(staticKey(+f[0], +f[1]))) { k += 3; staticN++; }
    else {
      if (pairedDay(d)) { extra.push(6 + k); pairedN++; }
      if (k > 0 && activeV(d) && OUT_V.has(d)) { extra.push(9); gapN++; }          // MODIS on a VIIRS-outage day
      if (k === 2 && OUT_T.has(d)) { extra.push(10); gapN++; }                     // Aqua on a Terra-outage day
      if (k === 1 && activeA(d) && OUT_A.has(d)) { extra.push(11); gapN++; }       // Terra on an Aqua-outage day
    }
    add(cell, y, m, k, extra); kept++;
  }
  console.log(`${file.padEnd(34)} rows=${String(n).padStart(7)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const years = Object.keys(country).map(Number).sort();
let csv = 'year,V,T,A,Vs,Ts,As,Vp,Tp,Ap,M_snppOut,A_terraOut,T_aquaOut,ratio_V_over_TA,ratio_paired,ratio_static\n';
for (const y of years) { const [V, T, A, Vs, Ts, As, Vp, Tp, Ap, g1, g2, g3] = country[y]; csv += `${y},${V},${T},${A},${Vs},${Ts},${As},${Vp},${Tp},${Ap},${g1},${g2},${g3},${T + A ? (V / (T + A)).toFixed(3) : ''},${Tp + Ap ? (Vp / (Tp + Ap)).toFixed(3) : ''},${Ts + As ? (Vs / (Ts + As)).toFixed(3) : ''}\n`; }
await writeFile(path.join(OUT, 'country_year.csv'), csv);
await writeFile(path.join(OUT, 'counts.json'), JSON.stringify({ generated: new Date().toISOString(), filters: { modis: 'type==0 && confidence>=30', viirs: 'type==0 && confidence!=l' }, columns: ['V', 'T', 'A', 'Vs', 'Ts', 'As', 'Vp', 'Tp', 'Ap', 'M_snppOut', 'A_terraOut', 'T_aquaOut'], static_rule: STATIC.rule, coverage_rule: COV.rule, read, kept, static: staticN, paired: pairedN, on_outage_days: gapN, drops, cells }));
console.log(`\nread=${read} kept=${kept} static=${staticN} (${(100 * staticN / kept).toFixed(2)}%) paired=${pairedN} on_outage_days=${gapN} drops=${JSON.stringify(drops)} cells_with_data=${Object.keys(cells).length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(csv);
