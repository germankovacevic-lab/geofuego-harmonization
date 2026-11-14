// geo.js — grid definition and point-in-polygon helpers shared by all scripts.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.

import { PROVINCIAS } from './provincias.js';

// Regular 0.25° grid over continental Argentina + Tierra del Fuego.
export const GRID = { latMin: -55.0, latMax: -21.0, lonMin: -74.0, lonMax: -53.0, step: 0.25 };
GRID.nRows = Math.round((GRID.latMax - GRID.latMin) / GRID.step); // 136
GRID.nCols = Math.round((GRID.lonMax - GRID.lonMin) / GRID.step); // 84

/** Cell id for a point, or null if outside the grid bbox. Rows count from the south, cols from the west. */
export function cellOf(lat, lon) {
  if (lat < GRID.latMin || lat >= GRID.latMax || lon < GRID.lonMin || lon >= GRID.lonMax) return null;
  const r = Math.floor((lat - GRID.latMin) / GRID.step);
  const c = Math.floor((lon - GRID.lonMin) / GRID.step);
  return r * GRID.nCols + c;
}
export function cellBounds(id) {
  const r = Math.floor(id / GRID.nCols), c = id % GRID.nCols;
  const lat0 = +(GRID.latMin + r * GRID.step).toFixed(4), lon0 = +(GRID.lonMin + c * GRID.step).toFixed(4);
  return { r, c, lat0, lon0, lat1: +(lat0 + GRID.step).toFixed(4), lon1: +(lon0 + GRID.step).toFixed(4) };
}

/** Ray-casting point in ring; ring is [[lat,lon],...]. */
function inRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Province name for a point, or null. */
export function provinceOf(lat, lon) {
  for (const p of PROVINCIAS) {
    const [a, b, c, d] = p.bbox;
    if (lat < a || lat > c || lon < b || lon > d) continue;
    for (const ring of p.rings) if (inRing(lat, lon, ring)) return p.n;
  }
  return null;
}

/** Province of a cell: centroid first, then a 5×5 sample inside the cell (majority). null = no Argentine land. */
export function provinceOfCell(id) {
  const b = cellBounds(id);
  const mid = provinceOf((b.lat0 + b.lat1) / 2, (b.lon0 + b.lon1) / 2);
  if (mid) return { prov: mid, how: 'centroid' };
  const votes = new Map();
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const p = provinceOf(b.lat0 + (i + 0.5) * GRID.step / 5, b.lon0 + (j + 0.5) * GRID.step / 5);
    if (p) votes.set(p, (votes.get(p) || 0) + 1);
  }
  if (!votes.size) return { prov: null, how: 'none' };
  return { prov: [...votes.entries()].sort((x, y) => y[1] - x[1])[0][0], how: 'sample' };
}

export const PROVINCE_NAMES = PROVINCIAS.map(p => p.n);
