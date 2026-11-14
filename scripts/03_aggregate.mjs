#!/usr/bin/env node
// 03_aggregate.mjs — Count filtered hotspots per cell × year × month × satellite set.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Equivalent filters (declared in METHOD_DESIGN §1.2):
//   MODIS : type == 0 (vegetation fire) AND confidence >= 30
//   VIIRS : type == 0 AND confidence != 'l'
// Satellite sets: V = VIIRS S-NPP · T = MODIS Terra · A = MODIS Aqua
//
// Output: data/agg/counts.json   { cells: { <cellId>: { <year>: { <month>: [V,T,A] } } }, drops, totals }
//         data/agg/country_year.csv  year, V, T, A, ratio_V_over_TA

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

const cells = {};            // cellId -> year -> month -> [V,T,A]
const drops = { filtered_type: 0, filtered_conf: 0, outside_grid: 0, no_land_cell: 0, bad_row: 0 };
const country = {};          // year -> [V,T,A]
let kept = 0, read = 0;

function add(cell, y, m, k) {
  const cy = (cells[cell] ??= {}); const ym = (cy[y] ??= {}); const arr = (ym[m] ??= [0, 0, 0]);
  arr[k]++;
  (country[y] ??= [0, 0, 0])[k]++;
}

const t0 = Date.now();
for (const [file, meta] of Object.entries(manifest)) {
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
    const y = +f[5].slice(0, 4), m = +f[5].slice(5, 7);
    add(cell, y, m, k); kept++;
  }
  console.log(`${file.padEnd(34)} rows=${String(n).padStart(7)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const years = Object.keys(country).map(Number).sort();
let csv = 'year,V,T,A,ratio_V_over_TA\n';
for (const y of years) { const [V, T, A] = country[y]; csv += `${y},${V},${T},${A},${T + A ? (V / (T + A)).toFixed(3) : ''}\n`; }
await writeFile(path.join(OUT, 'country_year.csv'), csv);
await writeFile(path.join(OUT, 'counts.json'), JSON.stringify({ generated: new Date().toISOString(), filters: { modis: 'type==0 && confidence>=30', viirs: 'type==0 && confidence!=l' }, read, kept, drops, cells }));
console.log(`\nread=${read} kept=${kept} drops=${JSON.stringify(drops)} cells_with_data=${Object.keys(cells).length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(csv);
