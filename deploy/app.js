/* GeoFuego Harmonization — web app (NASA Space Apps 2026, team GeoFuego.com.ar).
   Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
   Static client: reads data/cells.json (harmonized 2000–2025, per 0.25° cell), data/cells_2026.json (preliminary current year)
   and data/oni.json. Implements the application rules R1–R13 of docs/peer_review_round4_nasa.md §3. No external services. */
(() => {
'use strict';

// ---------- i18n ----------
const T = {
  en: {
    tagline: 'One fire-hotspot calendar for any area of Argentina, November 2000 → today. MODIS converted to VIIRS-equivalent counts, with a calibrated 80 % range on every reconstructed month.',
    method: 'Method & code', province: 'Province', country: 'Whole country', latlon: 'Lat / Lon', go: 'Go', clear: 'Clear', drawhint: 'or draw a rectangle / polygon on the map, or click a province',
    attrib: 'Basemap: Esri World Light Gray Canvas (Esri, HERE, Garmin, OpenStreetMap contributors). Grid: 0.25°. Data: NASA FIRMS (MODIS, VIIRS).',
    empty: 'Pick a province, enter a point, or draw an area. The calendar snaps to whole 0.25° cells (about 25 × 25 km).',
    from: 'From', to: 'to', nowtitle: 'This month vs the historical median', caltitle: 'Burning-activity calendar', togpre: 'show greyed years', togstatic: 'fixed heat sources',
    unit: 'Counts are satellite fire detections expressed in VIIRS-equivalent pixels (375 m). They are not a number of fires and not burned area. A fire that burns for several days is counted on every satellite pass.',
    eras: 'From 2012 the values are observed by VIIRS. Before 2012 they are estimated from MODIS, a coarser sensor, and shown with an 80 % range: about 1 month in 5 falls outside it.',
    smallnote: 'MODIS missed many small fires that VIIRS detects. In an area this size, a month with no value before 2012 means “MODIS detected nothing”, not “nothing burned”. Do not compare how often it burned before and after 2012.',
    seriestitle: 'Monthly series with 80 % range', yearstitle: 'Which years burned most', seasontitle: 'Which months of the year',
    statictitle: 'Fixed heat sources (gas flares, industry) — separate series, VIIRS counts, 2012 →',
    staticnote: "Never added to the calendar above. In the sensor's own units: VIIRS counts since 2012; the MODIS-era values are not shown.",
    how: 'How to read this',
    how1: 'Unit: the 0.25° cell. Drawn areas snap to whole cells; an area smaller than one cell becomes that cell.',
    how2: 'Size tiers: ≥ 100 cells full calendar · 25–99 full, pre-2012 labelled reconstructed · 4–24 baseline 2012–2025, pre-2012 zero = no MODIS detection · 1–3 pre-2012 greyed and excluded unless you toggle them on. Chubut and Santa Cruz: one tier stricter. Tierra del Fuego: 2012 → only.',
    how3: '80 % range: calibrated out of sample per fire-regime region, size class and predicted count, widened in strong ENSO months and in cloudier-than-usual months. Only reconstructed months carry it.',
    how4: 'Markers: ▲ cloudier than usual at overpass time (the count may be low) · ◆ partly modelled (satellite outage) · hatch: Terra-only era (Nov 2000 – Jun 2002), shown for ≥ 100 cells.',
    how5: 'Current year: preliminary, near-real-time, NOAA-20/21 converted to S-NPP-equivalent (± 5 %), month to date. Not part of the harmonized record. This is not an alert system: an empty cell does not mean there is no fire.',
    foot: "NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots (CONAE) · Team GeoFuego.com.ar · Data: NASA FIRMS (MODIS Collection 6/6.1, VIIRS S-NPP / NOAA-20 / NOAA-21), ERA5, NOAA CPC ONI, IGN Argentina · Code MIT, data CC BY 4.0 · Built with SI assistance (Claude, Anthropic); every number is computed by the open scripts from NASA FIRMS data. We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Science Data and Information System (ESDIS).",
    // dynamic
    cells: 'cells', km2: 'km²', tier: 'tier', dominant: 'mostly in', region: 'region', drawn: 'Drawn area', point: 'Point', argentina: 'Argentina',
    snapped1: 'The area is smaller than one cell: the calendar is that of the cell containing it.',
    tierA: 'Full calendar, all years.', tierB: 'Full calendar; values before 2012 are reconstructed and carry the 80 % range.',
    tierC: 'Baseline 2012–2025 by default. Before 2012 a zero means “no MODIS detection”. Prefer seasonal and annual totals over single months.',
    tierD: 'Years before 2012 are greyed and excluded from every statistic by default (toggle to show them). No ranking of years across 2012.',
    stricter: 'Patagonia south of 42° S: one tier stricter — few detections; the frequency of fire months is not comparable across 2012.',
    tdf: 'Tierra del Fuego: shown from 2012 only. The earlier years cannot be reconstructed (too few detections; the factor is borrowed from the region).',
    borrowed: 'Factor borrowed from the region (not estimated in this area): Tierra del Fuego and the City of Buenos Aires.',
    staticbanner: (pct) => `Fixed heat sources (gas flares, industry) are excluded from this calendar. In this area they are ${pct} % of all detections since 2012.`,
    partial: 'Some days of this month had fewer than three satellites reporting; the month-to-date value is a lower bound.',
    nowpre: 'Preliminary near-real-time data, month to date. Smoke and cloud hide fires from the satellite. This is not an alert system: an empty cell does not mean there is no fire.',
    mtd: 'month to date', lastfull: 'last complete month', median: 'median', of: 'of', years: 'years', rank: (r, n) => `${ord(r)} highest of ${n} years`,
    vsmedian: (x) => x >= 1 ? `${x.toFixed(1)}× the median` : `${(100 * (1 - x)).toFixed(0)} % below the median`,
    nodata26: 'No data yet for the current year in this area.', baseline: 'baseline', recon: 'reconstructed from MODIS', obs: 'observed (VIIRS)', terra: 'Terra only', nodata: 'no data',
    nomodis: 'no MODIS detection', range: '80 % range', cloud: 'cloudier than usual at overpass time: the count may be low', gap: (p) => `partly modelled (satellite outage${p ? `, ${p} %` : ''})`,
    prelim: 'preliminary, near-real-time, month to date', snppeq: 'S-NPP-equivalent', hotspots: 'VIIRS-equivalent hotspots',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    legendlow: 'few', legendhigh: 'many', legendgrey: 'greyed / excluded', legendnd: 'no data', mixed: '2002 mixes Terra-only and Terra+Aqua months', y2000: '2000 has two months and is never ranked',
    seasonnote: (y0, y1) => `Median and inter-quartile range by calendar month, ${y0}–${y1}.`, through: 'data through', annual: 'annual total',
    csvhdr: 'GeoFuego Harmonization — CC BY 4.0 — produced by scripts written with SI assistance (Claude, Anthropic) from NASA FIRMS data',
  },
  es: {
    tagline: 'Un calendario de focos de calor para cualquier área de Argentina, noviembre 2000 → hoy. MODIS convertido a conteos equivalentes VIIRS, con un rango del 80 % calibrado en cada mes reconstruido.',
    method: 'Método y código', province: 'Provincia', country: 'Todo el país', latlon: 'Lat / Lon', go: 'Ir', clear: 'Limpiar', drawhint: 'o dibujá un rectángulo / polígono en el mapa, o hacé click en una provincia',
    attrib: 'Mapa base: Esri World Light Gray Canvas (Esri, HERE, Garmin, colaboradores de OpenStreetMap). Grilla: 0,25°. Datos: NASA FIRMS (MODIS, VIIRS).',
    empty: 'Elegí una provincia, ingresá un punto o dibujá un área. El calendario se ajusta a celdas enteras de 0,25° (unos 25 × 25 km).',
    from: 'Desde', to: 'hasta', nowtitle: 'Este mes contra la mediana histórica', caltitle: 'Calendario de actividad de fuego', togpre: 'mostrar años grises', togstatic: 'fuentes fijas de calor',
    unit: 'Los conteos son detecciones satelitales de fuego expresadas en píxeles equivalentes VIIRS (375 m). No son cantidad de incendios ni área quemada. Un fuego que dura varios días se cuenta en cada pasada del satélite.',
    eras: 'Desde 2012 los valores son observados por VIIRS. Antes de 2012 se estiman desde MODIS, un sensor más grueso, y se muestran con un rango del 80 %: cerca de 1 mes de cada 5 cae afuera.',
    smallnote: 'MODIS no vio muchos fuegos chicos que VIIRS detecta. En un área de este tamaño, un mes sin valor antes de 2012 significa “MODIS no detectó nada”, no “no se quemó nada”. No comparar la frecuencia de meses con fuego antes y después de 2012.',
    seriestitle: 'Serie mensual con rango del 80 %', yearstitle: 'Qué años se quemó más', seasontitle: 'Qué meses del año',
    statictitle: 'Fuentes fijas de calor (antorchas de gas, industria) — serie aparte, conteos VIIRS, 2012 →',
    staticnote: 'Nunca se suman al calendario de arriba. En las unidades del sensor: conteos VIIRS desde 2012; los valores de la era MODIS no se muestran.',
    how: 'Cómo leer esto',
    how1: 'Unidad: la celda de 0,25°. Las áreas dibujadas se ajustan a celdas enteras; un área menor que una celda pasa a ser esa celda.',
    how2: 'Niveles por tamaño: ≥ 100 celdas calendario completo · 25–99 completo, pre-2012 marcado como reconstruido · 4–24 base 2012–2025, cero pre-2012 = sin detección MODIS · 1–3 pre-2012 en gris y excluido salvo que lo actives. Chubut y Santa Cruz: un nivel más estricto. Tierra del Fuego: solo 2012 →.',
    how3: 'Rango del 80 %: calibrado fuera de muestra por región de régimen de fuego, clase de tamaño y conteo predicho; ensanchado en meses de ENSO fuerte y en meses más nublados que lo normal. Solo los meses reconstruidos lo llevan.',
    how4: 'Marcas: ▲ más nublado que lo normal a la hora de paso (el conteo puede estar bajo) · ◆ parcialmente modelado (corte de satélite) · rayado: era solo Terra (nov 2000 – jun 2002), visible con ≥ 100 celdas.',
    how5: 'Año en curso: preliminar, casi en tiempo real, NOAA-20/21 convertidos a equivalente S-NPP (± 5 %), mes a la fecha. No forma parte del registro armonizado. No es un sistema de alerta: una celda vacía no significa que no haya fuego.',
    foot: 'NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots (CONAE) · Equipo GeoFuego.com.ar · Datos: NASA FIRMS (MODIS Collection 6/6.1, VIIRS S-NPP / NOAA-20 / NOAA-21), ERA5, NOAA CPC ONI, IGN Argentina · Código MIT, datos CC BY 4.0 · Construido con asistencia de SI (Claude, Anthropic); cada número lo calculan los scripts abiertos desde datos NASA FIRMS. We acknowledge the use of data from NASA\'s Fire Information for Resource Management System (FIRMS), part of NASA\'s Earth Science Data and Information System (ESDIS).',
    cells: 'celdas', km2: 'km²', tier: 'nivel', dominant: 'mayormente en', region: 'región', drawn: 'Área dibujada', point: 'Punto', argentina: 'Argentina',
    snapped1: 'El área es menor que una celda: el calendario es el de la celda que la contiene.',
    tierA: 'Calendario completo, todos los años.', tierB: 'Calendario completo; los valores anteriores a 2012 son reconstruidos y llevan el rango del 80 %.',
    tierC: 'Base 2012–2025 por defecto. Antes de 2012 un cero significa “sin detección MODIS”. Preferir totales estacionales y anuales a meses sueltos.',
    tierD: 'Los años anteriores a 2012 están en gris y excluidos de toda estadística por defecto (activalos con el interruptor). Sin ranking de años a través de 2012.',
    stricter: 'Patagonia al sur de 42° S: un nivel más estricto — pocas detecciones; la frecuencia de meses con fuego no es comparable a través de 2012.',
    tdf: 'Tierra del Fuego: se muestra solo desde 2012. Los años anteriores no se pueden reconstruir (muy pocas detecciones; el factor se toma prestado de la región).',
    borrowed: 'Factor prestado de la región (no estimado en esta área): Tierra del Fuego y Ciudad de Buenos Aires.',
    staticbanner: (pct) => `Las fuentes fijas de calor (antorchas de gas, industria) están excluidas de este calendario. En esta área son el ${pct} % de todas las detecciones desde 2012.`,
    partial: 'Algunos días de este mes reportaron menos de tres satélites; el valor a la fecha es una cota inferior.',
    nowpre: 'Datos preliminares casi en tiempo real, mes a la fecha. El humo y las nubes esconden fuegos al satélite. No es un sistema de alerta: una celda vacía no significa que no haya fuego.',
    mtd: 'mes a la fecha', lastfull: 'último mes completo', median: 'mediana', of: 'de', years: 'años', rank: (r, n) => `${r}º más alto de ${n} años`,
    vsmedian: (x) => x >= 1 ? `${x.toFixed(1).replace('.', ',')}× la mediana` : `${(100 * (1 - x)).toFixed(0)} % debajo de la mediana`,
    nodata26: 'Todavía no hay datos del año en curso en esta área.', baseline: 'base', recon: 'reconstruido desde MODIS', obs: 'observado (VIIRS)', terra: 'solo Terra', nodata: 'sin datos',
    nomodis: 'sin detección MODIS', range: 'rango 80 %', cloud: 'más nublado que lo normal a la hora de paso: el conteo puede estar bajo', gap: (p) => `parcialmente modelado (corte de satélite${p ? `, ${p} %` : ''})`,
    prelim: 'preliminar, casi en tiempo real, mes a la fecha', snppeq: 'equivalente S-NPP', hotspots: 'focos equivalentes VIIRS',
    months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    legendlow: 'pocos', legendhigh: 'muchos', legendgrey: 'gris / excluido', legendnd: 'sin datos', mixed: '2002 mezcla meses solo Terra y Terra+Aqua', y2000: '2000 tiene dos meses y nunca se rankea',
    seasonnote: (y0, y1) => `Mediana y rango intercuartil por mes calendario, ${y0}–${y1}.`, through: 'datos hasta', annual: 'total anual',
    csvhdr: 'GeoFuego Harmonization — CC BY 4.0 — producido por scripts escritos con asistencia de SI (Claude, Anthropic) a partir de datos NASA FIRMS',
  }
};
let lang = (location.hash.includes('lang=es') || (navigator.language || '').startsWith('es')) ? 'es' : 'en';
const t = (k, ...a) => { const v = T[lang][k] ?? T.en[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; const v = T[lang][k]; if (typeof v === 'string') el.innerHTML = v; });
  document.getElementById('lang').textContent = lang === 'en' ? 'ES' : 'EN';
  document.getElementById('lang').setAttribute('aria-label', lang === 'en' ? 'Cambiar a español' : 'Switch to English');
}

// ---------- data ----------
let D = null, L26 = null, ONI = {}, PROV = null;
const Y0 = 2000, YEARS = 26, YCUR = 2026;
const grid = { latMin: -55, latMax: -21, lonMin: -74, lonMax: -53, step: 0.25, nCols: 84 };
const cellOf = (lat, lon) => (lat < grid.latMin || lat >= grid.latMax || lon < grid.lonMin || lon >= grid.lonMax) ? null : Math.floor((lat - grid.latMin) / grid.step) * grid.nCols + Math.floor((lon - grid.lonMin) / grid.step);
const cellBounds = id => { const r = Math.floor(id / grid.nCols), c = id % grid.nCols; const lat0 = grid.latMin + r * grid.step, lon0 = grid.lonMin + c * grid.step; return [lat0, lon0, lat0 + grid.step, lon0 + grid.step]; };
const cellKm2 = id => { const [a, , b] = cellBounds(id); const lat = (a + b) / 2; return 27.8 * 27.8 * Math.cos(lat * Math.PI / 180); };
const TDF = 'Tierra del Fuego, Antártida e Islas del Atlántico Sur', CABA = 'Ciudad Autónoma de Buenos Aires';
const STRICT = new Set(['Chubut', 'Santa Cruz']);
const setOf = (y, m) => (y < 2002 || (y === 2002 && m < 7)) ? 'T' : y <= 2011 ? 'TA' : null;
const SIZE = n => n === 1 ? '1' : n <= 9 ? '2-9' : n <= 49 ? '10-49' : n <= 199 ? '50-199' : '200+';

async function load() {
  const [a, b, c, p] = await Promise.all([fetch('data/cells.json').then(r => r.json()), fetch('data/cells_2026.json').then(r => r.json()).catch(() => null), fetch('data/oni.json').then(r => r.json()).catch(() => ({ oni: {} })), fetch('data/provincias.json').then(r => r.json()).catch(() => null)]);
  D = a; L26 = b; ONI = c.oni || {}; PROV = p;
  Object.assign(grid, D.grid);
}

// ---------- aggregation (R1–R12) ----------
function aggregate(sel) {
  const ids = sel.cells; const n = ids.length;
  const H = Array.from({ length: YEARS }, () => Array(12).fill(0)), has = Array.from({ length: YEARS }, () => Array(12).fill(false));
  const recon = Array.from({ length: YEARS }, () => Array(12).fill(0)), gap = Array.from({ length: YEARS }, () => Array(12).fill(0));
  const cloudH = Array.from({ length: YEARS }, () => Array(12).fill(0)), cloudN = Array.from({ length: YEARS }, () => Array(12).fill(0)), cloudD = Array.from({ length: YEARS }, () => Array(12).fill(0));
  const st = Array.from({ length: YEARS }, () => Array(12).fill(0));
  const provH = {}, provN = {}, regionH = {};
  let km2 = 0;
  for (const id of ids) {
    const c = D.cells[id]; if (!c) continue; km2 += cellKm2(id);
    provN[c.p] = (provN[c.p] || 0) + 1;
    for (let y = 0; y < YEARS; y++) {
      const hy = c.h[y], sy = c.s[y]; const Y = Y0 + y;
      for (let m = 0; m < 12; m++) {
        const h = hy[m]; if (h < 0) continue; has[y][m] = true; H[y][m] += h;
        if (sy[m]) recon[y][m] += h;
        if (Y >= 2012) provH[c.p] = (provH[c.p] || 0) + h;
        const g = c.gf?.[Y]?.[m]; if (g) gap[y][m] += h * g / 100;
        const cl = c.cl?.[Y]?.[m]; if (cl) { cloudH[y][m] += h; cloudN[y][m]++; cloudD[y][m] += h * cl / 100; }
        const s = c.st?.[Y]?.[m]; if (s) st[y][m] += s;
      }
    }
  }
  const provs = Object.entries(provH).sort((a, b) => b[1] - a[1]);
  const dominant = provs.length && provs[0][1] > 0 ? provs[0][0] : Object.entries(provN).sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const [p, h] of Object.entries(provH)) { const r = D.region_of_prov[p]; if (r) regionH[r] = (regionH[r] || 0) + h; }
  let region = Object.entries(regionH).sort((a, b) => b[1] - a[1])[0]?.[0] || D.region_of_prov[dominant] || 'national';
  const shareDom = provs.length ? provs[0][1] / Math.max(1, provs.reduce((a, b) => a + b[1], 0)) : 1;
  // tiers (R2, R7, R8)
  let tier = n >= 100 ? 'A' : n >= 25 ? 'B' : n >= 4 ? 'C' : 'D';
  const stricter = STRICT.has(dominant) && shareDom > 0.5;
  if (stricter) tier = tier === 'B' ? 'C' : tier === 'C' ? 'D' : tier;
  const tdf = dominant === TDF && shareDom > 0.5;
  const borrowed = (dominant === TDF || dominant === CABA) && shareDom > 0.5;
  const fromYear = tdf ? 2012 : 2000;
  const baselineFrom = (tier === 'A' || tier === 'B') ? fromYear : 2012; // R4
  // interval (R3): bins by set, region, size class; country uses national agg bins
  const bins = (s) => sel.kind === 'country' ? D.band_by_region_class[s].national.agg : (D.band_by_region_size[s][region]?.[SIZE(n)] || D.band_by_region_size[s].national?.[SIZE(n)] || D.band_by_region_class[s].national.agg);
  const lo = Array.from({ length: YEARS }, () => Array(12).fill(null)), hi = Array.from({ length: YEARS }, () => Array(12).fill(null));
  const cloudFlag = Array.from({ length: YEARS }, () => Array(12).fill(false));
  for (let y = 0; y < YEARS; y++) for (let m = 0; m < 12; m++) {
    const Y = Y0 + y; if (!has[y][m]) continue;
    // R9: flag the month when the H-weighted mean cloud anomaly at overpass time (unflagged cells count as 0) is >= +0.10
    const anom = H[y][m] > 0 ? cloudD[y][m] / H[y][m] : (cloudN[y][m] / Math.max(1, n) >= 0.5 ? 0.10 : 0);
    cloudFlag[y][m] = anom >= 0.10;
    const s = setOf(Y, m + 1); if (!s || H[y][m] <= 0) continue;
    const B = bins(s); let b = B[0]; for (const x of B) if (H[y][m] >= x.P_min) b = x;
    const es = Math.abs(0.025 * (ONI[`${Y}-${m + 1}`] || 0));
    const dCloud = cloudFlag[y][m] && H[y][m] > 0 ? Math.max(0, cloudD[y][m] / H[y][m]) : 0;
    lo[y][m] = H[y][m] * Math.exp(Math.min(0, b.p10_log) - es); hi[y][m] = H[y][m] * Math.exp(Math.max(0, b.p90_log) + es + 3 * dCloud);
  }
  // static share 2012–2025 (R6)
  let sumH = 0, sumS = 0; for (let y = 12; y < YEARS; y++) for (let m = 0; m < 12; m++) { sumH += H[y][m]; sumS += st[y][m]; }
  const staticShare = sumH + sumS > 0 ? sumS / (sumH + sumS) : 0;
  // current year (R12)
  let cur = null;
  if (L26) {
    const h = Array(12).fill(0), s = Array(12).fill(0), any = Array(12).fill(false);
    for (const id of ids) { const c = L26.cells[id]; if (!c) continue; for (let m = 0; m < 12; m++) if (c.h[m] != null) { h[m] += c.h[m]; s[m] += c.st[m] || 0; any[m] = true; } }
    const months = L26.months.map(M => ({ ...M, h: M.days ? h[M.m - 1] : null, st: M.days ? s[M.m - 1] : null, partial: M.days > 0 && (M.d0 > 0 || M.d1 > 0 || M.d2 > 0) }));
    cur = { year: L26.year, through: L26.data_through, months, bridge: L26.bridge };
  }
  return { sel, n, km2, dominant, shareDom, region, tier, stricter, tdf, borrowed, fromYear, baselineFrom, H, has, recon, gap, cloudFlag, st, lo, hi, staticShare, cur };
}

// ---------- state & UI ----------
let A = null; // current aggregate
let range = { from: [2000, 11], to: [2026, 12] };
let showPre = false, showStatic = false;
const $ = id => document.getElementById(id);
const fmt = v => v == null ? '—' : Math.round(v).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US');
const inRange = (y, m) => (y > range.from[0] || (y === range.from[0] && m >= range.from[1])) && (y < range.to[0] || (y === range.to[0] && m <= range.to[1]));
const terraOnly = (y, m) => y < 2002 || (y === 2002 && m <= 6);
/** month usable in statistics for the current tier (R2, R4, R5, R7) */
function usable(y, m) { // m 1-based, y calendar year ≤ 2025
  if (y < A.fromYear) return false;
  if (!A.has[y - Y0][m - 1]) return false;
  if (terraOnly(y, m) && A.tier !== 'A') return false;
  if (y < 2012 && A.tier === 'D' && !showPre) return false;
  return true;
}
const baselineYears = () => { const ys = []; for (let y = Math.max(A.baselineFrom, range.from[0]); y <= Math.min(2025, range.to[0]); y++) ys.push(y); return ys.filter(y => y !== 2000); };
const median = arr => { const a = arr.filter(v => v != null).sort((x, y) => x - y); if (!a.length) return null; const k = a.length / 2; return a.length % 2 ? a[Math.floor(k)] : (a[k - 1] + a[k]) / 2; };
const quantile = (arr, q) => { const a = arr.filter(v => v != null).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };

// viridis (colour-blind safe), 8 anchors interpolated
const VIR = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]];
const viridis = x => { x = Math.max(0, Math.min(1, x)); const i = Math.min(VIR.length - 2, Math.floor(x * (VIR.length - 1))), f = x * (VIR.length - 1) - i; const c = VIR[i].map((v, k) => Math.round(v + (VIR[i + 1][k] - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`; };

function render() {
  if (!A) return;
  $('empty').hidden = true; $('out').hidden = false;
  renderSummary(); renderNow(); renderCalendar(); renderSeries(); renderYears(); renderSeason(); renderStatic();
  $('small-note').hidden = !(A.tier === 'C' || A.tier === 'D');
}

function renderSummary() {
  const s = A.sel; const title = s.kind === 'country' ? t('argentina') : s.kind === 'province' ? s.label : s.kind === 'point' ? `${t('point')} ${s.label}` : t('drawn');
  $('aoi-title').textContent = title;
  const parts = [`${A.n} ${t('cells')} · ~${fmt(A.km2)} ${t('km2')} · ${t('tier')} ${A.tier}`];
  if (s.kind !== 'country' && s.kind !== 'province') parts.push(`${t('dominant')} ${A.dominant} (${Math.round(100 * A.shareDom)} %)`);
  if (s.kind !== 'country') parts.push(`${t('region')}: ${A.region}`);
  $('aoi-sub').textContent = parts.join(' · ');
  const b = []; const banner = (txt, cls = '') => b.push(`<div class="banner ${cls}">${txt}</div>`);
  if (s.snapped1) banner(t('snapped1'), 'info');
  if (A.tdf) banner(t('tdf')); else banner(t('tier' + A.tier), 'info');
  if (A.stricter) banner(t('stricter'));
  if (A.borrowed) banner(t('borrowed'));
  if (A.staticShare > 0.10) banner(t('staticbanner', Math.round(100 * A.staticShare)));
  $('banners').innerHTML = b.join('');
}

function renderNow() {
  const el = $('now'); const cur = A.cur;
  if (!cur) { el.innerHTML = `<p class="note">${t('nodata26')}</p>`; return; }
  const ys = baselineYears();
  const monthsWithData = cur.months.filter(M => M.days > 0);
  if (!monthsWithData.length) { el.innerHTML = `<p class="note">${t('nodata26')}</p>`; return; }
  const last = monthsWithData[monthsWithData.length - 1];
  const cards = [];
  const card = (M, label) => {
    const m = M.m; const hist = ys.filter(y => usable(y, m)).map(y => A.H[y - Y0][m - 1]);
    const med = median(hist); const v = M.h;
    let cls = '', detail;
    if (med == null) detail = '—';
    else if (med < 10) { const rank = hist.filter(x => x > v).length + 1; detail = t('rank', rank, hist.length + 1); cls = rank <= Math.ceil((hist.length + 1) / 3) ? 'up' : ''; }
    else { const r = v / med; detail = t('vsmedian', r); cls = r >= 1.5 ? 'up' : r <= 0.67 ? 'down' : ''; }
    cards.push(`<div class="kpi ${cls}"><div class="l">${t('months')[m - 1]} ${cur.year} · ${label}${M.partial ? ' ⚠' : ''}</div><div class="v">${fmt(v)}</div><div class="d">${detail}${med != null ? ` · ${t('median')} ${fmt(med)} (${ys.length} ${t('years')})` : ''}</div></div>`);
  };
  card(last, last.through && last.through.slice(0, 7) === `${cur.year}-${String(last.m).padStart(2, '0')}` && new Date(last.through).getUTCDate() < 28 ? t('mtd') : t('mtd'));
  if (monthsWithData.length > 1) card(monthsWithData[monthsWithData.length - 2], t('lastfull'));
  // annual to date vs same-period medians
  const ytd = monthsWithData.reduce((a, M) => a + (M.h || 0), 0);
  const ytdHist = ys.filter(y => monthsWithData.every(M => usable(y, M.m))).map(y => monthsWithData.reduce((a, M) => a + A.H[y - Y0][M.m - 1], 0));
  const ytdMed = median(ytdHist);
  cards.push(`<div class="kpi ${ytdMed && ytd / ytdMed >= 1.5 ? 'up' : ytdMed && ytd / ytdMed <= 0.67 ? 'down' : ''}"><div class="l">${t('months')[0]}–${t('months')[last.m - 1]} ${cur.year}</div><div class="v">${fmt(ytd)}</div><div class="d">${ytdMed != null ? `${t('vsmedian', ytd / ytdMed)} · ${t('median')} ${fmt(ytdMed)}` : '—'}</div></div>`);
  el.innerHTML = `<div class="now-grid">${cards.join('')}</div><p class="note">${t('nowpre')} ${t('through')} ${cur.through}. ${t('snppeq')} (NOAA-20 ÷ ${cur.bridge['NOAA-20']}, NOAA-21 ÷ ${cur.bridge['NOAA-21']}). ${t('baseline')}: ${ys[0]}–${ys[ys.length - 1]}.${monthsWithData.some(M => M.partial) ? ' ⚠ ' + t('partial') : ''}</p>`;
}

// ---------- calendar heatmap ----------
let calCells = []; // for hit testing
function calendarRows() {
  const rows = []; for (let y = Math.max(range.from[0], 2000); y <= Math.min(range.to[0], 2026); y++) rows.push(y); return rows;
}
function cellValue(y, m) { // y calendar, m 1-based → { v, kind, lo, hi, flags }
  if (y === YCUR) { const M = A.cur?.months[m - 1]; if (!M || !M.days) return { v: null, kind: 'nodata' }; return { v: M.h, kind: 'prelim', partial: M.partial, through: M.through }; }
  const yi = y - Y0; if (!A.has[yi][m - 1]) return { v: null, kind: 'nodata' };
  const v = A.H[yi][m - 1];
  const o = { v, kind: y >= 2012 ? 'obs' : terraOnly(y, m) ? 'terra' : 'recon', lo: A.lo[yi][m - 1], hi: A.hi[yi][m - 1], cloud: A.cloudFlag[yi][m - 1], gap: v > 0 ? A.gap[yi][m - 1] / v : 0, grey: !usable(y, m) };
  return o;
}
function renderCalendar() {
  const cv = $('cal'), ctx = cv.getContext('2d'); const rows = calendarRows();
  const W = 900, left = 56, top = 26, cw = (W - left - 10) / 12, ch = 19; const Hh = top + rows.length * ch + 8;
  cv.width = W; cv.height = Hh; ctx.clearRect(0, 0, W, Hh);
  ctx.fillStyle = '#1e2230'; ctx.fillRect(0, 0, W, Hh);
  let max = 0; for (const y of rows) for (let m = 1; m <= 12; m++) { if (!inRange(y, m)) continue; const c = cellValue(y, m); if (c.v != null && !c.grey) max = Math.max(max, c.v); }
  const scale = v => Math.log1p(v) / Math.log1p(Math.max(1, max));
  ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'center';
  for (let m = 0; m < 12; m++) ctx.fillText(t('months')[m], left + m * cw + cw / 2, 12);
  calCells = [];
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r]; const yy = top + r * ch;
    ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'right'; ctx.fillText(String(y), left - 8, yy + ch / 2);
    for (let m = 1; m <= 12; m++) {
      const x = left + (m - 1) * cw; const c = cellValue(y, m); const inR = inRange(y, m);
      let fill = '#2a3040';
      if (!inR || c.kind === 'nodata') fill = '#262a36';
      else if (c.grey) fill = '#3a3f4e';
      else if (c.v != null) fill = viridis(scale(c.v));
      ctx.fillStyle = fill; ctx.fillRect(x + 1, yy + 1, cw - 2, ch - 2);
      if (inR && c.kind === 'terra' && !c.grey) { ctx.save(); ctx.beginPath(); ctx.rect(x + 1, yy + 1, cw - 2, ch - 2); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; for (let k = -ch; k < cw; k += 6) { ctx.beginPath(); ctx.moveTo(x + k, yy + ch); ctx.lineTo(x + k + ch, yy); ctx.stroke(); } ctx.restore(); }
      if (inR && c.kind === 'prelim') { ctx.strokeStyle = '#f5a623'; ctx.setLineDash([3, 2]); ctx.strokeRect(x + 1.5, yy + 1.5, cw - 3, ch - 3); ctx.setLineDash([]); }
      if (inR && c.v != null && !c.grey && c.kind !== 'prelim' && c.kind !== 'nodata') {
        if (c.cloud) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + cw - 4, yy + 3); ctx.lineTo(x + cw - 9, yy + 8); ctx.lineTo(x + cw - 4, yy + 8); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = .5; ctx.stroke(); }
        if (c.gap > 0.10 || (y >= 2012 && c.gap > 0)) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + 5, yy + ch - 3); ctx.lineTo(x + 8, yy + ch - 7); ctx.lineTo(x + 11, yy + ch - 3); ctx.lineTo(x + 8, yy + ch + 1 - 2); ctx.closePath(); ctx.fill(); }
      }
      calCells.push({ x: x + 1, y: yy + 1, w: cw - 2, h: ch - 2, year: y, month: m, c, inR });
    }
  }
  // legend
  const lg = $('legend'); lg.innerHTML = '';
  const lc = document.createElement('canvas'); lc.width = 160; lc.height = 10; const g = lc.getContext('2d'); for (let i = 0; i < 160; i++) { g.fillStyle = viridis(i / 159); g.fillRect(i, 0, 1, 10); }
  lg.append(Object.assign(document.createElement('span'), { textContent: t('legendlow') }), lc, Object.assign(document.createElement('span'), { textContent: `${t('legendhigh')} (${fmt(max)})` }));
  const sw = (color, label, dashed) => { const s = document.createElement('span'); s.innerHTML = `<i style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;vertical-align:-2px;margin-right:4px;${dashed ? 'border:1px dashed #f5a623;background:transparent;' : ''}"></i>${label}`; return s; };
  lg.append(sw('#3a3f4e', t('legendgrey')), sw('#262a36', t('legendnd')), sw('', t('prelim'), true), Object.assign(document.createElement('span'), { textContent: '▲ ' + t('cloud').split(':')[0] }), Object.assign(document.createElement('span'), { textContent: '◆ ' + t('gap', '').replace(' ()', '') }));
}
function calTip(ev) {
  const cv = $('cal'); const rect = cv.getBoundingClientRect(); const sx = cv.width / rect.width, sy = cv.height / rect.height;
  const px = (ev.clientX - rect.left) * sx, py = (ev.clientY - rect.top) * sy;
  const hit = calCells.find(k => px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h);
  const tip = $('tip'); if (!hit || !hit.inR) { tip.hidden = true; return; }
  const c = hit.c; const lines = [`<b>${t('months')[hit.month - 1]} ${hit.year}</b>`];
  if (c.kind === 'nodata') lines.push(t('nodata'));
  else if (c.kind === 'prelim') { lines.push(`${fmt(c.v)} ${t('hotspots')} (${t('snppeq')})`, t('prelim') + (c.through ? ` · ${t('through')} ${c.through}` : ''), c.partial ? '⚠ ' + t('partial') : ''); }
  else {
    lines.push(`${fmt(c.v)} ${t('hotspots')}`);
    lines.push(c.kind === 'obs' ? t('obs') : c.kind === 'terra' ? `${t('recon')} (${t('terra')})` : t('recon'));
    if (c.kind !== 'obs') { if (c.v === 0) lines.push(hit.year < 2012 && (A.tier === 'C' || A.tier === 'D') ? t('nomodis') : ''); else if (c.lo != null) lines.push(`${t('range')}: ${fmt(c.lo)} – ${fmt(c.hi)}`); }
    if (c.cloud) lines.push('▲ ' + t('cloud'));
    if (c.gap > 0) lines.push('◆ ' + t('gap', c.gap > 0.10 ? Math.round(100 * c.gap) : ''));
    if (c.grey) lines.push(`(${t('legendgrey')})`);
    if (hit.year === 2002) lines.push(t('mixed')); if (hit.year === 2000) lines.push(t('y2000'));
  }
  tip.innerHTML = lines.filter(Boolean).join('<br>'); tip.hidden = false;
  const wrap = cv.parentElement.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - wrap.left + 12, wrap.width - 290) + 'px'; tip.style.top = (ev.clientY - wrap.top + 12) + 'px';
}

// ---------- monthly series (uPlot) ----------
let uplot = null;
function renderSeries() {
  const xs = [], h = [], lo = [], hi = [], cur = [];
  for (let y = range.from[0]; y <= Math.min(range.to[0], 2026); y++) for (let m = 1; m <= 12; m++) {
    if (!inRange(y, m)) continue; const c = cellValue(y, m); xs.push(Date.UTC(y, m - 1, 1) / 1000);
    if (c.kind === 'prelim') { cur.push(c.v); h.push(null); lo.push(null); hi.push(null); }
    else if (c.kind === 'nodata' || c.grey) { h.push(null); lo.push(null); hi.push(null); cur.push(null); }
    else { h.push(c.v); lo.push(c.lo ?? c.v); hi.push(c.hi ?? c.v); cur.push(null); }
  }
  const el = $('series'); el.innerHTML = ''; if (uplot) { uplot.destroy(); uplot = null; }
  const width = Math.min(900, el.clientWidth || 900);
  uplot = new uPlot({
    width, height: 240, cursor: { drag: { x: false } }, scales: { x: { time: true } },
    axes: [{ stroke: '#9aa3b5', grid: { stroke: '#2a3040' }, ticks: { stroke: '#2a3040' } }, { stroke: '#9aa3b5', grid: { stroke: '#2a3040' }, ticks: { stroke: '#2a3040' }, size: 60, values: (u, vs) => vs.map(v => fmt(v)) }],
    series: [
      { label: lang === 'es' ? 'mes' : 'month', value: (u, v) => v == null ? '—' : new Date(v * 1000).toISOString().slice(0, 7) },
      { label: 'H', stroke: '#f5a623', width: 1.5, value: (u, v) => fmt(v), spanGaps: false },
      { label: 'p90', stroke: 'rgba(245,166,35,0)', fill: 'rgba(245,166,35,0.18)', value: (u, v) => fmt(v), spanGaps: false },
      { label: 'p10', stroke: 'rgba(245,166,35,0)', value: (u, v) => fmt(v), spanGaps: false },
      { label: String(YCUR), stroke: '#7dd3a5', width: 2, dash: [4, 3], points: { show: true, size: 6 }, value: (u, v) => fmt(v) },
    ],
    bands: [{ series: [2, 3], fill: 'rgba(245,166,35,0.18)' }],
    legend: { show: true },
  }, [xs, h, hi, lo, cur], el);
}

// ---------- annual totals + ranking (R5: 2000 never ranked, 2002 marked; R2 D: no ranking across 2012) ----------
function annualTotals() {
  const out = [];
  for (let y = Math.max(range.from[0], A.fromYear); y <= Math.min(range.to[0], 2025); y++) {
    let tot = 0, nm = 0; for (let m = 1; m <= 12; m++) if (inRange(y, m) && usable(y, m)) { tot += A.H[y - Y0][m - 1]; nm++; }
    if (nm) out.push({ y, tot, nm, complete: nm === 12 });
  }
  return out;
}
function renderYears() {
  const cv = $('years'), ctx = cv.getContext('2d'); const W = cv.width, Hh = cv.height; ctx.clearRect(0, 0, W, Hh); ctx.fillStyle = '#1e2230'; ctx.fillRect(0, 0, W, Hh);
  const data = annualTotals(); const cur = A.cur ? A.cur.months.filter(M => M.days).reduce((a, M) => a + (M.h || 0), 0) : null;
  const all = data.map(d => d.tot).concat(cur != null ? [cur] : []); const max = Math.max(1, ...all);
  const n = data.length + (cur != null ? 1 : 0); const left = 44, bottom = 22, bw = (W - left - 8) / Math.max(1, n);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  data.forEach((d, i) => { const hgt = (Hh - bottom - 10) * d.tot / max; const x = left + i * bw; ctx.fillStyle = d.y >= 2012 ? '#f5a623' : terraOnly(d.y, 12) && d.y < 2002 ? '#8a6d2b' : '#c48a2a'; ctx.fillRect(x + 1, Hh - bottom - hgt, bw - 2, hgt); if ((d.y % 5 === 0 && d.y !== 2025) || n < 14) { ctx.fillStyle = '#9aa3b5'; ctx.fillText(String(d.y), x + bw / 2, Hh - bottom + 4); } });
  if (cur != null) { const hgt = (Hh - bottom - 10) * cur / max; const x = left + data.length * bw; ctx.setLineDash([3, 2]); ctx.strokeStyle = '#7dd3a5'; ctx.strokeRect(x + 1.5, Hh - bottom - hgt, bw - 3, hgt); ctx.setLineDash([]); ctx.fillStyle = '#7dd3a5'; ctx.fillText(String(YCUR), x + bw / 2, Hh - bottom + 4); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#9aa3b5'; ctx.fillText(fmt(max), left - 4, 12); ctx.fillText('0', left - 4, Hh - bottom);
  // ranking
  const rk = $('rank'); rk.innerHTML = '';
  let ranked = data.filter(d => d.complete && d.y !== 2000);
  if (A.tier === 'D' && showPre) ranked = ranked.filter(d => d.y >= 2012); // no ranking across 2012 for tier D
  ranked.sort((a, b) => b.tot - a.tot).slice(0, 8).forEach(d => { const li = document.createElement('li'); li.innerHTML = `${d.y}: <b>${fmt(d.tot)}</b> <span class="tag">${d.y >= 2012 ? '' : d.y === 2002 ? '· ' + t('mixed') : '· ' + t('recon')}</span>`; rk.append(li); });
}

// ---------- seasonality ----------
function renderSeason() {
  const cv = $('season'), ctx = cv.getContext('2d'); const W = cv.width, Hh = cv.height; ctx.clearRect(0, 0, W, Hh); ctx.fillStyle = '#1e2230'; ctx.fillRect(0, 0, W, Hh);
  const ys = baselineYears(); const med = [], q1 = [], q3 = [];
  for (let m = 1; m <= 12; m++) { const vals = ys.filter(y => usable(y, m)).map(y => A.H[y - Y0][m - 1]); med.push(median(vals)); q1.push(quantile(vals, .25)); q3.push(quantile(vals, .75)); }
  const curM = A.cur ? A.cur.months.map(M => M.days ? M.h : null) : [];
  const max = Math.max(1, ...q3.filter(v => v != null), ...curM.filter(v => v != null));
  const left = 44, bottom = 22, bw = (W - left - 8) / 12; ctx.font = '10px system-ui, sans-serif';
  for (let m = 0; m < 12; m++) {
    const x = left + m * bw; const hM = med[m] == null ? 0 : (Hh - bottom - 10) * med[m] / max;
    if (q1[m] != null) { const y1 = Hh - bottom - (Hh - bottom - 10) * q3[m] / max, y2 = Hh - bottom - (Hh - bottom - 10) * q1[m] / max; ctx.fillStyle = 'rgba(245,166,35,0.25)'; ctx.fillRect(x + 2, y1, bw - 4, Math.max(1, y2 - y1)); }
    ctx.fillStyle = '#f5a623'; ctx.fillRect(x + 2, Hh - bottom - hM, bw - 4, Math.max(hM, med[m] != null ? 1 : 0));
    if (curM[m] != null) { const yc = Hh - bottom - (Hh - bottom - 10) * curM[m] / max; ctx.fillStyle = '#7dd3a5'; ctx.beginPath(); ctx.arc(x + bw / 2, yc, 4, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(t('months')[m], x + bw / 2, Hh - bottom + 4);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(max), left - 4, 12); ctx.fillText('0', left - 4, Hh - bottom);
  $('season-note').textContent = ys.length ? t('seasonnote', ys[0], ys[ys.length - 1]) + (A.cur ? ` ● ${YCUR}` : '') : '';
}

// ---------- static sources (R6) ----------
function renderStatic() {
  const card = $('static-card'); card.hidden = !showStatic; if (!showStatic) return;
  const cv = $('static'), ctx = cv.getContext('2d'); const W = cv.width, Hh = cv.height; ctx.clearRect(0, 0, W, Hh); ctx.fillStyle = '#1e2230'; ctx.fillRect(0, 0, W, Hh);
  const data = []; for (let y = 2012; y <= 2025; y++) { let s = 0; for (let m = 0; m < 12; m++) s += A.st[y - Y0][m]; data.push({ y, s }); }
  if (A.cur) data.push({ y: YCUR, s: A.cur.months.filter(M => M.days).reduce((a, M) => a + (M.st || 0), 0), prelim: true });
  const max = Math.max(1, ...data.map(d => d.s)); const left = 50, bottom = 20, bw = (W - left - 8) / data.length; ctx.font = '11px system-ui, sans-serif';
  data.forEach((d, i) => { const hgt = (Hh - bottom - 10) * d.s / max; const x = left + i * bw; if (d.prelim) { ctx.setLineDash([3, 2]); ctx.strokeStyle = '#9aa3b5'; ctx.strokeRect(x + 2.5, Hh - bottom - hgt, bw - 5, hgt); ctx.setLineDash([]); } else { ctx.fillStyle = '#6c7a93'; ctx.fillRect(x + 2, Hh - bottom - hgt, bw - 4, hgt); } ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(d.y), x + bw / 2, Hh - bottom + 4); });
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(max), left - 4, 12);
}

// ---------- downloads (R13) ----------
function downloadCSV() {
  const rows = [`# ${t('csvhdr')}`, `# unit: VIIRS-equivalent 375 m pixel counts (vegetation class; static sources in a separate column, VIIRS units from 2012) · area: ${A.sel.kind} ${A.sel.label || ''} · ${A.n} cells · tier ${A.tier} · region ${A.region} · dominant province ${A.dominant} · baseline ${A.baselineFrom}–2025 · factor_source ${A.borrowed ? 'assigned (borrowed from the region)' : 'estimated'} · generated ${new Date().toISOString()}`,
    'year,month,H,H_lo,H_hi,sensor,tier,baseline_from,in_statistics,reconstructed_share,gap_fill_share,cloud_flag,static_viirs,factor_source,note'];
  for (let y = 2000; y <= 2025; y++) for (let m = 1; m <= 12; m++) {
    const yi = y - Y0; if (!A.has[yi][m - 1]) continue; const v = A.H[yi][m - 1];
    const sensor = y >= 2012 ? 'VIIRS' : terraOnly(y, m) ? 'MODIS-Terra->VIIRS-eq' : 'MODIS->VIIRS-eq';
    const lo = A.lo[yi][m - 1], hi = A.hi[yi][m - 1]; const rs = v > 0 ? A.recon[yi][m - 1] / v : (y < 2012 ? 1 : 0), gs = v > 0 ? A.gap[yi][m - 1] / v : 0;
    const note = y < 2012 && v === 0 && (A.tier === 'C' || A.tier === 'D') ? 'no MODIS detection' : y === 2002 ? 'mixed Terra-only / Terra+Aqua year' : y === 2000 ? 'two months only' : '';
    rows.push([y, m, v.toFixed(1), lo == null ? '' : lo.toFixed(1), hi == null ? '' : hi.toFixed(1), sensor, A.tier, A.baselineFrom, usable(y, m) ? 1 : 0, rs.toFixed(2), gs.toFixed(2), A.cloudFlag[yi][m - 1] ? 1 : 0, y >= 2012 ? A.st[yi][m - 1] : '', A.borrowed ? 'assigned' : 'estimated', note].join(','));
  }
  if (A.cur) for (const M of A.cur.months) if (M.days) rows.push([A.cur.year, M.m, M.h.toFixed(1), '', '', `VIIRS NRT S-NPP-eq (NOAA-20/${A.cur.bridge['NOAA-20']}, NOAA-21/${A.cur.bridge['NOAA-21']})`, A.tier, A.baselineFrom, 0, 0, '', '', M.st.toFixed(1), '', `preliminary, month to date through ${M.through}; days with 3/2/1/0 satellites ${M.d3}/${M.d2}/${M.d1}/${M.d0}`].join(','));
  save(new Blob([rows.join('\n')], { type: 'text/csv' }), `geofuego-harmonized_${slug()}.csv`);
}
function downloadPNG() {
  const cal = $('cal'); const W = cal.width, pad = 16, titleH = 56, footH = 44; const out = document.createElement('canvas'); out.width = W + 2 * pad; out.height = cal.height + titleH + footH + 2 * pad;
  const g = out.getContext('2d'); g.fillStyle = '#0f1115'; g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = '#e8eaf0'; g.font = 'bold 18px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText(`${$('aoi-title').textContent} — ${t('caltitle')}`, pad, pad);
  g.font = '12px system-ui, sans-serif'; g.fillStyle = '#9aa3b5'; g.fillText($('aoi-sub').textContent, pad, pad + 26);
  g.drawImage(cal, pad, pad + titleH);
  g.fillStyle = '#9aa3b5'; g.font = '11px system-ui, sans-serif';
  g.fillText(t('unit').split(/\. /)[0] + '. ' + t('unit').split(/\. /)[1] + '.', pad, pad + titleH + cal.height + 8); g.fillText('GeoFuego Harmonization · NASA FIRMS (MODIS, VIIRS) · spaceapps.geofuego.com.ar · CC BY 4.0', pad, pad + titleH + cal.height + 24);
  out.toBlob(b => save(b, `geofuego-calendar_${slug()}.png`));
}
const slug = () => (A.sel.label || A.sel.kind || 'aoi').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

// ---------- map & selection ----------
let map, drawn, cellsLayer, provLayers = {};
const DRAW_STYLE = { color: '#d9480f', weight: 2, fillColor: '#f5a623', fillOpacity: 0.15 };
function highlightProvince(name) { for (const [n, l] of Object.entries(provLayers)) l.setStyle(n === name ? { color: '#d9480f', weight: 2.5, fillOpacity: 0 } : { color: '#6c7a93', weight: 1, fillOpacity: 0 }); }
function clearSelection() { if (drawn) drawn.clearLayers(); if (cellsLayer) { cellsLayer.remove(); cellsLayer = null; } A = null; highlightProvince(null); $('prov').value = ''; $('out').hidden = true; $('empty').hidden = false; history.replaceState(null, '', location.pathname + (lang === 'es' ? '#lang=es' : '')); map.setView([-38.5, -63.5], 4); }
function pointInRing(lat, lon, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const yi = ring[i].lat, xi = ring[i].lng, yj = ring[j].lat, xj = ring[j].lng; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
function cellsForLayer(layer) {
  const b = layer.getBounds(); const ring = layer instanceof L.Rectangle ? null : layer.getLatLngs()[0];
  const ids = [];
  for (const id of Object.keys(D.cells)) { const [a, c, b2, d] = cellBounds(+id); const lat = (a + b2) / 2, lon = (c + d) / 2; if (lat < b.getSouth() || lat > b.getNorth() || lon < b.getWest() || lon > b.getEast()) continue; if (ring && !pointInRing(lat, lon, ring)) continue; ids.push(+id); }
  let snapped1 = false;
  if (!ids.length) { const cen = b.getCenter(); const id = cellOf(cen.lat, cen.lng); if (id != null && D.cells[id]) { ids.push(id); snapped1 = true; } }
  return { ids, snapped1 };
}
function select(sel) {
  if (!sel.cells.length) return;
  A = aggregate(sel);
  if (cellsLayer) cellsLayer.remove();
  const feats = sel.cells.map(id => { const [a, c, b, d] = cellBounds(id); return [[a, c], [b, d]]; });
  cellsLayer = L.layerGroup(feats.length > 1500 ? [L.rectangle(L.latLngBounds(feats.map(f => f[0]).concat(feats.map(f => f[1]))), { color: '#f5a623', weight: 1.5, fill: false, dashArray: '4 3' })] : feats.map(f => L.rectangle(f, { color: '#f5a623', weight: 1, fillOpacity: 0.12, interactive: false }))).addTo(map);
  if (sel.kind !== 'drawn') { if (drawn) drawn.clearLayers(); }
  highlightProvince(sel.kind === 'province' ? sel.label : null);
  $('empty').hidden = true;
  if (sel.kind === 'point' || sel.kind === 'province' || sel.kind === 'country') { map.invalidateSize(); map.fitBounds(L.latLngBounds(feats.flat()), { padding: [10, 10], maxZoom: sel.kind === 'point' ? 9 : 7, animate: false }); }
  location.hash = encodeSel(sel);
  render();
}
function encodeSel(sel) { const p = [`lang=${lang}`]; if (sel.kind === 'country') p.push('aoi=ar'); else if (sel.kind === 'province') p.push('prov=' + encodeURIComponent(sel.label)); else if (sel.kind === 'point') p.push('pt=' + sel.label.replace(/\s/g, '')); else if (sel.kind === 'drawn' && sel.bbox) p.push('bbox=' + sel.bbox.map(v => v.toFixed(3)).join(',')); return p.join('&'); }
function fromHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (h.get('aoi') === 'ar') return selectCountry();
  if (h.get('prov')) { const p = h.get('prov'); $('prov').value = p; return selectProvince(p); }
  if (h.get('pt')) { const [lat, lon] = h.get('pt').split(',').map(Number); $('lat').value = lat; $('lon').value = lon; return selectPoint(lat, lon); }
  if (h.get('bbox')) { const [s, w, n, e] = h.get('bbox').split(',').map(Number); const r = L.rectangle([[s, w], [n, e]], DRAW_STYLE); drawn.addLayer(r); return selectLayer(r); }
}
function selectCountry() { $('prov').value = ''; select({ kind: 'country', label: 'Argentina', cells: Object.keys(D.cells).map(Number) }); }
function selectProvince(p) { if (!p) return; select({ kind: 'province', label: p, cells: Object.keys(D.cells).filter(id => D.cells[id].p === p).map(Number) }); }
function selectPoint(lat, lon) { $('prov').value = ''; const id = cellOf(lat, lon); if (id == null || !D.cells[id]) { alert(lang === 'es' ? 'Punto fuera de la grilla de Argentina.' : 'Point outside the Argentina grid.'); return; } select({ kind: 'point', label: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, cells: [id] }); }
function selectLayer(layer) { const { ids, snapped1 } = cellsForLayer(layer); const b = layer.getBounds(); select({ kind: 'drawn', label: 'drawn', cells: ids, snapped1, bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()] }); }

function initMap() {
  map = L.map('map', { preferCanvas: true, zoomControl: true, attributionControl: false }).setView([-38.5, -63.5], 4);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3 }).addTo(map);
  if (PROV) for (const p of PROV.provincias) { const l = L.polygon(p.rings.map(r => [r]), { color: '#6c7a93', weight: 1, fillOpacity: 0, fillColor: '#f5a623', interactive: true, bubblingMouseEvents: false }).addTo(map); l.bindTooltip(p.n === TDF ? 'Tierra del Fuego' : p.n, { sticky: true, direction: 'top', opacity: 0.9 }); l.on('click', () => { if (document.querySelector('.leaflet-draw-toolbar .leaflet-draw-toolbar-button-enabled')) return; $('prov').value = p.n; selectProvince(p.n); }); l.on('mouseover', () => { if (!(A && A.sel.kind === 'province' && A.sel.label === p.n)) l.setStyle({ fillOpacity: 0.12 }); }); l.on('mouseout', () => l.setStyle({ fillOpacity: 0 })); provLayers[p.n] = l; }
  drawn = new L.FeatureGroup().addTo(map);
  const ctl = new L.Control.Draw({ position: 'topleft', draw: { polyline: false, circle: false, circlemarker: false, marker: false, rectangle: { shapeOptions: DRAW_STYLE, showArea: false }, polygon: { allowIntersection: false, shapeOptions: DRAW_STYLE, showArea: false } }, edit: { featureGroup: drawn, edit: false } });
  map.addControl(ctl);
  map.on(L.Draw.Event.CREATED, e => { drawn.clearLayers(); drawn.addLayer(e.layer); $('prov').value = ''; selectLayer(e.layer); });
  map.on(L.Draw.Event.DELETED, () => clearSelection());
}

function initUI() {
  const provs = [...new Set(Object.values(D.cells).map(c => c.p))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  for (const p of provs) $('prov').append(Object.assign(document.createElement('option'), { value: p, textContent: p === TDF ? 'Tierra del Fuego' : p }));
  $('prov').addEventListener('change', e => selectProvince(e.target.value));
  $('country').addEventListener('click', () => { $('prov').value = ''; selectCountry(); });
  $('clear').addEventListener('click', clearSelection);
  $('go').addEventListener('click', () => { const lat = +$('lat').value, lon = +$('lon').value; if (!isFinite(lat) || !isFinite(lon) || !$('lat').value || !$('lon').value) return; $('prov').value = ''; selectPoint(lat, lon); });
  $('from').addEventListener('change', e => { const [y, m] = e.target.value.split('-').map(Number); if (y) { range.from = [y, m]; render(); } });
  $('to').addEventListener('change', e => { const [y, m] = e.target.value.split('-').map(Number); if (y) { range.to = [y, m]; render(); } });
  $('tog-pre').addEventListener('change', e => { showPre = e.target.checked; render(); });
  $('tog-static').addEventListener('change', e => { showStatic = e.target.checked; renderStatic(); });
  $('dl-csv').addEventListener('click', downloadCSV); $('dl-png').addEventListener('click', downloadPNG);
  $('cal').addEventListener('mousemove', calTip); $('cal').addEventListener('mouseleave', () => { $('tip').hidden = true; });
  $('lang').addEventListener('click', () => { lang = lang === 'en' ? 'es' : 'en'; applyI18n(); if (A) { location.hash = encodeSel(A.sel); render(); } });
  window.addEventListener('resize', () => { if (A) renderSeries(); });
  window.addEventListener('hashchange', () => { if (A && location.hash === '#' + encodeSel(A.sel)) return; const h = new URLSearchParams(location.hash.replace(/^#/, '')); if (h.get('lang') && h.get('lang') !== lang) { lang = h.get('lang') === 'es' ? 'es' : 'en'; applyI18n(); } fromHash(); });
}

(async () => {
  applyI18n();
  try { await load(); } catch (e) { $('empty').innerHTML = `<p>Data could not be loaded (${e.message}).</p>`; return; }
  initMap(); initUI(); fromHash();
  window.__ready = { cells: Object.keys(D.cells).length, live: L26 ? L26.data_through : null };
})();
})();
