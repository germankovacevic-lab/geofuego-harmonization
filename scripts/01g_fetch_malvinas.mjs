#!/usr/bin/env node
// 01g_fetch_malvinas.mjs — v1.1.0 coverage addition: Islas Malvinas.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Why: the NASA FIRMS country archive "Argentina" (01_fetch.mjs) does not include the Islas Malvinas, which are part of the
// province of Tierra del Fuego, Antártida e Islas del Atlántico Sur (Ley 23.775; Instituto Geográfico Nacional, IGN).
// FIRMS distributes their detections in a separate country archive whose identifier is "Falkland_Islands"; the file names are
// kept exactly as published so that URLs and SHA-256 can be verified. Years with no detections have no file (HTTP 404).
// No FIRMS archive exists for Islas Georgias del Sur / Sandwich del Sur (checked; only volcanic anomalies would be expected there).
//
// Output: data/raw/<file>.csv (git-ignored) + data/raw/MANIFEST_malvinas.json {url, bytes, sha256, rows, fetched_at}
// Usage:  node scripts/01g_fetch_malvinas.mjs [--force]

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/country';
const ID = 'Falkland_Islands'; // FIRMS archive identifier for the Islas Malvinas
const FORCE = process.argv.includes('--force');

const targets = [];
for (let y = 2000; y <= 2025; y++) targets.push({ sensor: 'modis', year: y, url: `${BASE}/modis/${y}/modis_${y}_${ID}.csv`, file: `modis_${y}_${ID}.csv` });
for (let y = 2012; y <= 2025; y++) targets.push({ sensor: 'viirs-snpp', year: y, url: `${BASE}/viirs-snpp/${y}/viirs-snpp_${y}_${ID}.csv`, file: `viirs-snpp_${y}_${ID}.csv` });

await mkdir(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'MANIFEST_malvinas.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};

for (const t of targets) {
  const dest = path.join(OUT, t.file);
  if (!FORCE && manifest[t.file] && existsSync(dest) && (await stat(dest)).size === manifest[t.file].bytes) { console.log(`skip   ${t.file}`); continue; }
  const res = await fetch(t.url);
  if (res.status === 404) { console.log(`none   ${t.file} (no detections that year)`); continue; }
  if (!res.ok) { console.error(`FAIL   ${t.file} HTTP ${res.status}`); process.exitCode = 1; continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const rows = Math.max(0, buf.toString('latin1').split('\n').filter(l => l.length > 0).length - 1);
  await writeFile(dest, buf);
  manifest[t.file] = { sensor: t.sensor, year: t.year, url: t.url, bytes: buf.length, sha256, rows, fetched_at: new Date().toISOString() };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`fetch  ${t.file} ${buf.length} B rows=${rows} sha256=${sha256.slice(0, 12)}…`);
}
console.log(`done: ${Object.keys(manifest).length} files → ${path.relative(ROOT, manifestPath)}`);
