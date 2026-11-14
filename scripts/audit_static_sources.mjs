#!/usr/bin/env node
// audit_static_sources.mjs — Independent checks on the persistent-thermal-source classification (03a).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
// The rule used only "months with hotspots"; these checks use variables the rule never saw:
//   day/night flag, FRP, FIRMS type=2 (NASA's own static-source label), seasonality, threshold sensitivity.
// Output: data/agg/audit_static.json, data/agg/static_cells.kml (for Google Earth)

import { createReadStream } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provinceOf } from '../lib/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const manifest = JSON.parse(await readFile(path.join(RAW, 'MANIFEST.json'), 'utf8'));
const S = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'static_cells.json'), 'utf8'));
const CEL = S.rule.cell_deg, key = (lat, lon) => Math.floor(lat / CEL) + ':' + Math.floor(lon / CEL);
const isStatic = new Set(Object.keys(S.cells));

// ---- pass 1: signatures (VIIRS only, 2012-2025; MODIS for type-2 too) ----
const sig = { static: { n: 0, night: 0, frp: [], type2: 0, byMonth: Array(13).fill(0) }, veg: { n: 0, night: 0, frp: [], type2: 0, byMonth: Array(13).fill(0) } };
const months03 = new Map(); // for sensitivity: key(0.03) -> Set(yyyy-mm), VIIRS
const months02 = new Map(); // key(0.02) -> Set(yyyy-mm), VIIRS
const provTot = {};         // prov -> {veg, static} VIIRS counts
for (const [file, meta] of Object.entries(manifest)) {
  if (meta.sensor !== 'viirs-snpp') continue;
  const rl = readline.createInterface({ input: createReadStream(path.join(RAW, file)) });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const f = line.split(','); if (f.length < 15 || f[9] === 'l') continue;
    const lat = +f[0], lon = +f[1], k = key(lat, lon), st = isStatic.has(k);
    const g = st ? sig.static : sig.veg;
    if (f[14] === '2') { g.type2++; continue; }           // NASA's own static label (we dropped these in 03)
    if (f[14] !== '0') continue;
    g.n++; if (f[13] === 'N') g.night++; g.byMonth[+f[5].slice(5, 7)]++;
    if (g.frp.length < 200000) g.frp.push(+f[12]);
    const ym = f[5].slice(0, 7);
    let s2 = months02.get(k); if (!s2) months02.set(k, s2 = new Set()); s2.add(ym);
    const k3 = Math.floor(lat / 0.03) + ':' + Math.floor(lon / 0.03);
    let s3 = months03.get(k3); if (!s3) months03.set(k3, s3 = new Set()); s3.add(ym);
    if (st || Math.random() < 0.05) { // province tallies (static exact; veg sampled ×20 for speed)
      const p = provinceOf(lat, lon) || '(outside)'; const t = (provTot[p] ??= { veg: 0, static: 0 });
      if (st) t.static++; else t.veg += 20;
    }
  }
}
const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const idx = m => (+m.slice(0, 4)) * 12 + (+m.slice(5)) - 1;
const maxWin = (set, W = 12) => { const a = [...set].map(idx).sort((x, y) => x - y); let j = 0, mx = 0; for (let i = 0; i < a.length; i++) { while (a[i] - a[j] >= W) j++; mx = Math.max(mx, i - j + 1); } return mx; };

// ---- sensitivity: number of static cells and share of Neuquén VIIRS under alternative thresholds ----
const sens = [];
for (const [cel, bag] of [[0.02, months02], [0.03, months03]]) for (const thr of [7, 8, 9, 10, 11]) {
  const cells = new Set(); for (const [k, s] of bag) if (maxWin(s) >= thr) cells.add(k);
  sens.push({ cell_deg: cel, min_months_in_12: thr, static_cells: cells.size, _cells: cells });
}
// share of Neuquén hotspots flagged under each setting (second pass over VIIRS, Neuquén bbox only)
const NQN = { latMin: -41.1, latMax: -36.2, lonMin: -71.2, lonMax: -68.0 };
const nq = sens.map(() => ({ tot: 0, st: 0 }));
for (const [file, meta] of Object.entries(manifest)) {
  if (meta.sensor !== 'viirs-snpp') continue;
  const rl = readline.createInterface({ input: createReadStream(path.join(RAW, file)) });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const f = line.split(','); if (f.length < 15 || f[9] === 'l' || f[14] !== '0') continue;
    const lat = +f[0], lon = +f[1];
    if (lat < NQN.latMin || lat > NQN.latMax || lon < NQN.lonMin || lon > NQN.lonMax) continue;
    if (provinceOf(lat, lon) !== 'Neuquén') continue;
    sens.forEach((s, i) => { nq[i].tot++; const k = s.cell_deg === 0.02 ? key(lat, lon) : Math.floor(lat / 0.03) + ':' + Math.floor(lon / 0.03); if (s._cells.has(k)) nq[i].st++; });
  }
}
sens.forEach((s, i) => { s.neuquen_share_static = +(nq[i].st / nq[i].tot).toFixed(3); delete s._cells; });

const seas = g => { const tot = g.byMonth.reduce((a, b) => a + b, 0); const m = g.byMonth.slice(1).map(x => +(x / tot).toFixed(3)); return { monthly_share: m, max_over_min: +(Math.max(...m) / Math.max(1e-9, Math.min(...m))).toFixed(1) }; };
const report = {
  generated: new Date().toISOString(),
  signatures: {
    static: { hotspots: sig.static.n, night_fraction: +(sig.static.night / sig.static.n).toFixed(3), frp_median_MW: med(sig.static.frp), firms_type2_dropped_here: sig.static.type2, seasonality: seas(sig.static) },
    vegetation: { hotspots: sig.veg.n, night_fraction: +(sig.veg.night / sig.veg.n).toFixed(3), frp_median_MW: med(sig.veg.frp), firms_type2_dropped_here: sig.veg.type2, seasonality: seas(sig.veg) },
  },
  type2_concentration: { share_of_all_type2_inside_static_cells: +(sig.static.type2 / (sig.static.type2 + sig.veg.type2)).toFixed(3), share_of_all_type0_inside_static_cells: +(sig.static.n / (sig.static.n + sig.veg.n)).toFixed(4) },
  sensitivity: sens,
  by_province_viirs_share_static: Object.fromEntries(Object.entries(provTot).map(([p, t]) => [p, +(t.static / (t.static + t.veg)).toFixed(3)]).sort((a, b) => b[1] - a[1])),
};
await writeFile(path.join(ROOT, 'data', 'agg', 'audit_static.json'), JSON.stringify(report, null, 2));

// ---- KML for Google Earth ----
const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>GeoFuego Harmonization — persistent thermal sources (${S.n} cells, 0.02°)</name>
<Style id="s"><IconStyle><scale>0.7</scale><color>ff00d7ff</color></IconStyle></Style>
<Style id="cell"><LineStyle><color>ff00d7ff</color><width>1.5</width></LineStyle><PolyStyle><color>2000d7ff</color></PolyStyle></Style>
${Object.entries(S.cells).map(([k, c]) => { const [la0, lo0, la1, lo1] = c.bbox; const [plat, plon] = c.centroid || [c.lat, c.lon]; const name = `${provinceOf(c.lat, c.lon) || '?'} · V${c.viirs_months}/M${c.modis_months} · night ${Math.round(c.night_frac * 100)}%`; const desc = `${c.sensors.join('+')} · max months in 12: VIIRS ${c.viirs_months}, MODIS ${c.modis_months} · night fraction ${c.night_frac} · hotspots ${c.hotspots} · pin = hotspot centroid, box = 0.02° cell`;
  return `<Placemark><styleUrl>#s</styleUrl><name>${name}</name><description>${desc}</description><Point><coordinates>${plon},${plat},0</coordinates></Point></Placemark>\n<Placemark><styleUrl>#cell</styleUrl><name>cell ${k}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${lo0},${la0},0 ${lo1},${la0},0 ${lo1},${la1},0 ${lo0},${la1},0 ${lo0},${la0},0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`; }).join('\n')}
</Document></kml>`;
await writeFile(path.join(ROOT, 'data', 'agg', 'static_cells.kml'), kml);
console.log(JSON.stringify(report, null, 1));
