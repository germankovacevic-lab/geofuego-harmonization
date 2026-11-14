#!/usr/bin/env node
// 08_app_payload.mjs — assemble the static payload of the web app (deploy/data) and copy the vendored libraries.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//   deploy/data/cells.json       ← data/harmonized/cells.json (served by Cloudflare Pages with on-the-fly compression)
//   deploy/data/cells_2026.json  ← data/harmonized/cells_2026.json (07_live_2026.mjs; preliminary current year)
//   deploy/data/oni.json         ← data/external/oni/oni.ascii.txt, { "YYYY-M": ONI } for 2000–2011 (interval widening pre-2012)
//   deploy/vendor/               ← Leaflet 1.9.4, Leaflet.draw 1.0.4, uPlot 1.6.31 with their LICENSE files
// Usage: node scripts/08_app_payload.mjs [--vendor=~/.openclaw/data/spaceapps-vendor]

import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PROVINCIAS } from '../lib/provincias.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const VENDOR = arg('vendor', path.join(homedir(), '.openclaw', 'data', 'spaceapps-vendor'));
const OUT = path.join(ROOT, 'deploy', 'data');
await mkdir(OUT, { recursive: true });

await cp(path.join(ROOT, 'data', 'harmonized', 'cells.json'), path.join(OUT, 'cells.json'));
await cp(path.join(ROOT, 'data', 'harmonized', 'cells_2026.json'), path.join(OUT, 'cells_2026.json'));

const SEAS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'];
const oni = {};
for (const line of (await readFile(path.join(ROOT, 'data', 'external', 'oni', 'oni.ascii.txt'), 'utf8')).split('\n').slice(1)) {
  const f = line.trim().split(/\s+/); const mi = SEAS.indexOf(f[0]) + 1; const y = +f[1];
  if (mi && y >= 2000 && y <= 2011) oni[`${y}-${mi}`] = +f[3];
}
await writeFile(path.join(OUT, 'provincias.json'), JSON.stringify({ source: 'IGN Argentina, WFS ign:provincia, simplified with mapshaper (reused from GeoFuego, pre-existing work)', provincias: PROVINCIAS.map(p => ({ n: p.n, rings: p.rings })) }));
await writeFile(path.join(OUT, 'oni.json'), JSON.stringify({ source: 'NOAA CPC Oceanic Niño Index (ONI v5), 3-month running mean centred on the month', oni }));

for (const [dir, files] of [['leaflet-1.9.4', ['leaflet.js', 'leaflet.css', 'LICENSE', 'images']], ['leaflet-draw-1.0.4', ['leaflet.draw.js', 'leaflet.draw.css', 'LICENSE', 'images']], ['uplot-1.6.31', ['uPlot.iife.min.js', 'uPlot.min.css', 'LICENSE']]]) {
  const dst = path.join(ROOT, 'deploy', 'vendor', dir); await mkdir(dst, { recursive: true });
  for (const f of files) await cp(path.join(VENDOR, dir, f), path.join(dst, f), { recursive: true });
}
await cp(path.join(VENDOR, 'SHA256SUMS.txt'), path.join(ROOT, 'deploy', 'vendor', 'SHA256SUMS.txt'));
for (const f of ['cells.json', 'cells_2026.json', 'oni.json', 'provincias.json']) console.log(f, ((await stat(path.join(OUT, f))).size / 1e6).toFixed(2), 'MB');
console.log('vendor copied from', VENDOR);
