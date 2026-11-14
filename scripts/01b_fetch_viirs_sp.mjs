#!/usr/bin/env node
// 01b_fetch_viirs_sp.mjs — Download VIIRS standard-processing (SP) archives for S-NPP, NOAA-20 and NOAA-21 over Argentina
// from the NASA FIRMS Area API, to fit the S-NPP ↔ NOAA-20/21 bridge (S-NPP stopped on 2026-11-01).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// API: https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/<SOURCE>/<bbox>/<days≤5>/<YYYY-MM-DD>
// bbox Argentina = -74,-55,-53,-21 · 5-day windows · MAP_KEY from ~/.config/nasa/firms-map-key (never committed)
// Output: data/raw/viirs-sp_<SAT>_<year>_Argentina.csv (+ MANIFEST entries with sha256) · log to stderr
// Usage: node scripts/01b_fetch_viirs_sp.mjs [--years=2023-2025] [--sats=SNPP,NOAA20,NOAA21]

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'raw');
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const [Y0, Y1] = arg('years', '2023-2025').split('-').map(Number);
const SATS = arg('sats', 'SNPP,NOAA20,NOAA21').split(',');
const KEY = (await readFile(path.join(homedir(), '.config', 'nasa', 'firms-map-key'), 'utf8')).trim();
const BBOX = '-74,-55,-53,-21';
await mkdir(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'MANIFEST.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    const txt = await res.text();
    if (res.ok && txt.startsWith('latitude')) return txt;
    process.stderr.write(`  retry ${i + 1}: HTTP ${res.status} ${txt.slice(0, 60).replace(/\n/g, ' ')}\n`);
    await sleep(3000 * (i + 1));
  }
  throw new Error('FIRMS API failed: ' + url.replace(KEY, 'KEY'));
}

for (const sat of SATS) for (let y = Y0; y <= Y1; y++) {
  const file = `viirs-sp_${sat}_${y}_Argentina.csv`, dest = path.join(OUT, file);
  if (manifest[file] && existsSync(dest)) { console.log(`skip   ${file}`); continue; }
  const t0 = Date.now(); let header = null, rows = 0, body = '';
  for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 5)) {
    const day = d.toISOString().slice(0, 10);
    const days = Math.min(5, Math.round((Date.UTC(y + 1, 0, 1) - d.getTime()) / 864e5));
    const txt = await get(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEY}/VIIRS_${sat}_SP/${BBOX}/${days}/${day}`);
    const lines = txt.split('\n').filter(l => l.length);
    if (!header) header = lines[0]; else if (lines[0] !== header) throw new Error('header mismatch ' + file);
    body += lines.slice(1).join('\n') + (lines.length > 1 ? '\n' : ''); rows += lines.length - 1;
    process.stderr.write(`${sat} ${day}+${days}d rows=${lines.length - 1} total=${rows}\r`);
  }
  const buf = Buffer.from(header + '\n' + body);
  await writeFile(dest, buf);
  manifest[file] = { sensor: `viirs-sp-${sat.toLowerCase()}`, year: y, url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_${sat}_SP/${BBOX}/5/<date>`, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), rows, fetched_at: new Date().toISOString() };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nfetch  ${file} rows=${rows} ${(buf.length / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
