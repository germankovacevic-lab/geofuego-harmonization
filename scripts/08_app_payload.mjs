#!/usr/bin/env node
// 08_app_payload.mjs — assemble the static payload of the web app (deploy/data) and verify the vendored libraries.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//   deploy/data/cells.json       ← data/harmonized/cells.json (served by Cloudflare Pages with on-the-fly compression)
//   deploy/data/cells_2026.json  ← data/harmonized/cells_2026.json (07_live_2026.mjs; preliminary current year)
//   deploy/data/raw.json         ← data/agg/counts.json (MODIS Terra+Aqua, VIIRS S-NPP, 2001–2025) + data/agg/viirs_sp_annual.json
//                                  (VIIRS S-NPP / NOAA-20 / NOAA-21 standard processing, 2023–2025; rebuilt here from
//                                  data/raw/viirs-sp_*.csv when those files are present, read as versioned otherwise)
//   deploy/data/oni.json         ← data/external/oni/oni.ascii.txt, { "YYYY-M": ONI } for 2000–2011 (interval widening pre-2012)
//   deploy/assets/cases/         — before / after NASA images of the notable fire events (01f_fetch_case_images.mjs), checked
//                                  here against the sha256 recorded in deploy/assets/cases/cases.json
//   deploy/vendor/               — Leaflet 1.9.4, Leaflet.draw 1.0.4, uPlot 1.6.31 with their LICENSE files, versioned in the
//                                  repository and checked here against deploy/vendor/SHA256SUMS.txt (no private paths involved)
// Usage: node scripts/08_app_payload.mjs

import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVINCIAS } from '../lib/provincias.js';
import { cellOf, provinceOf } from '../lib/geo.js';

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
// Per satellite 2023–2025 (table of the same panel): vs / n20 / n21 = VIIRS S-NPP / NOAA-20 / NOAA-21 hotspots from the FIRMS
// Area API standard-processing files of the bridge (01b_fetch_viirs_sp), ALL days (04b_bridge counts paired days only because
// it fits a factor; here the base must match v, which is all days), same filters as 04b: type 0, confidence not low, static
// cells excluded, inside an Argentine province (the files cover the bounding box, the country archive behind v is clipped).
// The per-cell counts are kept in data/agg/viirs_sp_annual.json (versioned, no timestamp: byte-identical between runs) so the
// payload can be rebuilt without the raw CSVs, which are not committed.
{
  const C = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
  const iV = C.columns.indexOf('V'), iT = C.columns.indexOf('T'), iA = C.columns.indexOf('A');
  const RY0 = 2001, RY1 = 2025, cells = {};
  for (const [id, byYear] of Object.entries(C.cells)) {
    const m = Array(RY1 - RY0 + 1).fill(0), v = Array(RY1 - RY0 + 1).fill(0); let any = false;
    for (const [y, byMonth] of Object.entries(byYear)) { const k = +y - RY0; if (k < 0 || k > RY1 - RY0) continue; for (const r of Object.values(byMonth)) { m[k] += r[iT] + r[iA]; v[k] += r[iV]; any = true; } }
    if (any) cells[id] = { m, v };
  }
  // --- per-satellite VIIRS standard processing, 2023–2025 ---
  const SPY = [2023, 2024, 2025], SATS = ['SNPP', 'NOAA20', 'NOAA21'], KEY = { SNPP: 'vs', NOAA20: 'n20', NOAA21: 'n21' };
  const RAWD = path.join(ROOT, 'data', 'raw'), SPF = path.join(ROOT, 'data', 'agg', 'viirs_sp_annual.json');
  const spFile = (s, y) => path.join(RAWD, `viirs-sp_${s}_${y}_Argentina.csv`);
  let SP = null;
  if (SATS.every(s => SPY.every(y => existsSync(spFile(s, y))))) {
    const ST = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), 'utf8'));
    const CEL = ST.rule.cell_deg, staticSet = new Set(Object.keys(ST.cells)), sKey = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);
    const land = new Set(JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8')).cells.map(c => c.id));
    const spCells = {}, coverage = {};
    for (const s of SATS) {
      coverage[s] = {};
      for (const [yi, y] of SPY.entries()) {
        const rl = readline.createInterface({ input: createReadStream(spFile(s, y)) }); let cols = null; const days = new Set();
        for await (const line of rl) {
          const f = line.split(',');
          if (!cols) { cols = Object.fromEntries(f.map((c, i) => [c, i])); continue; }
          if (f.length < 10) continue;
          days.add(f[cols.acq_date]); // days with any detection in the file, before filters: tells a partial year from a full one
          if (cols.type !== undefined && f[cols.type] !== '0') continue;
          if (f[cols.confidence] === 'l') continue;
          const lat = +f[cols.latitude], lon = +f[cols.longitude];
          if (staticSet.has(sKey(lat, lon)) || !provinceOf(lat, lon)) continue;
          const id = cellOf(lat, lon); if (id == null || !land.has(id)) continue;
          ((spCells[id] ??= {})[s] ??= SPY.map(() => 0))[yi]++;
        }
        const ds = [...days].sort(); coverage[s][y] = { first: ds[0], last: ds[ds.length - 1], days: ds.length };
      }
    }
    for (const c of Object.values(spCells)) for (const s of SATS) c[s] ??= SPY.map(() => 0);
    SP = { source: 'NASA FIRMS Area API, VIIRS standard processing (S-NPP, NOAA-20, NOAA-21), Argentina, annual hotspot counts per 0.25° cell, all days; filters: type 0, confidence not low, static-source cells excluded (data/agg/static_cells.json), inside an Argentine province; coverage = first / last day and number of days with detections in each source file; produced by 08_app_payload.mjs from data/raw/viirs-sp_*.csv (01b_fetch_viirs_sp.mjs)', years: SPY, coverage, cells: spCells };
    await writeFile(SPF, JSON.stringify(SP));
  } else if (existsSync(SPF)) {
    SP = JSON.parse(await readFile(SPF, 'utf8'));
    process.stderr.write('08_app_payload: data/raw/viirs-sp_*.csv not all present; per-satellite counts read from data/agg/viirs_sp_annual.json\n');
  } else process.stderr.write('08_app_payload: WARNING no data/raw/viirs-sp_*.csv and no data/agg/viirs_sp_annual.json; raw.json is written without the per-satellite columns (vs, n20, n21)\n');
  let sp;
  if (SP) {
    // a year is partial for a satellite when its file does not start in January or does not end in December
    const partial = {};
    for (const s of SATS) for (const y of SP.years) { const c = SP.coverage[s][y], m0 = +c.first.slice(5, 7), m1 = +c.last.slice(5, 7); if (m0 > 1 || m1 < 12) (partial[KEY[s]] ??= {})[y] = [m0, m1]; }
    let added = 0;
    for (const [id, c] of Object.entries(SP.cells)) {
      if (!cells[id]) { cells[id] = { m: Array(RY1 - RY0 + 1).fill(0), v: Array(RY1 - RY0 + 1).fill(0) }; added++; }
      for (const s of SATS) cells[id][KEY[s]] = c[s];
    }
    sp = { y0: SP.years[0], y1: SP.years[SP.years.length - 1], partial };
    // verification: country totals per year, archive S-NPP (v) against the three standard-processing satellites
    const tot = SP.years.map((y, yi) => { const r = { y, v: 0, vs: 0, n20: 0, n21: 0 }; for (const c of Object.values(cells)) { r.v += c.v[y - RY0]; if (c.vs) { r.vs += c.vs[yi]; r.n20 += c.n20[yi]; r.n21 += c.n21[yi]; } } return r; });
    console.log(`per-satellite VIIRS, country totals (vegetation class, all days); cells added to raw.json with no archive count: ${added}`);
    console.log('year      v (archive)  vs (S-NPP SP)  n20      n21      vs/v    n20/vs  n21/vs');
    const bad = [];
    for (const r of tot) {
      const q = (a, b) => (a / b).toFixed(3), pn = partial.n21?.[r.y], p20 = partial.n20?.[r.y], pvs = partial.vs?.[r.y];
      console.log(`${r.y}      ${String(r.v).padEnd(12)} ${String(r.vs).padEnd(14)} ${String(r.n20).padEnd(8)} ${String(r.n21).padEnd(8)} ${q(r.vs, r.v)}   ${q(r.n20, r.vs)}${p20 ? '*' : ' '}  ${q(r.n21, r.vs)}${pn ? '*' : ' '}`);
      if (!pvs && Math.abs(r.vs / r.v - 1) > 0.02) bad.push(`${r.y} vs/v ${q(r.vs, r.v)}`);
      if (!pvs && !p20 && (r.n20 / r.vs < 0.90 || r.n20 / r.vs > 1.10)) bad.push(`${r.y} n20/vs ${q(r.n20, r.vs)}`);
      if (!pvs && !pn && (r.n21 / r.vs < 0.90 || r.n21 / r.vs > 1.10)) bad.push(`${r.y} n21/vs ${q(r.n21, r.vs)}`);
    }
    if (Object.keys(partial).length) console.log('* partial year, left out of the range check: ' + JSON.stringify(partial) + ' (first and last month with data in the source file)');
    console.log('expected: vs/v within 2 % of 1; n20/vs and n21/vs within 0.90–1.10 (published bridge on paired days: 0.979 and 0.951)');
    if (bad.length) { console.error('08_app_payload: per-satellite totals out of the expected range: ' + bad.join(', ')); process.exit(1); }
  }
  await writeFile(path.join(OUT, 'raw.json'), JSON.stringify({ source: 'NASA FIRMS, annual raw hotspot counts per 0.25° cell (vegetation class, static sources excluded); m = MODIS Terra+Aqua and v = VIIRS S-NPP from the country archives (data/agg/counts.json)' + (sp ? '; vs / n20 / n21 = VIIRS S-NPP / NOAA-20 / NOAA-21 from the FIRMS Area API standard-processing files, years sp.y0–sp.y1, all days, same filters, inside an Argentine province (data/agg/viirs_sp_annual.json); sp.partial[column][year] = [first month, last month] with data when the source file does not cover the whole year' : '') + '; produced by 08_app_payload.mjs', y0: RY0, y1: RY1, ...(sp ? { sp } : {}), cells }));
}
// skill.json: out-of-sample fire-season error (LOYO 2012–2023, Terra+Aqua set) shown in the app's summary strip:
// country (loyo_summary), per province (loyo_by_province) and per area size (aoi_error_curve, random contiguous blocks)
{
  const V = path.join(ROOT, 'data', 'validation'); const rd = async f => (await readFile(path.join(V, f), 'utf8')).trim().split('\n').map(l => l.split(','));
  const sum = await rd('loyo_summary.csv'); const h = sum[0]; const country = sum.find(r => r[h.indexOf('set')] === 'TA' && r[h.indexOf('level')] === 'country');
  const bp = await rd('loyo_by_province.csv'); const hp = bp[0]; const prov = {};
  for (const r of bp.slice(1)) if (r[hp.indexOf('set')] === 'TA') prov[r[hp.indexOf('prov')]] = { mape: +r[hp.indexOf('season_mape_mean')], folds: +r[hp.indexOf('n_folds')] };
  const curve = JSON.parse(await readFile(path.join(V, 'aoi_error_curve.json'), 'utf8')).curve.map(c => ({ n: c.n_cells_nominal, mape: c.season_mape_mean }));
  await writeFile(path.join(OUT, 'skill.json'), JSON.stringify({ source: 'data/validation: loyo_summary.csv, loyo_by_province.csv, aoi_error_curve.json — fire-season mean absolute percentage error, leave-one-year-out 2012–2023, Terra+Aqua set', country: +country[h.indexOf('season_mape')], country_scalar: +country[h.indexOf('season_mape_scalar')], prov, curve }));
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
for (const f of ['cells.json', 'cells_2026.json', 'oni.json', 'provincias.json', 'raw.json', 'skill.json']) console.log(f, ((await stat(path.join(OUT, f))).size / 1e6).toFixed(2), 'MB');
console.log(`vendor: ${nv} files verified against SHA256SUMS.txt`);
// context images of the notable fire events (01f_fetch_case_images.mjs): every file must match the sha256 recorded in cases.json
{
  const CD = path.join(ROOT, 'deploy', 'assets', 'cases'); let nc = 0, badc = 0;
  if (existsSync(path.join(CD, 'cases.json'))) {
    const J = JSON.parse(await readFile(path.join(CD, 'cases.json'), 'utf8'));
    for (const [id, c] of Object.entries(J.cases)) for (const k of ['before', 'after']) { nc++; const f = path.join(CD, c[k].file); const h = existsSync(f) ? createHash('sha256').update(await readFile(f)).digest('hex') : null; if (h !== c[k].sha256) { badc++; console.error('case image missing or altered:', c[k].file); } }
    if (badc) { console.error(`08_app_payload: ${badc} case image(s) do not match deploy/assets/cases/cases.json (run scripts/01f_fetch_case_images.mjs)`); process.exit(1); }
    console.log(`case images: ${nc} files verified against cases.json`);
  } else process.stderr.write('08_app_payload: deploy/assets/cases/cases.json not found; the app runs without the before / after images of the notable fire events\n');
}

// cache-busting: stamp the version of app.css / app.js in index.html (browsers and the edge cache them for hours)
{ const idx = path.join(ROOT, 'deploy', 'index.html'); const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12); const html = (await readFile(idx, 'utf8')).replace(/app\.css(\?v=\d+)?"/, `app.css?v=${v}"`).replace(/app\.js(\?v=\d+)?"/, `app.js?v=${v}"`); await writeFile(idx, html); console.log('index.html assets stamped v=' + v); }
