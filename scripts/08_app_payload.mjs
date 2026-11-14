#!/usr/bin/env node
// 08_app_payload.mjs — assemble the static payload of the web app (deploy/data) and verify the vendored libraries.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//   deploy/data/cells.json       ← data/harmonized/cells.json (served by Cloudflare Pages with on-the-fly compression)
//   deploy/data/cells_2026.json  ← data/harmonized/cells_2026.json (07_live_2026.mjs; preliminary current year)
//   deploy/data/oni.json         ← data/external/oni/oni.ascii.txt, { "YYYY-M": ONI } for 2000–2011 (interval widening pre-2012)
//   deploy/vendor/               — Leaflet 1.9.4, Leaflet.draw 1.0.4, uPlot 1.6.31 with their LICENSE files, versioned in the
//                                  repository and checked here against deploy/vendor/SHA256SUMS.txt (no private paths involved)
// Usage: node scripts/08_app_payload.mjs

import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVINCIAS } from '../lib/provincias.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
// raw.json: annual raw counts per 0.25° cell, 2001–2025, in each sensor's own units (vegetation class, static sources excluded:
// the same filters as the harmonized record) — MODIS = Terra + Aqua hotspots, VIIRS = S-NPP hotspots. Feeds the before/after
// panel of the app (the naive splice versus the harmonized series). Source: data/agg/counts.json (03_aggregate).
{
  const C = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
  const iV = C.columns.indexOf('V'), iT = C.columns.indexOf('T'), iA = C.columns.indexOf('A');
  const RY0 = 2001, RY1 = 2025, cells = {};
  for (const [id, byYear] of Object.entries(C.cells)) {
    const m = Array(RY1 - RY0 + 1).fill(0), v = Array(RY1 - RY0 + 1).fill(0); let any = false;
    for (const [y, byMonth] of Object.entries(byYear)) { const k = +y - RY0; if (k < 0 || k > RY1 - RY0) continue; for (const r of Object.values(byMonth)) { m[k] += r[iT] + r[iA]; v[k] += r[iV]; any = true; } }
    if (any) cells[id] = { m, v };
  }
  await writeFile(path.join(OUT, 'raw.json'), JSON.stringify({ source: 'NASA FIRMS country archives, annual raw hotspot counts per 0.25° cell (vegetation class, static sources excluded); m = MODIS Terra+Aqua, v = VIIRS S-NPP; produced by 08_app_payload.mjs from data/agg/counts.json', y0: RY0, y1: RY1, cells }));
}
await writeFile(path.join(OUT, 'provincias.json'), JSON.stringify({ source: 'IGN Argentina, WFS ign:provincia, simplified with mapshaper (reused from GeoFuego, pre-existing work)', provincias: PROVINCIAS.map(p => ({ n: p.n, rings: p.rings })) }));
await writeFile(path.join(OUT, 'oni.json'), JSON.stringify({ source: 'NOAA CPC Oceanic Niño Index (ONI v5), 3-month running mean centred on the month', oni }));

// vendored libraries: verify every file listed in SHA256SUMS.txt (fail loudly if a library was altered)
const VEND = path.join(ROOT, 'deploy', 'vendor'); let bad = 0, nv = 0;
for (const line of (await readFile(path.join(VEND, 'SHA256SUMS.txt'), 'utf8')).split('\n')) {
  const m = line.match(/^([0-9a-f]{64})\s+\.\/(.+)$/); if (!m) continue; nv++;
  const h = createHash('sha256').update(await readFile(path.join(VEND, m[2]))).digest('hex');
  if (h !== m[1]) { bad++; console.error('vendor checksum mismatch:', m[2]); }
}
if (bad) { console.error(`08_app_payload: ${bad} vendored file(s) do not match SHA256SUMS.txt`); process.exit(1); }
for (const f of ['cells.json', 'cells_2026.json', 'oni.json', 'provincias.json', 'raw.json']) console.log(f, ((await stat(path.join(OUT, f))).size / 1e6).toFixed(2), 'MB');
console.log(`vendor: ${nv} files verified against SHA256SUMS.txt`);

// cache-busting: stamp the version of app.css / app.js in index.html (browsers and the edge cache them for hours)
{ const idx = path.join(ROOT, 'deploy', 'index.html'); const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12); const html = (await readFile(idx, 'utf8')).replace(/app\.css(\?v=\d+)?"/, `app.css?v=${v}"`).replace(/app\.js(\?v=\d+)?"/, `app.js?v=${v}"`); await writeFile(idx, html); console.log('index.html assets stamped v=' + v); }
