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
//   (3) MODIS STATIC FALSE-ALARM SITES (peer review round 3, 14/11): the FIRMS MODIS `type` flag is not homogeneous across
//       archive versions. Up to 2017 (version 6.2) `type = 2` is 0.4–1.8 % of detections; from 2018 (6.03, 61.03) it is
//       2.3–4.9 %, and the SAME fixed sites flip from type 0 to type 2 at the boundary. Measured on the raw files: the
//       pre-2018 type-0 detections in those cells have a VIIRS same-day co-location of 11 % (76 % elsewhere), are 97 %
//       daytime, FRP 8 MW, peak Dec–Feb (1.5 % co-location): not fire, but hot bare surfaces that MODIS flags and VIIRS
//       does not (Buenos Aires, Santa Fe, Mendoza, Córdoba). Rule: 0.02° cells with >= 3 MODIS type-2 detections in >= 2
//       distinct years of 2018–2025, NOT dilated (a one-cell dilation also swallows the Tucumán sugar-cane fields, which
//       are real recurrent fire). The cells join the static class for both sensors and all years, so that the vegetation
//       population is the same before and after 2018. Effect on the national V/M late/early drift: 1.101 → 1.068.
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
// Secondary rule for INTERMITTENT flares (conventional oil pads vent for weeks, then stop): >= 4 months in any 12-month window
// AND >= 70 % night detections AND >= 10 hotspots. Vegetation fire is diurnal: a 70 % night share over >= 10 detections does
// not occur in grass/forest fire months (audit 14/11: vegetation class night fraction 0.27). Motivated by the two worst LOYO
// provinces (Neuquén, Santa Cruz) being the two oil basins while only 3 Santa Cruz cells met the persistent rule.
// AND median VIIRS FRP < 3 MW: without it the rule also catches night-time agricultural and land-clearing burning (sugar
// cane in Jujuy/Salta, deforestation piles in the Chaco: FRP 3–7 MW), which is vegetation fire. Flares are small and cool.
const INT_MIN_IN_WINDOW = 4, INT_MIN_NIGHT_FRAC = 0.7, INT_MIN_N = 10, INT_MAX_FRP_MW = 3;
const T2_FROM_YEAR = 2018, T2_MIN_N = 3, T2_MIN_YEARS = 2;
export const staticKey = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);

const manifest = JSON.parse(await readFile(path.join(RAW, 'MANIFEST.json'), 'utf8'));
const months = { viirs: new Map(), modis: new Map() }; // key -> Set(yyyy-mm)
const dn = { viirs: new Map(), modis: new Map() };     // key -> [n, night]
const pos = { viirs: new Map(), modis: new Map() };    // key -> [sumLat, sumLon, n] (hotspot centroid inside the cell)
const frpV = new Map();                                 // key -> VIIRS FRP values (for the intermittent rule)
const t2 = new Map();                                   // key -> { n, years:Set, sumLat, sumLon } of MODIS type-2 detections 2018+ (rule 3)

const t0 = Date.now();
for (const [file, meta] of Object.entries(manifest)) {
  if (!['modis', 'viirs-snpp'].includes(meta.sensor)) continue; // exclude the VIIRS SP files used only for the NOAA-20/21 bridge
  const isModis = meta.sensor === 'modis', bag = months[isModis ? 'modis' : 'viirs'];
  const rl = readline.createInterface({ input: createReadStream(path.join(RAW, file)) });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const f = line.split(',');
    if (f.length < 15) continue;
    if (isModis && f[14] === '2' && +f[9] >= 30 && +f[5].slice(0, 4) >= T2_FROM_YEAR) { const k = staticKey(+f[0], +f[1]); let c = t2.get(k); if (!c) t2.set(k, c = { n: 0, years: new Set(), la: 0, lo: 0 }); c.n++; c.years.add(f[5].slice(0, 4)); c.la += +f[0]; c.lo += +f[1]; }
    if (f[14] !== '0') continue;
    if (isModis ? +f[9] < 30 : f[9] === 'l') continue;
    const k = staticKey(+f[0], +f[1]);
    let s = bag.get(k); if (!s) bag.set(k, s = new Set());
    s.add(f[5].slice(0, 7));
    const d = dn[isModis ? 'modis' : 'viirs']; let c = d.get(k); if (!c) d.set(k, c = [0, 0]);
    c[0]++; if (f[13] === 'N') c[1]++;
    const P = pos[isModis ? 'modis' : 'viirs']; let q = P.get(k); if (!q) P.set(k, q = [0, 0, 0]); q[0] += +f[0]; q[1] += +f[1]; q[2]++;
    if (!isModis) { let a = frpV.get(k); if (!a) frpV.set(k, a = []); a.push(+f[12]); }
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
  // night fraction: prefer VIIRS (375 m, 2012+), fall back to MODIS for MODIS-only cells
  const dv = dn.viirs.get(k), dm = dn.modis.get(k);
  const nTot = (dv?.[0] || 0) + (dm?.[0] || 0);
  const nf = dv && dv[0] >= 10 ? dv[1] / dv[0] : dm ? dm[1] / dm[0] : 0;
  const fr = frpV.get(k); const frpMed = fr && fr.length ? [...fr].sort((a, b) => a - b)[Math.floor(fr.length / 2)] : null;
  const persistent = mw >= MIN_IN_WINDOW, intermittent = !persistent && mw >= INT_MIN_IN_WINDOW && nf >= INT_MIN_NIGHT_FRAC && nTot >= INT_MIN_N && frpMed !== null && frpMed < INT_MAX_FRP_MW;
  if (!persistent && !intermittent) continue;
  const [i, j] = k.split(':').map(Number);
  const q = pos.viirs.get(k) || pos.modis.get(k);
  const base = { lat: +((i + 0.5) * CEL).toFixed(3), lon: +((j + 0.5) * CEL).toFixed(3), bbox: [+(i * CEL).toFixed(3), +(j * CEL).toFixed(3), +((i + 1) * CEL).toFixed(3), +((j + 1) * CEL).toFixed(3)],
    centroid: q ? [+(q[0] / q[2]).toFixed(4), +(q[1] / q[2]).toFixed(4)] : null, hotspots: (pos.viirs.get(k)?.[2] || 0) + (pos.modis.get(k)?.[2] || 0),
    viirs_months: 0, modis_months: 0, night_frac: +nf.toFixed(3), frp_median_viirs: frpMed === null ? null : +frpMed.toFixed(2), rule: persistent ? 'persistent' : 'intermittent-night', sensors: [] };
  if (persistent && nf < MIN_NIGHT_FRAC) { const r = (rejected[k] ??= base); r[sensor + '_months'] = mw; r.sensors.push(sensor); continue; }
  const c = (cells[k] ??= base);
  c[sensor + '_months'] = mw; c.sensors.push(sensor);
}
// rule 3: MODIS static false-alarm sites (see header)
let t2New = 0, t2Overlap = 0;
for (const [k, c] of t2) {
  if (c.n < T2_MIN_N || c.years.size < T2_MIN_YEARS) continue;
  if (cells[k]) { cells[k].modis_type2_2018plus = c.n; t2Overlap++; continue; }
  const [i, j] = k.split(':').map(Number); const dv = dn.viirs.get(k), dm = dn.modis.get(k);
  cells[k] = { lat: +((i + 0.5) * CEL).toFixed(3), lon: +((j + 0.5) * CEL).toFixed(3), bbox: [+(i * CEL).toFixed(3), +(j * CEL).toFixed(3), +((i + 1) * CEL).toFixed(3), +((j + 1) * CEL).toFixed(3)],
    centroid: [+(c.la / c.n).toFixed(4), +(c.lo / c.n).toFixed(4)], hotspots: (dv?.[0] || 0) + (dm?.[0] || 0) + c.n, viirs_months: months.viirs.has(k) ? maxInWindow(months.viirs.get(k)) : 0, modis_months: months.modis.has(k) ? maxInWindow(months.modis.get(k)) : 0,
    night_frac: dv && dv[0] >= 10 ? +(dv[1] / dv[0]).toFixed(3) : dm ? +(dm[1] / dm[0]).toFixed(3) : 0, frp_median_viirs: null, rule: 'modis-type2-static', sensors: ['modis'], modis_type2_2018plus: c.n, modis_type2_years: c.years.size };
  t2New++;
}
console.log(`rule 3 (MODIS type-2 sites 2018+, n>=${T2_MIN_N} in >=${T2_MIN_YEARS} years): ${t2New} new cells, ${t2Overlap} already in the class`);
const by_prov = {};
for (const c of Object.values(cells)) { const p = provinceOf(c.lat, c.lon) || '(outside)'; by_prov[p] = (by_prov[p] || 0) + 1; }
await mkdir(path.join(ROOT, 'data', 'agg'), { recursive: true });
const rej_by_prov = {};
for (const c of Object.values(rejected)) { const p = provinceOf(c.lat, c.lon) || '(outside)'; rej_by_prov[p] = (rej_by_prov[p] || 0) + 1; }
const byRule = {}; for (const c of Object.values(cells)) byRule[c.rule] = (byRule[c.rule] || 0) + 1;
const intByProv = {}; for (const c of Object.values(cells)) if (c.rule === 'intermittent-night') { const p = provinceOf(c.lat, c.lon) || '(outside)'; intByProv[p] = (intByProv[p] || 0) + 1; }
console.log(`rules: ${JSON.stringify(byRule)} · intermittent-night by province: ${Object.entries(intByProv).sort((a, b) => b[1] - a[1]).map(([p, n]) => p.split(',')[0] + ' ' + n).join(', ')}`);
await writeFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), JSON.stringify({ rule: { cell_deg: CEL, min_months_in_window: MIN_IN_WINDOW, window_months: WINDOW, min_night_fraction: MIN_NIGHT_FRAC, intermittent: { min_months_in_window: INT_MIN_IN_WINDOW, min_night_fraction: INT_MIN_NIGHT_FRAC, min_hotspots: INT_MIN_N, max_median_viirs_frp_mw: INT_MAX_FRP_MW }, modis_type2_static: { from_year: T2_FROM_YEAR, min_detections: T2_MIN_N, min_years: T2_MIN_YEARS, dilation: 0 }, detected_on: 'union(VIIRS S-NPP 2012-2025, MODIS 2000-2025)' }, by_rule: byRule, generated: new Date().toISOString(), n: Object.keys(cells).length, cells, by_prov, rejected_by_night: { n: Object.keys(rejected).length, by_prov: rej_by_prov, cells: rejected } }));
console.log(`persistent but DIURNAL (returned to vegetation fire): ${Object.keys(rejected).length} cells → ${Object.entries(rej_by_prov).sort((a, b) => b[1] - a[1]).map(([p, n]) => p.split(',')[0] + ' ' + n).join(', ')}`);
const nV = Object.values(cells).filter(c => c.sensors.includes('viirs')).length, nM = Object.values(cells).filter(c => c.sensors.includes('modis')).length, both = Object.values(cells).filter(c => c.sensors.length === 2).length;
console.log(`static-source cells: ${Object.keys(cells).length} (viirs ${nV}, modis ${nM}, both ${both}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const [p, n] of Object.entries(by_prov).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${p}`);
