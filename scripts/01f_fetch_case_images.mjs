#!/usr/bin/env node
// 01f_fetch_case_images.mjs — Fetch the before / after satellite images of the notable fire events of the app (context only).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// Source: NASA Worldview Snapshots (https://wvs.earthdata.nasa.gov), imagery from NASA GIBS, layer
// MODIS_Terra_CorrectedReflectance_Bands721: MODIS Terra corrected reflectance, bands 7-2-1, daily, 250 m. In this false-colour
// combination vegetation is green and recently burned ground is red-brown, so a burn scar shows without any processing.
// The images are context for the reader: no number of the repository is computed from them.
//
// One image before the fire season and one after it for each case, on fixed dates and a fixed bounding box (the dates are
// the clearest day found among twelve candidates on each side; the boxes frame the burned area and its surroundings and are
// wider than the area of the case in the app where that helps to read the image). For Comarca Andina the "before" date is in
// early January because a first fire of that season had already left a scar by February.
//
// Output: deploy/assets/cases/<case>_before.jpg, <case>_after.jpg and deploy/assets/cases/cases.json (dates, boxes, request
//         URLs, sizes and sha256 of every file; no timestamp, so the file is stable between runs).
// Usage: node scripts/01f_fetch_case_images.mjs            (downloads only the files that are missing)
//        node scripts/01f_fetch_case_images.mjs --force    (downloads every file again)
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'deploy', 'assets', 'cases');
const LAYER = 'MODIS_Terra_CorrectedReflectance_Bands721', FORCE = process.argv.includes('--force');
// image width: the native resolution of the layer (250 m, about 0.00225 degrees per pixel), so the viewer of the app can zoom in to what the
// sensor resolved; never under 640 px (the small cases are a few hundred native pixels wide) nor over 2048 px
const DEG_PER_PX = 0.00225, widthOf = b => Math.min(2048, Math.max(640, Math.round((b[3] - b[1]) / DEG_PER_PX)));
// bbox = [south, west, north, east] in degrees
const CASES = [
  { id: 'corrientes-2022', bbox: [-30.8, -59.8, -27.2, -55.5], before: '2021-12-23', after: '2022-02-26' },
  { id: 'cordoba-2020', bbox: [-32.1, -65.5, -30.2, -63.6], before: '2020-07-28', after: '2020-11-03' },
  { id: 'delta-2020', bbox: [-34.0, -60.75, -32.5, -58.5], before: '2020-05-10', after: '2020-09-28' },
  { id: 'comarca-2021', bbox: [-42.6, -72.0, -41.6, -70.9], before: '2021-01-13', after: '2021-03-18' },
  { id: 'cholila-2015', bbox: [-43.1, -72.2, -42.1, -71.0], before: '2015-01-20', after: '2015-03-20' },
  { id: 'chilecito-2026', bbox: [-29.5, -68.2, -28.7, -67.0], before: '2026-06-30', after: '2026-08-09' },
];
const snapshotUrl = (day, b, w, h) => 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?' + new URLSearchParams({ REQUEST: 'GetSnapshot', TIME: day, BBOX: b.join(','), CRS: 'EPSG:4326', LAYERS: LAYER, WRAP: 'day', FORMAT: 'image/jpeg', WIDTH: String(w), HEIGHT: String(h) });
const worldviewUrl = (day, b) => `https://worldview.earthdata.nasa.gov/?v=${b[1]},${b[0]},${b[3]},${b[2]}&l=${LAYER}&t=${day}`;

await mkdir(OUT, { recursive: true });
const cases = {};
for (const c of CASES) {
  const w = widthOf(c.bbox), h = Math.round(w * (c.bbox[2] - c.bbox[0]) / (c.bbox[3] - c.bbox[1]));
  const entry = { bbox: c.bbox, width: w, height: h };
  for (const when of ['before', 'after']) {
    const file = `${c.id}_${when}.jpg`, dest = path.join(OUT, file), url = snapshotUrl(c[when], c.bbox, w, h);
    if (FORCE || !existsSync(dest)) {
      const r = await fetch(url); if (!r.ok) throw new Error(`${file}: HTTP ${r.status} from NASA Worldview Snapshots`);
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 5000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error(`${file}: the response is not a JPEG image (${buf.length} bytes)`);
      await writeFile(dest, buf); process.stderr.write(`fetched ${file} (${buf.length} bytes)\n`);
    }
    const buf = await readFile(dest);
    entry[when] = { date: c[when], file, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), request: url, worldview: worldviewUrl(c[when], c.bbox) };
  }
  cases[c.id] = entry;
}
await writeFile(path.join(OUT, 'cases.json'), JSON.stringify({ source: 'NASA Worldview Snapshots (https://wvs.earthdata.nasa.gov), imagery from NASA GIBS; layer ' + LAYER + ' (MODIS Terra corrected reflectance, bands 7-2-1, daily, 250 m; false colour: vegetation green, burned ground red-brown). Context images: no number is computed from them. We acknowledge the use of imagery from the NASA Worldview application (https://worldview.earthdata.nasa.gov), part of the NASA Earth Science Data and Information System (ESDIS). Produced by scripts/01f_fetch_case_images.mjs', layer: LAYER, cases }, null, 1) + '\n');
console.log(`case images: ${Object.keys(cases).length} cases, ${2 * Object.keys(cases).length} files in deploy/assets/cases`);
