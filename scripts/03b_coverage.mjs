#!/usr/bin/env node
// 03b_coverage.mjs — Daily coverage per satellite (Terra, Aqua, S-NPP) over Argentina and detection of outage days.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// A satellite-day is an OUTAGE when the satellite reports 0 vegetation hotspots nationally while fire was clearly present:
//   (a) multi-sensor eras: from another operating satellite's count that day, the EXPECTED count for this satellite
//       (using the mean national ratios Aqua/Terra = 1.8, VIIRS/Terra = 9, VIIRS/Aqua = 5) is >= 8 — a Poisson zero at
//       expectation 8 has p = 0.03 %. A plain "other satellite saw >= 5" would mislabel every winter morning of Terra
//       (10:30 pass sees ~1/9 of what VIIRS sees at 13:30) as an outage; or
//   (b) single-sensor era (Terra only, 2000-11 → 2002-06) or as a complement: the day lies in a run of >= 3 consecutive
//       zero days whose surrounding 7+7 days average >= 5 hotspots/day for that satellite.
// Low-season days with no fire anywhere are therefore NOT outages. Known events recovered by the rule (see output):
// Terra Jun 2001, Aqua Apr 2022, S-NPP Jan 2012 (pre-operational), S-NPP Aug 2022 (safe-hold), S-NPP Jul 2024, Terra Oct 2022.
//
// Output: data/agg/coverage.json { daily: { sat: { 'YYYY-MM-DD': n } }, outages: { sat: ['YYYY-MM-DD', ...] }, by_month: { sat: { 'YYYY-MM': { days_data, outage_days } } } }

import { createReadStream } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const manifest = JSON.parse(await readFile(path.join(RAW, 'MANIFEST.json'), 'utf8'));
const daily = { Terra: {}, Aqua: {}, SNPP: {} };
for (const [file, meta] of Object.entries(manifest)) {
  if (!['modis', 'viirs-snpp'].includes(meta.sensor)) continue;
  const isModis = meta.sensor === 'modis';
  const rl = readline.createInterface({ input: createReadStream(path.join(RAW, file)) });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const f = line.split(','); if (f.length < 15 || f[14] !== '0') continue;
    if (isModis ? +f[9] < 30 : f[9] === 'l') continue;
    const sat = isModis ? f[7] : 'SNPP'; if (!daily[sat]) continue;
    daily[sat][f[5]] = (daily[sat][f[5]] || 0) + 1;
  }
}
const START = { Terra: '2000-11-01', Aqua: '2002-07-04', SNPP: '2012-01-20' }, END = { Terra: '2025-12-31', Aqua: '2025-12-31', SNPP: '2025-12-31' };
const d2s = d => d.toISOString().slice(0, 10);
const days = []; for (let d = new Date('2000-11-01T00:00:00Z'); d <= new Date('2025-12-31T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d2s(d));
const n = (s, d) => daily[s][d] || 0;
const active = (s, d) => d >= START[s] && d <= END[s];
const outages = { Terra: [], Aqua: [], SNPP: [] };
// S-NPP pre-operational days: the VIIRS archive starts on 2012-01-20; 1–19 Jan 2012 are treated as outage days so that the
// harmonized series fills them from MODIS instead of showing a false low (reviewer finding, round 2).
for (const d of days) if (d >= '2012-01-01' && d < START.SNPP) outages.SNPP.push(d);
for (const s of Object.keys(daily)) {
  for (let i = 0; i < days.length; i++) {
    const d = days[i]; if (!active(s, d) || n(s, d) > 0) continue;
    const R = { 'Terra|Aqua': 1 / 1.8, 'Terra|SNPP': 1 / 9, 'Aqua|Terra': 1.8, 'Aqua|SNPP': 1 / 5, 'SNPP|Terra': 9, 'SNPP|Aqua': 5 }; // expected N_s = N_o * R[s|o]
    const expected = Math.max(0, ...Object.keys(daily).filter(o => o !== s && active(o, d)).map(o => n(o, d) * R[`${s}|${o}`]));
    let out = expected >= 8;
    if (!out) { // zero-run rule
      let a = i, b = i; while (a > 0 && n(s, days[a - 1]) === 0 && active(s, days[a - 1])) a--; while (b < days.length - 1 && n(s, days[b + 1]) === 0 && active(s, days[b + 1])) b++;
      if (b - a + 1 >= 3) { let sum = 0, cnt = 0; for (let j = Math.max(0, a - 7); j < a; j++) { sum += n(s, days[j]); cnt++; } for (let j = b + 1; j <= Math.min(days.length - 1, b + 7); j++) { sum += n(s, days[j]); cnt++; } if (cnt && sum / cnt >= 5) out = true; }
    }
    if (out) outages[s].push(d);
  }
}
const by_month = {};
for (const s of Object.keys(daily)) { by_month[s] = {}; for (const d of days) { if (!active(s, d)) continue; const m = d.slice(0, 7); const o = (by_month[s][m] ??= { days_data: 0, outage_days: 0 }); if (n(s, d) > 0) o.days_data++; } for (const d of outages[s]) { const o = (by_month[s][d.slice(0, 7)] ??= { days_data: 0, outage_days: 0 }); o.outage_days++; } }
await writeFile(path.join(ROOT, 'data', 'agg', 'coverage.json'), JSON.stringify({ generated: new Date().toISOString(), rule: 'zero national vegetation hotspots while the count expected from another operating satellite (via mean ratios A/T=1.8, V/T=9, V/A=5) is >= 8, or a zero-run >= 3 days framed by >= 5/day; plus S-NPP pre-operational days 1-19 Jan 2012', start: START, daily, outages, by_month }));
for (const s of Object.keys(daily)) {
  const months = Object.entries(by_month[s]).filter(([, o]) => o.outage_days >= 2).map(([m, o]) => `${m}(${o.outage_days})`);
  console.log(`${s.padEnd(5)} outage days: ${outages[s].length}  → months with ≥2: ${months.join(' ')}`);
}
