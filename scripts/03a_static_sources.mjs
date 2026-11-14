#!/usr/bin/env node
// 03a_static_sources.mjs — Detect persistent thermal sources (gas flares, industrial) that FIRMS labels as vegetation fire.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Rule (ported from GeoFuego production, 13/11/2026): a 0.02° cell (~2 km) is a persistent thermal source if it has
// hotspots in >= 9 distinct calendar months within any 12-month window. Vegetation does not burn in the same ~2 km²
// nine months out of twelve; a flare does. Detected separately on VIIRS S-NPP (2012–2025) and MODIS (2000–2025) with the
// same equivalent filters as 03_aggregate; the union is used so that pre-2012 (MODIS-only) flares are also caught.
//
// Output: data/agg/static_cells.json { rule, cells: { "<i>:<j>": { lat, lon, viirs_months, modis_months, sensors } }, by_prov }

import { createReadStream } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provinceOf } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const CEL = 0.02, MIN_IN_WINDOW = 9, WINDOW = 12;
export const staticKey = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);

const manifest = JSON.parse(await readFile(path.join(RAW, 'MANIFEST.json'), 'utf8'));
const months = { viirs: new Map(), modis: new Map() }; // key -> Set(yyyy-mm)

const t0 = Date.now();
for (const [file, meta] of Object.entries(manifest)) {
  const isModis = meta.sensor === 'modis', bag = months[isModis ? 'modis' : 'viirs'];
  const rl = readline.createInterface({ input: createReadStream(path.join(RAW, file)) });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const f = line.split(',');
    if (f.length < 15 || f[14] !== '0') continue;
    if (isModis ? +f[9] < 30 : f[9] === 'l') continue;
    const k = staticKey(+f[0], +f[1]);
    let s = bag.get(k); if (!s) bag.set(k, s = new Set());
    s.add(f[5].slice(0, 7));
  }
}
const idx = m => (+m.slice(0, 4)) * 12 + (+m.slice(5)) - 1;
function maxInWindow(set) {
  const a = [...set].map(idx).sort((x, y) => x - y); let j = 0, mx = 0;
  for (let i = 0; i < a.length; i++) { while (a[i] - a[j] >= WINDOW) j++; mx = Math.max(mx, i - j + 1); }
  return mx;
}
const cells = {};
for (const sensor of ['viirs', 'modis']) for (const [k, s] of months[sensor]) {
  const mw = maxInWindow(s);
  if (mw < MIN_IN_WINDOW) continue;
  const [i, j] = k.split(':').map(Number);
  const c = (cells[k] ??= { lat: +((i + 0.5) * CEL).toFixed(3), lon: +((j + 0.5) * CEL).toFixed(3), viirs_months: 0, modis_months: 0, sensors: [] });
  c[sensor + '_months'] = mw; c.sensors.push(sensor);
}
const by_prov = {};
for (const c of Object.values(cells)) { const p = provinceOf(c.lat, c.lon) || '(outside)'; by_prov[p] = (by_prov[p] || 0) + 1; }
await mkdir(path.join(ROOT, 'data', 'agg'), { recursive: true });
await writeFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), JSON.stringify({ rule: { cell_deg: CEL, min_months_in_window: MIN_IN_WINDOW, window_months: WINDOW, detected_on: 'union(VIIRS S-NPP 2012-2025, MODIS 2000-2025)' }, generated: new Date().toISOString(), n: Object.keys(cells).length, cells, by_prov }));
const nV = Object.values(cells).filter(c => c.sensors.includes('viirs')).length, nM = Object.values(cells).filter(c => c.sensors.includes('modis')).length, both = Object.values(cells).filter(c => c.sensors.length === 2).length;
console.log(`static-source cells: ${Object.keys(cells).length} (viirs ${nV}, modis ${nM}, both ${both}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const [p, n] of Object.entries(by_prov).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${p}`);
