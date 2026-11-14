#!/usr/bin/env node
// 03a_static_sources.mjs — Detect persistent thermal sources (gas flares, industrial) that FIRMS labels as vegetation fire.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Rule (two independent physical signatures, audited 14/11/2026):
//   (1) PERSISTENCE: a 0.02° cell (~2 km) has hotspots in >= 9 distinct calendar months within any 12-month window
//       (ported from GeoFuego production). Vegetation rarely burns in the same ~2 km² nine months out of twelve.
//   (2) NIGHT: >= 50 % of the cell's hotspots are night-time detections (daynight == 'N'). Flares, kilns and industrial
//       boilers burn at night; vegetation fire is overwhelmingly diurnal. Without (2), persistence alone also flags
//       highly recurrent wetland burning (Paraná floodplain, Delta) which is real vegetation fire.
// Evaluated separately on VIIRS S-NPP (2012–2025) and MODIS (2000–2025) with the same filters as 03_aggregate; the
// union is used so that pre-2012 (MODIS-only) sources are also caught.
//
// Output: data/agg/static_cells.json { rule, cells: { "<i>:<j>": { lat, lon, viirs_months, modis_months, night_frac, sensors } }, by_prov, rejected_by_night }

import { createReadStream } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provinceOf } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const CEL = 0.02, MIN_IN_WINDOW = 9, WINDOW = 12, MIN_NIGHT_FRAC = 0.5;
export const staticKey = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);

const manifest = JSON.parse(await readFile(path.join(RAW, 'MANIFEST.json'), 'utf8'));
const months = { viirs: new Map(), modis: new Map() }; // key -> Set(yyyy-mm)
const dn = { viirs: new Map(), modis: new Map() };     // key -> [n, night]
const pos = { viirs: new Map(), modis: new Map() };    // key -> [sumLat, sumLon, n] (hotspot centroid inside the cell)

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
    const d = dn[isModis ? 'modis' : 'viirs']; let c = d.get(k); if (!c) d.set(k, c = [0, 0]);
    c[0]++; if (f[13] === 'N') c[1]++;
    const P = pos[isModis ? 'modis' : 'viirs']; let q = P.get(k); if (!q) P.set(k, q = [0, 0, 0]); q[0] += +f[0]; q[1] += +f[1]; q[2]++;
  }
}
const idx = m => (+m.slice(0, 4)) * 12 + (+m.slice(5)) - 1;
function maxInWindow(set) {
  const a = [...set].map(idx).sort((x, y) => x - y); let j = 0, mx = 0;
  for (let i = 0; i < a.length; i++) { while (a[i] - a[j] >= WINDOW) j++; mx = Math.max(mx, i - j + 1); }
  return mx;
}
const cells = {}, rejected = {};
for (const sensor of ['viirs', 'modis']) for (const [k, s] of months[sensor]) {
  const mw = maxInWindow(s);
  if (mw < MIN_IN_WINDOW) continue;
  const [i, j] = k.split(':').map(Number);
  // night fraction: prefer VIIRS (375 m, 2012+), fall back to MODIS for MODIS-only cells
  const dv = dn.viirs.get(k), dm = dn.modis.get(k);
  const nf = dv && dv[0] >= 10 ? dv[1] / dv[0] : dm ? dm[1] / dm[0] : 0;
  const q = pos.viirs.get(k) || pos.modis.get(k);
  const base = { lat: +((i + 0.5) * CEL).toFixed(3), lon: +((j + 0.5) * CEL).toFixed(3), bbox: [+(i * CEL).toFixed(3), +(j * CEL).toFixed(3), +((i + 1) * CEL).toFixed(3), +((j + 1) * CEL).toFixed(3)],
    centroid: q ? [+(q[0] / q[2]).toFixed(4), +(q[1] / q[2]).toFixed(4)] : null, hotspots: (pos.viirs.get(k)?.[2] || 0) + (pos.modis.get(k)?.[2] || 0),
    viirs_months: 0, modis_months: 0, night_frac: +nf.toFixed(3), sensors: [] };
  if (nf < MIN_NIGHT_FRAC) { const r = (rejected[k] ??= base); r[sensor + '_months'] = mw; r.sensors.push(sensor); continue; }
  const c = (cells[k] ??= base);
  c[sensor + '_months'] = mw; c.sensors.push(sensor);
}
const by_prov = {};
for (const c of Object.values(cells)) { const p = provinceOf(c.lat, c.lon) || '(outside)'; by_prov[p] = (by_prov[p] || 0) + 1; }
await mkdir(path.join(ROOT, 'data', 'agg'), { recursive: true });
const rej_by_prov = {};
for (const c of Object.values(rejected)) { const p = provinceOf(c.lat, c.lon) || '(outside)'; rej_by_prov[p] = (rej_by_prov[p] || 0) + 1; }
await writeFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), JSON.stringify({ rule: { cell_deg: CEL, min_months_in_window: MIN_IN_WINDOW, window_months: WINDOW, min_night_fraction: MIN_NIGHT_FRAC, detected_on: 'union(VIIRS S-NPP 2012-2025, MODIS 2000-2025)' }, generated: new Date().toISOString(), n: Object.keys(cells).length, cells, by_prov, rejected_by_night: { n: Object.keys(rejected).length, by_prov: rej_by_prov, cells: rejected } }));
console.log(`persistent but DIURNAL (returned to vegetation fire): ${Object.keys(rejected).length} cells → ${Object.entries(rej_by_prov).sort((a, b) => b[1] - a[1]).map(([p, n]) => p.split(',')[0] + ' ' + n).join(', ')}`);
const nV = Object.values(cells).filter(c => c.sensors.includes('viirs')).length, nM = Object.values(cells).filter(c => c.sensors.includes('modis')).length, both = Object.values(cells).filter(c => c.sensors.length === 2).length;
console.log(`static-source cells: ${Object.keys(cells).length} (viirs ${nV}, modis ${nM}, both ${both}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const [p, n] of Object.entries(by_prov).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${p}`);
