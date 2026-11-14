#!/usr/bin/env node
// 01c_fetch_aux.mjs — Fetch the auxiliary datasets (not from FIRMS) and log their sha256, so the repository runs from a clean clone.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//   - NOAA CPC Oceanic Niño Index (ONI), 3-month centred anomalies → data/external/oni/oni.ascii.txt
//   - GWIS/JRC country-profile burned-area tables (MCD64A1 2002-2025, MVP64 2013-2025), global zips → only the Argentina
//     rows are kept (data/external/gwis/*_ARG_*.csv). The GWIS host redirects to data.effis.emergency.copernicus.eu;
//     if your network cannot reach it, download the two zips manually from
//     https://gwis.jrc.ec.europa.eu/apps/country.profile/downloads and place them in data/external/gwis/.
// Usage: node scripts/01c_fetch_aux.mjs
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => createHash('sha256').update(b).digest('hex');
const log = {};
// ONI
await mkdir(path.join(ROOT, 'data', 'external', 'oni'), { recursive: true });
try { const r = await fetch('https://origin.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/detrend.nino34.ascii.txt'); const r2 = await fetch('https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt'); const txt = r2.ok ? await r2.text() : null; if (txt && txt.startsWith(' SEAS')) { await writeFile(path.join(ROOT, 'data', 'external', 'oni', 'oni.ascii.txt'), txt); log.oni = { url: 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt', sha256: sha(Buffer.from(txt)), bytes: txt.length }; console.log('ONI fetched', log.oni.bytes, 'B'); } else console.log('ONI: fetch failed, keeping the committed copy'); } catch (e) { console.log('ONI: ' + e.message + ' — keeping the committed copy'); }
// GWIS
const G = path.join(ROOT, 'data', 'external', 'gwis'); await mkdir(G, { recursive: true });
for (const [zip, inner, out, years] of [['MCD64A1_burned_area_full_dataset_2002_2025.zip', 'MCD64A1_burned_area_full_dataset_2002_2025.csv', 'MCD64A1_burned_area_ARG_2002_2025.csv', '2002-2025'], ['MVP64_burned_area_full_dataset_2013_2025.zip', 'MVP64_burned_area_full_dataset_2002_2025.csv', 'MVP64_burned_area_ARG_2013_2025.csv', '2013-2025']]) {
  const zp = path.join(G, zip);
  if (!existsSync(zp)) { try { const r = await fetch(`https://gwis.jrc.ec.europa.eu/downloads/country.profile/${zip}`, { redirect: 'follow' }); if (!r.ok) throw new Error('HTTP ' + r.status); const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 1e6) throw new Error('unexpected small response'); await writeFile(zp, buf); } catch (e) { console.log(`${zip}: ${e.message} — place the file manually in data/external/gwis/ (see header)`); continue; } }
  const buf = await readFile(zp); log[zip] = { sha256: sha(buf), bytes: buf.length };
  execSync(`cd "${G}" && rm -rf tmp_unzip && mkdir tmp_unzip && unzip -o -q "${zip}" -d tmp_unzip`);
  const csv = await readFile(path.join(G, 'tmp_unzip', inner), 'utf8'); const lines = csv.split('\n');
  await writeFile(path.join(G, out), lines[0] + '\n' + lines.filter(l => l.includes(',ARG,')).join('\n') + '\n');
  execSync(`rm -rf "${path.join(G, 'tmp_unzip')}"`);
  console.log(`${zip} ${buf.length} B sha256 ${log[zip].sha256.slice(0, 12)}… → ${out} (${years})`);
}
await writeFile(path.join(ROOT, 'data', 'external', 'MANIFEST_aux.json'), JSON.stringify({ fetched_at: new Date().toISOString(), ...log }, null, 2));
