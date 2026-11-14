#!/usr/bin/env node
// 05d_ha_per_hotspot.mjs — Empirical translation of VIIRS-equivalent hotspot counts into burned hectares, by province and
// calendar month, from the MCD64A1 burned-area product (GWIS/JRC, 2002–2025; not independent of MODIS active fires, which it uses in training).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// The unit of the harmonized series is the hotspot count (375 m active-fire pixels). Users think in hectares. This table
// gives, for each province × month, the median burned hectares per harmonized hotspot over the 24 years, with the
// interquartile range as dispersion, so that a count can be translated into an INDICATIVE area with its uncertainty.
// It is a translation, not a measurement: large fast grass fires burn many hectares per detection, smouldering forest fires few.
// Output: data/harmonized/ha_per_hotspot.csv, ha_per_hotspot.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = { 'Ciudad de Buenos Aires': 'Ciudad Autónoma de Buenos Aires', 'Tierra del Fuego': 'Tierra del Fuego, Antártida e Islas del Atlántico Sur' };
const BA = {};
for (const line of (await readFile(path.join(ROOT, 'data', 'external', 'gwis', 'MCD64A1_burned_area_ARG_2002_2025.csv'), 'utf8')).split('\n').slice(1)) {
  if (!line.startsWith('20')) continue; const f = line.replace(/"/g, '').split(','); const [y, m, , , , region] = f; const ha = f.slice(6).reduce((a, b) => a + (+b || 0), 0);
  const p = NAME[region] || region; ((BA[p] ??= {})[`${y}-${m}`] = (BA[p]?.[`${y}-${m}`] || 0) + ha); ((BA.Argentina ??= {})[`${y}-${m}`] = (BA.Argentina?.[`${y}-${m}`] || 0) + ha);
}
const H = {};
for (const line of (await readFile(path.join(ROOT, 'data', 'harmonized', 'harmonized_provinces.csv'), 'utf8')).split('\n')) {
  const m = line.match(/^"([^"]+)",\d+,(\d+),(\d+),([\d.]+)/); if (!m) continue; const [, p, y, mo, h] = m; if (+y < 2002) continue; (H[p] ??= {})[`${y}-${+mo}`] = +h;
}
const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(f * b.length))] : null; };
const out = {}; let csv = 'region,month,n_years,ha_per_hotspot_median,p25,p75,annual_median_all_months\n';
for (const p of Object.keys(H)) {
  if (!BA[p]) continue; out[p] = {};
  const all = [];
  for (let mo = 1; mo <= 12; mo++) {
    const vals = []; for (let y = 2002; y <= 2025; y++) { const h = H[p][`${y}-${mo}`], ba = BA[p][`${y}-${mo}`]; if (h >= 20 && ba > 0) vals.push(ba / h); }
    all.push(...vals);
    out[p][mo] = vals.length >= 5 ? { n: vals.length, median: +q(vals, 0.5).toFixed(2), p25: +q(vals, 0.25).toFixed(2), p75: +q(vals, 0.75).toFixed(2) } : null;
  }
  const am = all.length ? +q(all, 0.5).toFixed(2) : null; out[p].annual = am;
  for (let mo = 1; mo <= 12; mo++) { const o = out[p][mo]; csv += `"${p}",${mo},${o ? o.n : 0},${o ? o.median : ''},${o ? o.p25 : ''},${o ? o.p75 : ''},${am ?? ''}\n`; }
}
await mkdir(path.join(ROOT, 'data', 'harmonized'), { recursive: true });
await writeFile(path.join(ROOT, 'data', 'harmonized', 'ha_per_hotspot.csv'), csv);
await writeFile(path.join(ROOT, 'data', 'harmonized', 'ha_per_hotspot.json'), JSON.stringify({ generated: new Date().toISOString(), source: 'MCD64A1 burned area (GWIS/JRC) / harmonized VIIRS-eq hotspots, 2002-2025, months with >=20 hotspots', unit: 'ha per hotspot', table: out }));
console.log('ha per harmonized hotspot — annual median [p25–p75 of August]:');
for (const [p, t] of Object.entries(out).sort((a, b) => (b[1].annual || 0) - (a[1].annual || 0))) { const a = t[8]; console.log(`  ${p.split(',')[0].slice(0, 22).padEnd(22)} ${String(t.annual ?? '-').padStart(6)}   Aug ${a ? `${a.median} [${a.p25}–${a.p75}] n=${a.n}` : '-'}`); }
