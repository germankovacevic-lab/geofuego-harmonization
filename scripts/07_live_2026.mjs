#!/usr/bin/env node
// 07_live_2026.mjs — preliminary 2026 series per 0.25° cell from the FIRMS Area API (the app's "current year" layer).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Independent of any GeoFuego infrastructure: everything comes from NASA FIRMS and from this repository.
//   Source per satellite (S-NPP, NOAA-20, NOAA-21):  VIIRS_<SAT>_SP  for 2026-01-01 → SP end (standard processing, has `type`)
//                                                     VIIRS_<SAT>_NRT for the days after SP (near real time, no `type` column)
//   Filters: confidence != low; type == 0 where the column exists; detections inside a static-source 0.02° cell
//            (data/agg/static_cells.json, same class as the archive) go to the STATIC column, never to the vegetation count.
//   Bridge (data/factors/bridge.json, 04b): NOAA-20 and NOAA-21 counts are divided by g (0.979 / 0.951) → S-NPP-equivalent.
//   Combination: per DAY, the S-NPP-equivalent count of a cell is the mean over the satellites operating that day
//            (a satellite operates on a day when it reports >= OPERATING_MIN vegetation detections nationally); months
//            carry the number of days with 3 / 2 / 1 / 0 operating satellites, so partial coverage is visible (R12).
//   Output: data/harmonized/cells_2026.json  { generated, data_through, sources, bridge, cells: { id: { h:[12], st:[12] } },
//            months: [{ m, days, d3, d2, d1, d0, through }], national: { h:[12], st:[12] }, note }
//   Raw CSVs are cached in data/raw/ (gitignored) and recorded in data/raw/MANIFEST.json with sha256.
// Usage: node scripts/07_live_2026.mjs [--year=2026] [--refresh]   (needs ~/.config/nasa/firms-map-key)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { cellOf } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const YEAR = +arg('year', '2026');
const REFRESH = process.argv.includes('--refresh');
const KEY = (await readFile(path.join(homedir(), '.config', 'nasa', 'firms-map-key'), 'utf8')).trim();
const BBOX = '-74,-55,-53,-21';
const SATS = { SNPP: 'S-NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21' };
const OPERATING_MIN = 5;

const STATIC = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), 'utf8'));
const staticSet = new Set(Object.keys(STATIC.cells));
const CEL = STATIC.rule.cell_deg;
const staticKey = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);
const BRIDGE = JSON.parse(await readFile(path.join(ROOT, 'data', 'factors', 'bridge.json'), 'utf8'));
// land cells of Argentina (02_grid): the bbox also covers parts of Chile, Bolivia, Paraguay, Uruguay and Brazil; `national` sums land cells only
const HARM = JSON.parse(await readFile(path.join(ROOT, 'data', 'harmonized', 'cells.json'), 'utf8'));
const landSet = new Set(Object.keys(HARM.cells).map(Number));
const G = { SNPP: 1, NOAA20: BRIDGE.sats.NOAA20.country.g, NOAA21: BRIDGE.sats.NOAA21.country.g };

await mkdir(RAW, { recursive: true });
const manifestPath = path.join(RAW, 'MANIFEST.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    const txt = await res.text();
    if (res.ok && txt.startsWith('latitude')) return txt;
    process.stderr.write(`  retry ${i + 1}: HTTP ${res.status} ${txt.slice(0, 80).replace(/\n/g, ' ')}\n`);
    await sleep(3000 * (i + 1));
  }
  throw new Error('FIRMS API failed: ' + url.replace(KEY, 'KEY'));
}

// availability: which dates each source serves
const avail = {}; // 'VIIRS_SNPP_SP' -> [from, to]
const availTxt = await (await fetch(`https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${KEY}/ALL`)).text();
for (const line of availTxt.split('\n')) {
  const [id, from, to] = line.split(','); if (id && /^VIIRS_(SNPP|NOAA20|NOAA21)_(SP|NRT)$/.test(id)) avail[id] = [from, to];
}
if (!Object.keys(avail).length) throw new Error('data_availability unavailable');
console.log('availability:', JSON.stringify(avail));

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const yStart = new Date(Date.UTC(YEAR, 0, 1)), yEnd = new Date(Math.min(Date.UTC(YEAR + 1, 0, 1), today.getTime() + 864e5)); // exclusive

/** fetch one source for [from, to) in ≤5-day chunks → CSV text (header + rows); cached per source/year unless --refresh */
async function fetchRange(src, from, to) {
  const file = `viirs-live_${src}_${YEAR}_${iso(from)}_${iso(addDays(to, -1))}.csv`, dest = path.join(RAW, file);
  // reuse a cached file for the same source/year whose range ends at the same day (NRT grows daily → a new file each day)
  if (!REFRESH && manifest[file] && existsSync(dest)) { console.log(`cache  ${file}`); return await readFile(dest, 'utf8'); }
  let header = null, body = '', rows = 0; const t0 = Date.now();
  for (let d = new Date(from); d < to; d = addDays(d, 5)) {
    const days = Math.min(5, Math.round((to - d) / 864e5));
    const txt = await get(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEY}/${src}/${BBOX}/${days}/${iso(d)}`);
    const lines = txt.split('\n').filter(l => l.length);
    if (!header) header = lines[0]; else if (lines[0] !== header) throw new Error('header mismatch ' + src);
    body += lines.slice(1).join('\n') + (lines.length > 1 ? '\n' : ''); rows += lines.length - 1;
    process.stderr.write(`${src} ${iso(d)}+${days}d rows=${lines.length - 1} total=${rows}        \r`);
  }
  const buf = Buffer.from(header + '\n' + body);
  await writeFile(dest, buf);
  manifest[file] = { sensor: src.toLowerCase(), year: YEAR, range: [iso(from), iso(addDays(to, -1))], url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/${src}/${BBOX}/5/<date>`, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), rows, fetched_at: new Date().toISOString() };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nfetch  ${file} rows=${rows} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return buf.toString();
}

// per satellite: day -> national vegetation count; cell -> day -> [veg, static]
const perSat = {};
const sources = [];
let dataThrough = null;
for (const sat of Object.keys(SATS)) {
  const sp = avail[`VIIRS_${sat}_SP`], nrt = avail[`VIIRS_${sat}_NRT`];
  const segs = [];
  if (sp) { const a = new Date(Math.max(yStart, Date.parse(sp[0]))), b = new Date(Math.min(yEnd, Date.parse(sp[1]) + 864e5)); if (a < b) segs.push([`VIIRS_${sat}_SP`, a, b]); }
  if (nrt) { const lastSp = segs.length ? segs[0][2] : yStart; const a = new Date(Math.max(lastSp, Date.parse(nrt[0]), yStart)), b = new Date(Math.min(yEnd, Date.parse(nrt[1]) + 864e5)); if (a < b) segs.push([`VIIRS_${sat}_NRT`, a, b]); }
  const S = perSat[sat] = { national: {}, cells: {}, kept: 0, read: 0, staticN: 0, dropConf: 0, dropType: 0, outside: 0 };
  for (const [src, a, b] of segs) {
    const txt = await fetchRange(src, a, b);
    const lines = txt.split('\n'); const cols = lines[0].split(',');
    const iLat = cols.indexOf('latitude'), iLon = cols.indexOf('longitude'), iDate = cols.indexOf('acq_date'), iConf = cols.indexOf('confidence'), iType = cols.indexOf('type');
    for (let k = 1; k < lines.length; k++) {
      const f = lines[k].split(','); if (f.length < 10) continue; S.read++;
      if (f[iConf] === 'l' || f[iConf] === 'low') { S.dropConf++; continue; }
      if (iType >= 0 && f[iType] !== '0') { S.dropType++; continue; }
      const lat = +f[iLat], lon = +f[iLon], cell = cellOf(lat, lon); if (cell === null) { S.outside++; continue; }
      const day = f[iDate]; const isStatic = staticSet.has(staticKey(lat, lon));
      const c = (S.cells[cell] ??= {}); const d = (c[day] ??= [0, 0]); d[isStatic ? 1 : 0]++;
      if (!isStatic) S.national[day] = (S.national[day] || 0) + 1;
      S.kept++; if (isStatic) S.staticN++;
      if (!dataThrough || day > dataThrough) dataThrough = day;
    }
    sources.push({ source: src, from: iso(a), through: iso(addDays(b, -1)), satellite: SATS[sat], has_type_column: iType >= 0 });
  }
  console.log(`${SATS[sat]}: read ${S.read} kept ${S.kept} static ${S.staticN} dropConf ${S.dropConf} dropType ${S.dropType} outside ${S.outside} days ${Object.keys(S.national).length}`);
}

// operating satellites per day
const days = []; for (let d = new Date(yStart); d < yEnd && iso(d) <= dataThrough; d = addDays(d, 1)) days.push(iso(d));
const operating = {}; for (const day of days) operating[day] = Object.keys(SATS).filter(s => (perSat[s].national[day] || 0) >= OPERATING_MIN);

// combine → per cell per month, S-NPP-equivalent
const cells = {}; const national = { h: Array(12).fill(0), st: Array(12).fill(0) };
const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, days: 0, d3: 0, d2: 0, d1: 0, d0: 0, through: null }));
for (const day of days) {
  const m = +day.slice(5, 7) - 1, ops = operating[day]; const M = months[m]; M.days++; M[`d${ops.length}`]++; M.through = day;
  if (!ops.length) continue;
  const touched = new Set(); for (const s of ops) for (const c of Object.keys(perSat[s].cells)) if (perSat[s].cells[c][day]) touched.add(c);
  for (const c of touched) {
    let h = 0, st = 0; for (const s of ops) { const v = perSat[s].cells[c]?.[day]; if (v) { h += v[0] / G[s]; st += v[1] / G[s]; } }
    h /= ops.length; st /= ops.length;
    const C = (cells[c] ??= { h: Array(12).fill(0), st: Array(12).fill(0) }); C.h[m] += h; C.st[m] += st; if (landSet.has(+c)) { national.h[m] += h; national.st[m] += st; }
  }
}
for (const C of Object.values(cells)) { C.h = C.h.map(v => +v.toFixed(1)); C.st = C.st.map(v => +v.toFixed(1)); }
national.h = national.h.map(v => Math.round(v)); national.st = national.st.map(v => Math.round(v));
// months with no data at all (future) → null
for (const M of months) if (!M.days) { for (const C of Object.values(cells)) { C.h[M.m - 1] = null; C.st[M.m - 1] = null; } national.h[M.m - 1] = null; national.st[M.m - 1] = null; }

const out = {
  generated: new Date().toISOString(), year: YEAR, data_through: dataThrough, sources, operating_rule: `a satellite counts as operating on a day when it reports >= ${OPERATING_MIN} vegetation detections over Argentina`,
  bridge: { 'NOAA-20': G.NOAA20, 'NOAA-21': G.NOAA21, unit: 'S-NPP-equivalent VIIRS 375 m pixels (count / g); per day, mean over operating satellites' },
  static_rule: 'detections inside the static-source class (data/agg/static_cells.json, 0.02° cells) are counted in st, never in h',
  months, national_note: 'national = sum over the 4 193 land cells of Argentina (data/harmonized/cells.json); cells outside them (neighbouring countries, sea) are kept in `cells` but not in `national`', national, n_cells: Object.keys(cells).length, cells,
  note: 'PRELIMINARY, near-real-time, month to date. Produced by scripts written with SI assistance (Claude, Anthropic); all values computed from NASA FIRMS Area API (VIIRS S-NPP, NOAA-20, NOAA-21; standard processing where available, NRT otherwise). Not part of the harmonized record 2000-2025. License CC BY 4.0. GeoFuego Harmonization, NASA Space Apps 2026.'
};
await writeFile(path.join(ROOT, 'data', 'harmonized', 'cells_2026.json'), JSON.stringify(out));
console.log(`\ndata through ${dataThrough} · cells ${out.n_cells} · national S-NPP-eq by month: ${national.h.map(v => v ?? '-').join(' ')}`);
console.log('operating days per month (d3/d2/d1/d0): ' + months.filter(x => x.days).map(x => `${x.m}:${x.d3}/${x.d2}/${x.d1}/${x.d0}`).join(' '));
