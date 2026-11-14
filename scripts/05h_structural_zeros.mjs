#!/usr/bin/env node
// 05h_structural_zeros.mjs — The multiplicative limit, measured: on the paired days of 2012–2023, how often does VIIRS see fire
// where MODIS saw nothing (so a multiplicative factor predicts zero), as a function of the size of the area?
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
//
// For every aggregation unit (single cell, s×s blocks of cells aligned on the grid, province, country) and every month of
// 2012–2023: VIIRS-active unit-months = those with paired-day VIIRS > 0; "structural zero" = VIIRS > 0 and Terra+Aqua = 0
// (or Terra = 0 for the Terra-only set). Reported: share of VIIRS-active unit-months that are structural zeros, and the
// share of paired-day VIIRS hotspots they hold. These are the numbers quoted in README ("Known limits", Terra-only row).
// Output: data/validation/structural_zeros.json

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agg = JSON.parse(await readFile(path.join(ROOT, 'data', 'agg', 'counts.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'grid', 'cells_index.json'), 'utf8'));
const COL = Object.fromEntries(agg.columns.map((c, i) => [c, i]));
const provOf = new Map(index.cells.map(c => [String(c.id), c.prov]));
const nCols = index.grid.nCols;
const YEARS = []; for (let y = 2012; y <= 2023; y++) YEARS.push(y);

// unit key functions
const units = {
  cell: id => id,
  block_2x2: id => blockKey(id, 2), block_5x5: id => blockKey(id, 5), block_10x10: id => blockKey(id, 10),
  province: id => provOf.get(id) || '(none)', country: () => 'AR',
};
function blockKey(id, s) { const r = Math.floor(+id / nCols), c = +id % nCols; return `${Math.floor(r / s)}:${Math.floor(c / s)}`; }

const out = { generated: new Date().toISOString(), years: '2012–2023', definition: 'paired days only; VIIRS-active unit-month = Vp > 0; structural zero = Vp > 0 and (Tp + Ap) = 0 for set TA, Tp = 0 for set T', units: {} };
for (const [name, keyOf] of Object.entries(units)) {
  const acc = new Map(); // key|y|m -> [Vp, Tp, Ap]
  for (const [id, years] of Object.entries(agg.cells)) {
    const k = keyOf(id);
    for (const y of YEARS) { const ym = years[y]; if (!ym) continue; for (const [m, v] of Object.entries(ym)) { const kk = `${k}|${y}|${m}`; const a = acc.get(kk) || [0, 0, 0]; a[0] += v[COL.Vp]; a[1] += v[COL.Tp]; a[2] += v[COL.Ap]; acc.set(kk, a); } }
  }
  let active = 0, zeroTA = 0, zeroT = 0, hs = 0, hsZeroTA = 0, hsZeroT = 0, nUnits = new Set();
  for (const [kk, [Vp, Tp, Ap]] of acc) { nUnits.add(kk.split('|')[0]); if (Vp <= 0) continue; active++; hs += Vp; if (Tp + Ap === 0) { zeroTA++; hsZeroTA += Vp; } if (Tp === 0) { zeroT++; hsZeroT += Vp; } }
  out.units[name] = { units: nUnits.size, viirs_active_unit_months: active, structural_zero_share_TA: +(zeroTA / active).toFixed(4), hotspot_share_in_zeros_TA: +(hsZeroTA / hs).toFixed(4), structural_zero_share_T: +(zeroT / active).toFixed(4), hotspot_share_in_zeros_T: +(hsZeroT / hs).toFixed(4) };
  const u = out.units[name];
  console.log(`${name.padEnd(12)} units ${String(u.units).padStart(5)} · VIIRS-active unit-months ${String(active).padStart(7)} · structural zeros TA ${(100 * u.structural_zero_share_TA).toFixed(1)} % (holding ${(100 * u.hotspot_share_in_zeros_TA).toFixed(1)} % of hotspots) · T ${(100 * u.structural_zero_share_T).toFixed(1)} % (${(100 * u.hotspot_share_in_zeros_T).toFixed(1)} %)`);
}
await mkdir(path.join(ROOT, 'data', 'validation'), { recursive: true });
await writeFile(path.join(ROOT, 'data', 'validation', 'structural_zeros.json'), JSON.stringify(out, null, 1));
console.log('→ data/validation/structural_zeros.json');
