#!/usr/bin/env node
// 02_grid.mjs — Build the 0.25° grid over Argentina and assign each cell to a province.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Output: data/grid/cells_index.json  [{id,r,c,lat0,lon0,prov,how}]   (cells with Argentine land only)
//         data/grid/grid.geojson      polygons of those cells with {id, prov}

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRID, cellBounds, provinceOfCell } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'grid');
await mkdir(OUT, { recursive: true });

const t0 = Date.now();
const cells = [];
const byProv = new Map();
let centroid = 0, sample = 0;
for (let id = 0; id < GRID.nRows * GRID.nCols; id++) {
  const { prov, how } = provinceOfCell(id);
  if (!prov) continue;
  const b = cellBounds(id);
  cells.push({ id, r: b.r, c: b.c, lat0: b.lat0, lon0: b.lon0, prov, how });
  byProv.set(prov, (byProv.get(prov) || 0) + 1);
  how === 'centroid' ? centroid++ : sample++;
}

const geojson = {
  type: 'FeatureCollection',
  features: cells.map(k => {
    const b = cellBounds(k.id);
    return { type: 'Feature', properties: { id: k.id, prov: k.prov },
      geometry: { type: 'Polygon', coordinates: [[[b.lon0, b.lat0], [b.lon1, b.lat0], [b.lon1, b.lat1], [b.lon0, b.lat1], [b.lon0, b.lat0]]] } };
  }),
};
await writeFile(path.join(OUT, 'cells_index.json'), JSON.stringify({ grid: GRID, n: cells.length, cells }));
await writeFile(path.join(OUT, 'grid.geojson'), JSON.stringify(geojson));

console.log(`grid ${GRID.nRows}×${GRID.nCols} = ${GRID.nRows * GRID.nCols} cells; with land: ${cells.length} (centroid ${centroid}, sampled ${sample}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const [p, n] of [...byProv.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${p}`);
