#!/usr/bin/env node
// 01_fetch.mjs — Download NASA FIRMS country archives for Argentina and log provenance.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Sources (NASA FIRMS, active fire archive by country):
//   MODIS C6.1 : https://firms.modaps.eosdis.nasa.gov/data/country/modis/<year>/modis_<year>_Argentina.csv        (2000–2025)
//   VIIRS S-NPP: https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/<year>/viirs-snpp_<year>_Argentina.csv (2012–2025)
//
// Output: data/raw/<file>.csv (git-ignored) + data/raw/MANIFEST.json {url, bytes, sha256, rows, fetched_at}
// Usage:  node scripts/01_fetch.mjs [--force]

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/country';
const FORCE = process.argv.includes('--force');

const targets = [];
for (let y = 2000; y <= 2025; y++) targets.push({ sensor: 'modis', year: y, url: `${BASE}/modis/${y}/modis_${y}_Argentina.csv`, file: `modis_${y}_Argentina.csv` });
for (let y = 2012; y <= 2025; y++) targets.push({ sensor: 'viirs-snpp', year: y, url: `${BASE}/viirs-snpp/${y}/viirs-snpp_${y}_Argentina.csv`, file: `viirs-snpp_${y}_Argentina.csv` });

await mkdir(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'MANIFEST.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};

for (const t of targets) {
  const dest = path.join(OUT, t.file);
  if (!FORCE && manifest[t.file] && existsSync(dest) && (await stat(dest)).size === manifest[t.file].bytes) {
    console.log(`skip   ${t.file} (${manifest[t.file].bytes} B, in manifest)`);
    continue;
  }
  const t0 = Date.now();
  const res = await fetch(t.url);
  if (!res.ok) { console.error(`FAIL   ${t.file} HTTP ${res.status}`); process.exitCode = 1; continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const rows = Math.max(0, buf.toString('latin1').split('\n').filter(l => l.length > 0).length - 1);
  await writeFile(dest, buf);
  manifest[t.file] = { sensor: t.sensor, year: t.year, url: t.url, bytes: buf.length, sha256, rows, fetched_at: new Date().toISOString() };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`fetch  ${t.file} ${buf.length} B rows=${rows} sha256=${sha256.slice(0, 12)}… ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log(`done: ${Object.keys(manifest).length} files in manifest → ${path.relative(ROOT, manifestPath)}`);
