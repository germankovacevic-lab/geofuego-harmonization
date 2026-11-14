/* GeoFuego Harmonization — web app (NASA Space Apps 2026, team GeoFuego.com.ar).
   Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
   Static client: reads data/cells.json (harmonized 2000–2025, per 0.25° cell), data/cells_2026.json (preliminary current year)
   and data/oni.json. Implements the application rules R1–R13 of docs/peer_review_round4_nasa.md §3. No external services. */
(() => {
'use strict';

// ---------- i18n ----------
const T = {
  en: {
    ctx26: 'Context 2026 (Argentina, preliminary): strong El Niño, ONI +2.5 in Aug–Oct, the highest for those months since 1950. In most departments of the main fire provinces, August 2026 had the greenest vegetation for an August since 2001 and very wet topsoil; September was near normal; October was the coldest October since 2001. Nationally, August and October 2026 are the lowest August and the lowest October of the VIIRS record (2012 →). Sources: NOAA CPC ONI; ERA5-Land and MODIS NDVI via the Estado hídrico dataset (doi:10.5281/zenodo.24035880).',
    stepterra: 'The harmonized line starts in 2003 here: November 2000 – June 2002 is the Terra-only era (one satellite, reconstruction error ≈ 17 % per province against ≈ 10 % with Terra + Aqua), shown only for areas of 100 cells or more. The raw MODIS line still starts in 2001.',
    mcount: 'Count', manom: 'Anomaly', kcrit: 'Critical months', kcritd: (pct, peak) => `${pct} % of a typical year's activity · peak ${peak}`,
    kworst: 'Worst year', kworstd: (v, x) => `${v} hotspots · ${x} the median year`, kmean: 'Typical year', kmeand: (a, b) => `median of annual totals, ${a}–${b}`,
    kskill: 'Calibration skill', kskilld: (sc) => `fire-season error out of sample (leave-one-year-out 2012–23) · one national factor: ${sc}`, kskillsz: (n) => `fire-season error out of sample for ${n === 1 ? 'a single cell' : `areas of ~${n} cells`} (leave-one-year-out 2012–23)`,
    anomlegend: (y0, y1) => `Anomaly = month ÷ median of the same month, ${y0}–${y1}. Blue below normal, red above. “·” = too little fire in the record to compare.`,
    pulse: 'Fire pulse: play the years', pulseTitle: 'Fire film',
    colours: 'Colours',
    casestitle: 'Known fire seasons', validtitle: 'How well it works — tested on years the model never saw',
    validnote: 'Country-level tests, out of sample. Factors fitted on 2012–2023 only; 2024 and 2025 were used neither for the factors nor for the range. Details and every script: Method &amp; code.',
    v1l: 'Years never used: 2024 · 2025', v1d: 'reconstruction vs what VIIRS observed, country (predicted / observed 1.044 · 1.024)',
    v2l: 'Fire-season error, leave-one-year-out 2012–23', v2d: 'country · province · single cell is 30 % (one national factor: 8.9 / 15.0 / 34 %)',
    v3l: 'The 80 % range, checked on 2024 · 2025', v3d: 'share of single cells inside it; provinces 76 % · 73 %',
    v4l: 'Burned hectares per hotspot, after vs before 2012', v4d: 'harmonized (1 = continuous); the naive splice gives 3.12 — independent check with MODIS burned area (MCD64A1)',
    caseline: (name, months, y, x, rank, n, y0, y1) => `${name}, ${months} ${y}: <b>${x}</b> the median of ${months} ${y0}–${y1}${rank === 1 ? ` — the highest of ${n} years on record for this area` : ` — ${ord(rank)} highest of ${n} years`}.`,
    caselow: (name, months, y, v, med, rank, n) => `${name}, ${months} ${y}: <b>${v}</b> hotspots against a typical ${med}${rank === 1 ? ` — the highest of ${n} years on record for this area` : ` — ${ord(rank)} highest of ${n} years`}.`,
    times: 'the median', fireslayer: 'Hotspots · selected area and dates',
    steptitle: 'In 2012 the satellite changed. The record should not jump with it.', source: 'Source', harmonized: 'Harmonized', spliced: 'Spliced as recorded',
    stepmodisd2: 'the same sensor on both sides of 2012', stepharmd2: (m) => `no sensor step; MODIS alone gives ${m}`,
    stepnaive: 'Spliced as recorded', stepnaived: 'VIIRS 2012–14 vs MODIS 2009–11: the jump comes from the change of sensor',
    stepmodis: 'MODIS alone, before and after', stepmodisd: 'MODIS kept flying after 2012: the same sensor on both sides shows no jump',
    stepharm: 'Harmonized record', stepharmd: 'follows the trend MODIS sees on its own: the step is gone',
    stepharmna: 'Before 2012 the harmonized record is not shown for an area this size.', steplow: 'Too few detections in this area for a stable before/after ratio; read the chart, not the ratios.',
    stepnote: 'Annual totals 2001–2025, whole record (the date range above does not apply). MODIS and VIIRS in each sensor’s own units: Terra + Aqua hotspots (Terra only until mid-2002, hence the rise to 2003) and VIIRS S-NPP hotspots. Harmonized = VIIRS-equivalent: reconstructed from MODIS until 2011, with its 80 % range (sum of the monthly bounds, conservative), observed by VIIRS from 2012. Spliced as recorded = raw MODIS until 2011, raw VIIRS from 2012, what you get by joining the two archives as they are. Ratios: mean of 2012–14 over mean of 2009–11. Vegetation class; fixed heat sources excluded.',
    viirsstarts: 'VIIRS starts', peryear: 'hotspots per year',
    tagline: 'One fire-hotspot calendar for any area of Argentina, November 2000 → today. MODIS converted to VIIRS-equivalent counts, with a calibrated 80 % range on every reconstructed month.',
    h1sub: 'MODIS + VIIRS fire calendar', method: 'Method & code', province: 'Province', country: 'Whole country', latlon: 'Lat / Lon', go: 'Go', clear: 'Clear', drawhint: 'On the map: click a province, or zoom in and click the cells you want (click again to remove); the rectangle tool selects many cells at once.', cellsel: 'Selected cells', home: 'Centre on Argentina',
    attrib: 'Basemaps: Esri World Imagery (Esri, Maxar, Earthstar Geographics), World Boundaries & Places, World Topo, Light Gray Canvas (Esri, HERE, Garmin, OpenStreetMap contributors). Grid: 0.25°. Data: NASA FIRMS (MODIS, VIIRS).',
    empty: 'Pick a province, enter a point, or draw an area. The calendar snaps to whole 0.25° cells (about 25 × 25 km).',
    from: 'From', to: 'to', nowtitle: 'This month vs the historical median', caltitle: 'Burning-activity calendar', togpre: 'show greyed years', togstatic: 'fixed heat sources',
    unit: 'Counts are satellite fire detections expressed in VIIRS-equivalent pixels (375 m). They are not a number of fires and not burned area. A fire that burns for several days is counted on every satellite pass.',
    eras: 'From 2012 the values are observed by VIIRS. Before 2012 they are estimated from MODIS, a coarser sensor, and shown with an 80 % range: about 1 month in 5 falls outside it.',
    smallnote: 'MODIS missed many small fires that VIIRS detects. In an area this size, a month with no value before 2012 means “MODIS detected nothing”, not “nothing burned”. Do not compare how often it burned before and after 2012.',
    seriestitle: 'Monthly series with 80 % range', yearstitle: 'Which years burned most', seasontitle: 'Which months of the year', wheretitle: 'Where it burns — share of hotspots by province',
    statictitle: 'Fixed heat sources (gas flares, industry) — separate series, VIIRS counts, 2012 →',
    staticnote: "Never added to the calendar above. In the sensor's own units: VIIRS counts since 2012; the MODIS-era values are not shown.",
    how: 'How to read this',
    how1: 'Unit: the 0.25° cell. Drawn areas snap to whole cells; an area smaller than one cell becomes that cell.',
    how2: 'Size tiers: ≥ 100 cells full calendar · 25–99 full, pre-2012 labelled reconstructed · 4–24 baseline 2012–2025, pre-2012 zero = no MODIS detection · 1–3 pre-2012 greyed and excluded unless you toggle them on. Chubut and Santa Cruz: one tier stricter. Tierra del Fuego: 2012 → only.',
    how3: '80 % range: calibrated out of sample per fire-regime region, size class and predicted count, widened in strong ENSO months and in cloudier-than-usual months. Only reconstructed months carry it.',
    how4: 'Markers: ▲ cloudier than usual at overpass time (the count may be low) · ◆ partly modelled (satellite outage) · hatch: Terra-only era (Nov 2000 – Jun 2002), shown for ≥ 100 cells.',
    how5: 'Current year: preliminary, near-real-time, NOAA-20/21 converted to S-NPP-equivalent (± 5 %), month to date. Not part of the harmonized record. This is not an alert system: an empty cell does not mean there is no fire.',
    foot: "NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots (CONAE) · Team GeoFuego.com.ar · Data: NASA FIRMS (MODIS Collection 6/6.1, VIIRS S-NPP / NOAA-20 / NOAA-21), ERA5, ERA5-Land and MODIS NDVI (2026 context line), NOAA CPC ONI, IGN Argentina · Code MIT, data CC BY 4.0 · Built with SI assistance (Claude, Anthropic); every number is computed by the open scripts from NASA FIRMS data. We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Science Data and Information System (ESDIS).",
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
    mtd: 'month to date', lastfull: 'last complete month', fullmonth: 'complete month', median: 'median', of: 'of', years: 'years', rank: (r, n) => `${ord(r)} highest of ${n} years`,
    vsmedian: (x) => x >= 1 ? `${x.toFixed(1)}× the median` : `${(100 * (1 - x)).toFixed(0)} % below the median`,
    sofar: (d, n) => `${d} of ${n} days`, paced: (v) => `a typical month has ≈ ${v} by this date`, vspace: (x) => x >= 1 ? `${x.toFixed(1)}× the usual pace` : `${(100 * (1 - x)).toFixed(0)} % below the usual pace`,
    cell: 'cell', rangenote: (a, b) => `Showing ${a} – ${b}. Medians and rankings use only the years inside this range.`, tierDon: 'Years before 2012 are shown and included in the statistics (toggle off to exclude them). Treat them as rough: 1–3 cells.', borrowedOnly: 'Factor borrowed from the region (not estimated in this area): too few detections to fit a local conversion.', prelimfull: 'preliminary, near-real-time, complete month', rangehi: 'range high', rangelo: 'range low', outside: 'Point outside the mainland grid: no hotspot data.', needpt: 'Enter both latitude and longitude.',
    nodata26: 'No data yet for the current year in this area.', baseline: 'baseline', recon: 'reconstructed from MODIS', obs: 'observed (VIIRS)', terra: 'Terra only', nodata: 'no data',
    nomodis: 'no MODIS detection', range: '80 % range', cloud: 'cloudier than usual at overpass time: the count may be low', gap: (p) => `partly modelled (satellite outage${p ? `, ${p} %` : ''})`,
    prelim: 'preliminary, near-real-time, month to date', snppeq: 'S-NPP-equivalent', hotspots: 'VIIRS-equivalent hotspots',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    legendlow: 'few', legendhigh: 'many', legendgrey: 'greyed / excluded', legendnd: 'no data', mixed: '2002 mixes Terra-only and Terra+Aqua months', y2000: '2000 has two months and is never ranked',
    seasonnote: (y0, y1) => `Median and inter-quartile range by calendar month, ${y0}–${y1}.`, through: 'data through', annual: 'annual total',
    csvhdr: 'GeoFuego Harmonization — CC BY 4.0 — produced by scripts written with SI assistance (Claude, Anthropic) from NASA FIRMS data',
  },
  es: {
    ctx26: 'Contexto 2026 (Argentina, preliminar): El Niño fuerte, ONI +2,5 en ago–oct, el más alto para esos meses desde 1950. En la mayoría de los departamentos de las principales provincias con fuego, agosto 2026 tuvo la vegetación más verde para un agosto desde 2001 y el suelo superficial muy húmedo; septiembre fue casi normal; octubre fue el octubre más frío desde 2001. A nivel país, agosto y octubre 2026 son el agosto y el octubre más bajos del registro VIIRS (2012 →). Fuentes: NOAA CPC ONI; ERA5-Land y NDVI MODIS vía el dataset Estado hídrico (doi:10.5281/zenodo.24035880).',
    stepterra: 'Acá la línea armonizada empieza en 2003: noviembre 2000 – junio 2002 es la era de solo Terra (un satélite, error de reconstrucción ≈ 17 % por provincia contra ≈ 10 % con Terra + Aqua), que se muestra solo en áreas de 100 celdas o más. La línea de MODIS crudo sí empieza en 2001.',
    mcount: 'Conteo', manom: 'Anomalía', kcrit: 'Meses críticos', kcritd: (pct, peak) => `${pct} % de la actividad de un año típico · pico en ${peak}`,
    kworst: 'Peor año', kworstd: (v, x) => `${v} focos · ${x} el año mediano`, kmean: 'Año típico', kmeand: (a, b) => `mediana de los totales anuales, ${a}–${b}`,
    kskill: 'Calidad de la calibración', kskilld: (sc) => `error de temporada fuera de muestra (dejando un año afuera, 2012–23) · un factor nacional único: ${sc}`, kskillsz: (n) => `error de temporada fuera de muestra para ${n === 1 ? 'una celda suelta' : `áreas de ~${n} celdas`} (dejando un año afuera, 2012–23)`,
    anomlegend: (y0, y1) => `Anomalía = mes ÷ mediana del mismo mes, ${y0}–${y1}. Azul debajo de lo normal, rojo arriba. “·” = muy poco fuego en el registro para comparar.`,
    pulse: 'Pulso de fuego: recorrer los años', pulseTitle: 'Película del fuego',
    colours: 'Colores',
    casestitle: 'Temporadas conocidas', validtitle: 'Qué tan bien funciona — probado en años que el modelo nunca vio',
    validnote: 'Pruebas a nivel país, fuera de muestra. Factores ajustados solo con 2012–2023; 2024 y 2025 no se usaron ni para los factores ni para el rango. Detalle y cada script: Método y código.',
    v1l: 'Años nunca usados: 2024 · 2025', v1d: 'reconstrucción contra lo que observó VIIRS, país (predicho / observado 1,044 · 1,024)',
    v2l: 'Error de temporada, dejando un año afuera 2012–23', v2d: 'país · provincia · celda suelta 30 % (un factor nacional único: 8,9 / 15,0 / 34 %)',
    v3l: 'El rango del 80 %, verificado en 2024 · 2025', v3d: 'proporción de celdas sueltas adentro; provincias 76 % · 73 %',
    v4l: 'Hectáreas quemadas por foco, después vs antes de 2012', v4d: 'armonizado (1 = continuo); el empalme ingenuo da 3,12 — control independiente con área quemada MODIS (MCD64A1)',
    caseline: (name, months, y, x, rank, n, y0, y1) => `${name}, ${months} ${y}: <b>${x}</b> la mediana de ${months} ${y0}–${y1}${rank === 1 ? ` — el más alto de ${n} años del registro para esta zona` : ` — ${rank}º más alto de ${n} años`}.`,
    caselow: (name, months, y, v, med, rank, n) => `${name}, ${months} ${y}: <b>${v}</b> focos contra un año típico de ${med}${rank === 1 ? ` — el más alto de ${n} años del registro para esta zona` : ` — ${rank}º más alto de ${n} años`}.`,
    times: 'la mediana', fireslayer: 'Focos · área y fechas elegidas',
    steptitle: 'En 2012 cambió el satélite. El registro no debería saltar con él.', source: 'Fuente', harmonized: 'Armonizado', spliced: 'Empalmado tal cual',
    stepmodisd2: 'el mismo sensor a ambos lados de 2012', stepharmd2: (m) => `sin escalón de sensor; MODIS solo da ${m}`,
    stepnaive: 'Empalmado tal cual', stepnaived: 'VIIRS 2012–14 contra MODIS 2009–11: el salto lo produce el cambio de sensor',
    stepmodis: 'MODIS solo, antes y después', stepmodisd: 'MODIS siguió volando después de 2012: el mismo sensor a ambos lados no muestra salto',
    stepharm: 'Registro armonizado', stepharmd: 'sigue la tendencia que MODIS ve por su cuenta: el escalón desaparece',
    stepharmna: 'Antes de 2012 el registro armonizado no se muestra para un área de este tamaño.', steplow: 'Muy pocas detecciones en esta área para un cociente antes/después estable; leer el gráfico, no los cocientes.',
    stepnote: 'Totales anuales 2001–2025, registro completo (el rango de fechas de arriba no se aplica). MODIS y VIIRS en las unidades de cada sensor: focos Terra + Aqua (solo Terra hasta mediados de 2002, de ahí la subida hasta 2003) y focos VIIRS S-NPP. Armonizado = equivalente VIIRS: reconstruido desde MODIS hasta 2011, con su rango del 80 % (suma de las cotas mensuales, conservadora), observado por VIIRS desde 2012. Empalmado tal cual = MODIS crudo hasta 2011, VIIRS crudo desde 2012: lo que sale de pegar los dos archivos como vienen. Cocientes: media 2012–14 sobre media 2009–11. Clase vegetación; fuentes fijas de calor excluidas.',
    viirsstarts: 'empieza VIIRS', peryear: 'focos por año',
    tagline: 'Un calendario de focos de calor para cualquier área de Argentina, noviembre 2000 → hoy. MODIS convertido a conteos equivalentes VIIRS, con un rango del 80 % calibrado en cada mes reconstruido.',
    h1sub: 'calendario de fuego MODIS + VIIRS', method: 'Método y código', province: 'Provincia', country: 'Todo el país', latlon: 'Lat / Lon', go: 'Ir', clear: 'Limpiar', drawhint: 'En el mapa: click en una provincia, o acercá y hacé click en las celdas que quieras (otro click las saca); la herramienta rectángulo marca muchas celdas de una.', cellsel: 'Celdas seleccionadas', home: 'Centrar en Argentina',
    attrib: 'Mapas base: Esri World Imagery (Esri, Maxar, Earthstar Geographics), World Boundaries & Places, World Topo, Light Gray Canvas (Esri, HERE, Garmin, colaboradores de OpenStreetMap). Grilla: 0,25°. Datos: NASA FIRMS (MODIS, VIIRS).',
    empty: 'Elegí una provincia, ingresá un punto o dibujá un área. El calendario se ajusta a celdas enteras de 0,25° (unos 25 × 25 km).',
    from: 'Desde', to: 'hasta', nowtitle: 'Este mes contra la mediana histórica', caltitle: 'Calendario de actividad de fuego', togpre: 'mostrar años grises', togstatic: 'fuentes fijas de calor',
    unit: 'Los conteos son detecciones satelitales de fuego expresadas en píxeles equivalentes VIIRS (375 m). No son cantidad de incendios ni área quemada. Un fuego que dura varios días se cuenta en cada pasada del satélite.',
    eras: 'Desde 2012 los valores son observados por VIIRS. Antes de 2012 se estiman desde MODIS, un sensor más grueso, y se muestran con un rango del 80 %: cerca de 1 mes de cada 5 cae afuera.',
    smallnote: 'MODIS no vio muchos fuegos chicos que VIIRS detecta. En un área de este tamaño, un mes sin valor antes de 2012 significa “MODIS no detectó nada”, no “no se quemó nada”. No comparar la frecuencia de meses con fuego antes y después de 2012.',
    seriestitle: 'Serie mensual con rango del 80 %', yearstitle: 'Qué años se quemó más', seasontitle: 'Qué meses del año', wheretitle: 'Dónde se quema — participación por provincia',
    statictitle: 'Fuentes fijas de calor (antorchas de gas, industria) — serie aparte, conteos VIIRS, 2012 →',
    staticnote: 'Nunca se suman al calendario de arriba. En las unidades del sensor: conteos VIIRS desde 2012; los valores de la era MODIS no se muestran.',
    how: 'Cómo leer esto',
    how1: 'Unidad: la celda de 0,25°. Las áreas dibujadas se ajustan a celdas enteras; un área menor que una celda pasa a ser esa celda.',
    how2: 'Niveles por tamaño: ≥ 100 celdas calendario completo · 25–99 completo, pre-2012 marcado como reconstruido · 4–24 base 2012–2025, cero pre-2012 = sin detección MODIS · 1–3 pre-2012 en gris y excluido salvo que lo actives. Chubut y Santa Cruz: un nivel más estricto. Tierra del Fuego: solo 2012 →.',
    how3: 'Rango del 80 %: calibrado fuera de muestra por región de régimen de fuego, clase de tamaño y conteo predicho; ensanchado en meses de ENSO fuerte y en meses más nublados que lo normal. Solo los meses reconstruidos lo llevan.',
    how4: 'Marcas: ▲ más nublado que lo normal a la hora de paso (el conteo puede estar bajo) · ◆ parcialmente modelado (corte de satélite) · rayado: era solo Terra (nov 2000 – jun 2002), visible con ≥ 100 celdas.',
    how5: 'Año en curso: preliminar, casi en tiempo real, NOAA-20/21 convertidos a equivalente S-NPP (± 5 %), mes a la fecha. No forma parte del registro armonizado. No es un sistema de alerta: una celda vacía no significa que no haya fuego.',
    foot: 'NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots (CONAE) · Equipo GeoFuego.com.ar · Datos: NASA FIRMS (MODIS Collection 6/6.1, VIIRS S-NPP / NOAA-20 / NOAA-21), ERA5, ERA5-Land y NDVI MODIS (línea de contexto 2026), NOAA CPC ONI, IGN Argentina · Código MIT, datos CC BY 4.0 · Construido con asistencia de SI (Claude, Anthropic); cada número lo calculan los scripts abiertos desde datos NASA FIRMS. We acknowledge the use of data from NASA\'s Fire Information for Resource Management System (FIRMS), part of NASA\'s Earth Science Data and Information System (ESDIS).',
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
    mtd: 'mes a la fecha', lastfull: 'último mes completo', fullmonth: 'mes completo', median: 'mediana', of: 'de', years: 'años', rank: (r, n) => `${r}º más alto de ${n} años`,
    vsmedian: (x) => x >= 1 ? `${x.toFixed(1).replace('.', ',')}× la mediana` : `${(100 * (1 - x)).toFixed(0)} % debajo de la mediana`,
    sofar: (d, n) => `${d} de ${n} días`, paced: (v) => `un mes típico lleva ≈ ${v} a esta fecha`, vspace: (x) => x >= 1 ? `${x.toFixed(1).replace('.', ',')}× el ritmo habitual` : `${(100 * (1 - x)).toFixed(0)} % debajo del ritmo habitual`,
    cell: 'celda', rangenote: (a, b) => `Mostrando ${a} – ${b}. Medianas y rankings usan solo los años dentro de este rango.`, tierDon: 'Los años anteriores a 2012 se muestran e incluyen en las estadísticas (desactivá el interruptor para excluirlos). Tomarlos como aproximados: 1–3 celdas.', borrowedOnly: 'Factor prestado de la región (no estimado en esta área): muy pocas detecciones para ajustar una conversión local.', prelimfull: 'preliminar, casi en tiempo real, mes completo', rangehi: 'rango alto', rangelo: 'rango bajo', outside: 'Punto fuera de la grilla continental: sin datos de focos.', needpt: 'Ingresá latitud y longitud.',
    nodata26: 'Todavía no hay datos del año en curso en esta área.', baseline: 'base', recon: 'reconstruido desde MODIS', obs: 'observado (VIIRS)', terra: 'solo Terra', nodata: 'sin datos',
    nomodis: 'sin detección MODIS', range: 'rango 80 %', cloud: 'más nublado que lo normal a la hora de paso: el conteo puede estar bajo', gap: (p) => `parcialmente modelado (corte de satélite${p ? `, ${p} %` : ''})`,
    prelim: 'preliminar, casi en tiempo real, mes a la fecha', snppeq: 'equivalente S-NPP', hotspots: 'focos equivalentes VIIRS',
    months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    legendlow: 'pocos', legendhigh: 'muchos', legendgrey: 'gris / excluido', legendnd: 'sin datos', mixed: '2002 mezcla meses solo Terra y Terra+Aqua', y2000: '2000 tiene dos meses y nunca se rankea',
    seasonnote: (y0, y1) => `Mediana y rango intercuartil por mes calendario, ${y0}–${y1}.`, through: 'datos hasta', annual: 'total anual',
    csvhdr: 'GeoFuego Harmonization — CC BY 4.0 — producido por scripts escritos con asistencia de SI (Claude, Anthropic) a partir de datos NASA FIRMS',
  }
};
let lang = location.hash.includes('lang=es') ? 'es' : 'en'; // English by default (submission rule); ES only by the button or #lang=es
const t = (k, ...a) => { const v = T[lang][k] ?? T.en[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; const v = T[lang][k]; if (typeof v === 'string') el.innerHTML = v; });
  document.getElementById('lang').textContent = lang === 'en' ? 'ES' : 'EN';
  document.getElementById('lang').setAttribute('aria-label', lang === 'en' ? 'Cambiar a español' : 'Switch to English');
}

// ---------- data ----------
let D = null, L26 = null, ONI = {}, PROV = null, RAW = null, SKILL = null;
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
  [RAW, SKILL] = await Promise.all([fetch('data/raw.json').then(r => r.json()).catch(() => null), fetch('data/skill.json').then(r => r.json()).catch(() => null)]);
  Object.assign(grid, D.grid);
}

// ---------- aggregation (R1–R12) ----------
function aggregate(sel) {
  const ids = sel.cells; const n = ids.length;
  const H = Array.from({ length: YEARS }, () => Array(12).fill(0)), has = Array.from({ length: YEARS }, () => Array(12).fill(false));
  const recon = Array.from({ length: YEARS }, () => Array(12).fill(0)), gap = Array.from({ length: YEARS }, () => Array(12).fill(0));
  const cloudH = Array.from({ length: YEARS }, () => Array(12).fill(0)), cloudN = Array.from({ length: YEARS }, () => Array(12).fill(0)), cloudD = Array.from({ length: YEARS }, () => Array(12).fill(0));
  const st = Array.from({ length: YEARS }, () => Array(12).fill(0));
  const provH = {}, provN = {}, regionH = {}; const provHY = {}; const provCur = {};
  let km2 = 0;
  const rawM = RAW ? Array(RAW.y1 - RAW.y0 + 1).fill(0) : null, rawV = RAW ? Array(RAW.y1 - RAW.y0 + 1).fill(0) : null;
  for (const id of ids) {
    const c = D.cells[id]; if (!c) continue; km2 += cellKm2(id);
    const r = RAW?.cells[id]; if (r) for (let k = 0; k < rawM.length; k++) { rawM[k] += r.m[k]; rawV[k] += r.v[k]; }
    provN[c.p] = (provN[c.p] || 0) + 1;
    for (let y = 0; y < YEARS; y++) {
      const hy = c.h[y], sy = c.s[y]; const Y = Y0 + y;
      for (let m = 0; m < 12; m++) {
        const h = hy[m]; if (h < 0) continue; has[y][m] = true; H[y][m] += h; (provHY[c.p] ??= Array.from({ length: YEARS }, () => Array(12).fill(0)))[y][m] += h;
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
  const lowered = stricter && n >= 4 && n < 100; // R8 actually changed the tier (B→C or C→D)
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
    // R10: a VIIRS-era month that is mostly gap-filled from MODIS (January 2012) is reconstructed: it gets the Terra+Aqua band
    const s = setOf(Y, m + 1) || (H[y][m] > 0 && recon[y][m] > 0.5 * H[y][m] ? 'TA' : null); if (!s || H[y][m] <= 0) continue;
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
    for (const id of ids) { const c = L26.cells[id]; if (!c) continue; const pn = D.cells[id]?.p; for (let m = 0; m < 12; m++) if (c.h[m] != null) { h[m] += c.h[m]; s[m] += c.st[m] || 0; any[m] = true; if (pn) (provCur[pn] ??= Array(12).fill(0))[m] += c.h[m]; } }
    const months = L26.months.map(M => ({ ...M, h: M.days ? h[M.m - 1] : null, st: M.days ? s[M.m - 1] : null, partial: M.days > 0 && (M.d0 > 0 || M.d1 > 0 || M.d2 > 0) }));
    cur = { year: L26.year, through: L26.data_through, months, bridge: L26.bridge };
  }
  return { rawM, rawV, sel, n, km2, dominant, shareDom, region, tier, stricter, lowered, tdf, borrowed, fromYear, baselineFrom, H, has, recon, gap, cloudFlag, st, lo, hi, staticShare, cur, provHY, provCur, provN };
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
/** years that contribute at least one usable month (R5: for tiers B–D the Terra-only years drop out here, so the label matches the statistics) */
const baselineYears = () => { const ys = []; for (let y = Math.max(A.baselineFrom, range.from[0]); y <= Math.min(2025, range.to[0]); y++) ys.push(y); return ys.filter(y => y !== 2000 && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some(m => usable(y, m))); };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const RANGE_DEFAULT = [[2000, 11], [2026, 12]];
const rangeIsDefault = () => range.from[0] === RANGE_DEFAULT[0][0] && range.from[1] === RANGE_DEFAULT[0][1] && range.to[0] === RANGE_DEFAULT[1][0] && range.to[1] === RANGE_DEFAULT[1][1];
const ym = ([y, m]) => `${y}-${String(m).padStart(2, '0')}`;
const median = arr => { const a = arr.filter(v => v != null).sort((x, y) => x - y); if (!a.length) return null; const k = a.length / 2; return a.length % 2 ? a[Math.floor(k)] : (a[k - 1] + a[k]) / 2; };
const quantile = (arr, q) => { const a = arr.filter(v => v != null).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };

// viridis (colour-blind safe), 8 anchors interpolated
const VIR = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]];
const RAMPS = {
  fire: [[45, 12, 80], [90, 18, 105], [140, 30, 100], [190, 45, 75], [225, 75, 45], [245, 125, 25], [250, 180, 40], [253, 225, 110], [255, 250, 190]],
  viridis: VIR,
  cividis: [[0, 34, 78], [18, 53, 112], [59, 73, 108], [87, 92, 109], [112, 113, 115], [138, 134, 120], [166, 157, 117], [195, 181, 109], [226, 206, 92], [254, 232, 56]],
};
let rampName = 'fire'; let calMode = 'count';
const DIV = [[33, 102, 172], [103, 169, 207], [180, 210, 230], [70, 74, 88], [253, 174, 97], [240, 80, 40], [200, 20, 30]];
const divRamp = x => { x = Math.max(0, Math.min(1, x)); const i = Math.min(DIV.length - 2, Math.floor(x * (DIV.length - 1))), f = x * (DIV.length - 1) - i; const c = DIV[i].map((v, k) => Math.round(v + (DIV[i + 1][k] - v) * f)); return { css: `rgb(${c[0]},${c[1]},${c[2]})`, lum: (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 }; };
const ramp = x => { const R = RAMPS[rampName]; x = Math.max(0, Math.min(1, x)); const i = Math.min(R.length - 2, Math.floor(x * (R.length - 1))), f = x * (R.length - 1) - i; const c = R[i].map((v, k) => Math.round(v + (R[i + 1][k] - v) * f)); return { css: `rgb(${c[0]},${c[1]},${c[2]})`, lum: (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 }; };
const kfmt = v => v == null ? '' : v < 1000 ? String(Math.round(v)) : v < 9950 ? (v / 1000).toFixed(1).replace('.', lang === 'es' ? ',' : '.') + 'K' : Math.round(v / 1000) + 'K';
const viridis = x => { x = Math.max(0, Math.min(1, x)); const i = Math.min(VIR.length - 2, Math.floor(x * (VIR.length - 1))), f = x * (VIR.length - 1) - i; const c = VIR[i].map((v, k) => Math.round(v + (VIR[i + 1][k] - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`; };

function render() {
  if (!A) return;
  $('empty').hidden = true; $('out').hidden = false;
  renderSummary(); renderKpis(); renderStep(); renderCase(); renderValid(); renderNow(); renderCalendar(); renderSeries(); renderYears(); renderSeason(); renderWhere(); renderStatic();
  $('small-note').hidden = !(A.tier === 'C' || A.tier === 'D');
  $('tog-pre').disabled = A.tier !== 'D'; $('tog-pre').parentElement.style.opacity = A.tier !== 'D' ? '.45' : '';
  if (location.hash !== '#' + encodeSel(A.sel)) history.replaceState(null, '', '#' + encodeSel(A.sel));
}

function renderSummary() {
  const s = A.sel; const title = s.kind === 'country' ? t('argentina') : s.kind === 'province' ? s.label : s.kind === 'point' ? `${t('point')} ${s.label}` : s.kind === 'cells' ? `${t('cellsel')} (${A.n})` : t('drawn');
  $('aoi-title').textContent = title;
  const parts = [`${A.n} ${A.n === 1 ? t('cell') : t('cells')} · ~${fmt(A.km2)} ${t('km2')} · ${t('tier')} ${A.tier}`];
  if (s.kind !== 'country' && s.kind !== 'province') parts.push(`${t('dominant')} ${A.dominant} (${Math.round(100 * A.shareDom)} %)`);
  if (s.kind !== 'country') parts.push(`${t('region')}: ${A.region}`);
  $('aoi-sub').textContent = parts.join(' · ');
  const b = []; const banner = (txt, cls = '') => b.push(`<div class="banner ${cls}">${txt}</div>`);
  if (s.snapped1) banner(t('snapped1'), 'info');
  if (A.tdf) banner(t('tdf')); else banner(t(A.tier === 'D' && showPre ? 'tierDon' : 'tier' + A.tier), 'info');
  if (A.lowered) banner(t('stricter'));
  if (A.borrowed && !A.tdf) banner(t('borrowedOnly'));
  if (!rangeIsDefault()) { const ys = baselineYears(); banner(t('rangenote', ym(range.from), ym(range.to)) + (ys.length ? ` ${t('baseline')}: ${ys[0]}–${ys[ys.length - 1]}.` : ''), 'info'); }
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
  // a month is incomplete when the data stop before its last day; its median is prorated by the fraction of days with data (R4)
  const frac = M => { const dim = daysInMonth(cur.year, M.m); return Math.min(1, Math.max(0, M.days / dim)); };
  const card = (M, label) => {
    const m = M.m; const hist = ys.filter(y => usable(y, m)).map(y => A.H[y - Y0][m - 1]);
    const med = median(hist); const v = M.h; const f = frac(M); const partialMonth = f < 1;
    let cls = '', detail;
    if (med == null) detail = '—';
    else if (partialMonth) { const paced = med * f; if (paced < 10) detail = `${t('sofar', M.days, daysInMonth(cur.year, m))} · ${t('median')} ${fmt(med)} (${hist.length} ${t('years')})`; else { const r = v / paced; detail = `${t('vspace', r)} · ${t('paced', fmt(paced))} · ${t('median')} ${fmt(med)} (${hist.length} ${t('years')})`; cls = r >= 1.5 ? 'up' : r <= 0.67 ? 'down' : ''; } }
    else if (med < 10) { const rank = hist.filter(x => x > v).length + 1; detail = `${t('rank', rank, hist.length + 1)} · ${t('median')} ${fmt(med)} (${hist.length} ${t('years')})`; cls = rank <= Math.ceil((hist.length + 1) / 3) ? 'up' : ''; }
    else { const r = v / med; detail = `${t('vsmedian', r)} · ${t('median')} ${fmt(med)} (${hist.length} ${t('years')})`; cls = r >= 1.5 ? 'up' : r <= 0.67 ? 'down' : ''; }
    cards.push(`<div class="kpi ${cls}"><div class="l">${t('months')[m - 1]} ${cur.year} · ${label}${partialMonth ? ` (${t('sofar', M.days, daysInMonth(cur.year, m))})` : ''}${M.partial ? ' ⚠' : ''}</div><div class="v">${fmt(v)}</div><div class="d">${detail}</div></div>`);
  };
  card(last, frac(last) < 1 ? t('mtd') : t('fullmonth'));
  if (monthsWithData.length > 1) card(monthsWithData[monthsWithData.length - 2], t('lastfull'));
  // year to date vs the same period in each baseline year; the incomplete month enters prorated on both sides
  const ytd = monthsWithData.reduce((a, M) => a + (M.h || 0), 0);
  const ytdHist = ys.filter(y => monthsWithData.every(M => usable(y, M.m))).map(y => monthsWithData.reduce((a, M) => a + A.H[y - Y0][M.m - 1] * frac(M), 0));
  const ytdMed = median(ytdHist);
  cards.push(`<div class="kpi ${ytdMed && ytd / ytdMed >= 1.5 ? 'up' : ytdMed && ytd / ytdMed <= 0.67 ? 'down' : ''}"><div class="l">${t('months')[0]}–${t('months')[last.m - 1]} ${cur.year}${frac(last) < 1 ? ` (${t('through')} ${cur.through})` : ''}</div><div class="v">${fmt(ytd)}</div><div class="d">${ytdMed != null ? `${t(frac(last) < 1 ? 'vspace' : 'vsmedian', ytd / ytdMed)} · ${t('median')} ${fmt(ytdMed)} (${ytdHist.length} ${t('years')})` : '—'}</div></div>`);
  el.innerHTML = `<div class="now-grid">${cards.join('')}</div><p class="note">${t('nowpre')} ${t('through')} ${cur.through}. ${t('snppeq')} (NOAA-20 ÷ ${cur.bridge['NOAA-20']}, NOAA-21 ÷ ${cur.bridge['NOAA-21']}).${ys.length ? ` ${t('baseline')}: ${ys[0]}–${ys[ys.length - 1]}.` : ''}${monthsWithData.some(M => M.partial) ? ' ⚠ ' + t('partial') : ''}</p>${cur.year === 2026 ? `<p class="note ctx26">${t('ctx26')}</p>` : ''}`;
}


// ---------- before / after harmonization (the 2012 step) ----------
let stepPlot = null; const stepShow = { 1: true, 4: true, 5: false, 6: true };
const ratioFmt = x => '×' + (x >= 10 ? x.toFixed(0) : x.toFixed(2)).replace('.', lang === 'es' ? ',' : '.');
function applyStepShow() { if (!stepPlot) return; stepPlot.setSeries(1, { show: stepShow[1] }); stepPlot.setSeries(2, { show: stepShow[1] }); stepPlot.setSeries(3, { show: stepShow[1] }); stepPlot.setSeries(4, { show: stepShow[4] }); stepPlot.setSeries(5, { show: stepShow[5] }); stepPlot.setSeries(6, { show: stepShow[6] }); }
function renderStep() {
  const card = $('step-card'); if (!A.rawM) { card.hidden = true; return; } card.hidden = false;
  const y0 = RAW.y0, y1 = RAW.y1, xs = [], hv = [], hlo = [], hhi = [], mv = [], vv = [], sp = [];
  for (let y = y0; y <= y1; y++) {
    xs.push(y); const k = y - y0; mv.push(A.rawM[k]); vv.push(y >= 2012 ? A.rawV[k] : null); sp.push(y >= 2012 ? A.rawV[k] : A.rawM[k]);
    let tot = 0, lo = 0, hi = 0, ok = true;
    for (let m = 1; m <= 12; m++) { if (!usable(y, m)) { ok = false; break; } const h = A.H[y - Y0][m - 1]; tot += h; lo += A.lo[y - Y0][m - 1] ?? h; hi += A.hi[y - Y0][m - 1] ?? h; }
    hv.push(ok ? tot : null); hlo.push(ok && y < 2012 ? lo : null); hhi.push(ok && y < 2012 ? hi : null);
  }
  const mean = (arr, a, b) => { const v = []; for (let y = a; y <= b; y++) { const x = arr[y - y0]; if (x == null) return null; v.push(x); } return v.reduce((p, q) => p + q, 0) / v.length; };
  const mB = mean(mv, 2009, 2011), mA = mean(mv, 2012, 2014), vA = mean(vv, 2012, 2014), hB = mean(hv, 2009, 2011), hA = mean(hv, 2012, 2014);
  const kp = [];
  if (mB != null && mB >= 20) {
    kp.push(`<div class="kpi bad"><div class="l">${t('stepnaive')}</div><div class="v">${ratioFmt(vA / mB)}</div><div class="d">${t('stepnaived')}</div></div>`);
    kp.push(`<div class="kpi ref"><div class="l">${t('stepmodis')}</div><div class="v">${ratioFmt(mA / mB)}</div><div class="d">${mA / mB > 0.8 && mA / mB < 1.25 ? t('stepmodisd') : t('stepmodisd2')}</div></div>`);
    kp.push(hB ? `<div class="kpi good"><div class="l">${t('stepharm')}</div><div class="v">${ratioFmt(hA / hB)}</div><div class="d">${Math.abs(Math.log((hA / hB) / (mA / mB))) < Math.log(1.25) ? t('stepharmd') : t('stepharmd2', ratioFmt(mA / mB))}</div></div>` : `<div class="kpi"><div class="l">${t('stepharm')}</div><div class="v">—</div><div class="d">${t('stepharmna')}</div></div>`);
  } else kp.push(`<p class="note warn">${t('steplow')}</p>`);
  $('step-kpis').innerHTML = kp.join('');
  $('step-note').innerHTML = (A.tier !== 'A' && !A.tdf && hv.some(v => v != null) ? `<span class="warnline">${t('stepterra')}</span><br>` : '') + t('stepnote');
  const el = $('step-chart'); el.innerHTML = ''; if (stepPlot) { stepPlot.destroy(); stepPlot = null; }
  const width = Math.min(900, el.clientWidth || 900);
  const seam = u => { const x = Math.round(u.valToPos(2011.5, 'x', true)); const c = u.ctx; c.save(); c.strokeStyle = 'rgba(255,255,255,.45)'; c.setLineDash([4, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(x, u.bbox.top); c.lineTo(x, u.bbox.top + u.bbox.height); c.stroke(); c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `${11 * devicePixelRatio}px system-ui, sans-serif`; c.fillText(t('viirsstarts') + ' →', x + 6 * devicePixelRatio, u.bbox.top + 14 * devicePixelRatio); c.restore(); };
  stepPlot = new uPlot({
    width, height: 260, cursor: { drag: { x: false } }, scales: { x: { time: false } }, hooks: { draw: [seam] },
    axes: [{ stroke: '#9aa3b5', grid: { stroke: '#2a3040' }, ticks: { stroke: '#2a3040' }, values: (u, vs) => vs.map(v => String(v)) }, { stroke: '#9aa3b5', grid: { stroke: '#2a3040' }, ticks: { stroke: '#2a3040' }, size: 64, values: (u, vs) => vs.map(v => fmt(v)) }],
    series: [
      { label: lang === 'es' ? 'año' : 'year', value: (u, v) => v == null ? '—' : String(v) },
      { label: t('harmonized'), stroke: '#f5a623', width: 2.5, points: { show: true, size: 5 }, value: (u, v) => fmt(v) },
      { label: t('rangehi'), stroke: 'rgba(245,166,35,0)', value: (u, v) => fmt(v) },
      { label: t('rangelo'), stroke: 'rgba(245,166,35,0)', value: (u, v) => fmt(v) },
      { label: 'MODIS (Terra + Aqua)', stroke: '#b0b7c6', width: 1.5, dash: [5, 3], points: { show: true, size: 4 }, value: (u, v) => fmt(v) },
      { label: 'VIIRS (S-NPP)', stroke: '#4fa3e0', width: 1.5, dash: [5, 3], points: { show: true, size: 4 }, value: (u, v) => fmt(v) },
      { label: t('spliced'), stroke: '#e5484d', width: 2, points: { show: true, size: 4 }, value: (u, v) => fmt(v) },
    ],
    bands: [{ series: [2, 3], fill: 'rgba(245,166,35,0.20)' }],
    legend: { show: false },
  }, [xs, hv, hhi, hlo, mv, vv, sp], el);
  applyStepShow();
}


// ---------- validation card (canonical numbers from README / data/validation) ----------
function renderValid() {
  const es = lang === 'es';
  const nb = x => x.replace(/ %/g, '\u00a0%'); // number and % never split across lines
  const k = (v, l, d) => `<div class="kpi"><div class="l">${t(l)}</div><div class="v">${nb(v)}</div><div class="d">${nb(t(d))}</div></div>`;
  $('valid-kpis').innerHTML = [k(es ? '+4,4 % · +2,4 %' : '+4.4 % · +2.4 %', 'v1l', 'v1d'), k(es ? '3,2 % · 9,8 %' : '3.2 % · 9.8 %', 'v2l', 'v2d'), k('80 % · 77 %', 'v3l', 'v3d'), k(es ? '0,98' : '0.98', 'v4l', 'v4d')].join('');
}

// ---------- known fire seasons (permalinks; the figure is computed live with the app's own rules) ----------
const CASES = [
  { id: 'corrientes-2022', en: 'Corrientes', es: 'Corrientes', prov: 'Corrientes', y: 2022, m: [1, 2] },
  { id: 'cordoba-2020', en: 'Córdoba', es: 'Córdoba', prov: 'Córdoba', y: 2020, m: [8, 9, 10] },
  { id: 'delta-2020', en: 'Paraná Delta', es: 'Delta del Paraná', bbox: [-34.0, -60.75, -32.5, -58.5], y: 2020, m: [6, 7, 8, 9] },
  { id: 'comarca-2021', en: 'Andean Patagonia (El Hoyo – Epuyén)', es: 'Comarca Andina (El Hoyo – Epuyén)', bbox: [-42.5, -71.75, -41.75, -71.25], y: 2021, m: [1, 2, 3] },
  { id: 'cholila-2015', en: 'Cholila – Los Alerces', es: 'Cholila – Los Alerces', bbox: [-43.0, -72.0, -42.25, -71.25], y: 2015, m: [1, 2, 3] },
];
let activeCase = null;
function renderCaseBtns() { $('case-btns').innerHTML = CASES.map(c => `<button type="button" class="pill${activeCase === c.id ? ' on' : ''}" data-case="${c.id}">${c[lang]} ${c.y}</button>`).join(''); $('case-btns').querySelectorAll('button').forEach(b => b.addEventListener('click', () => goCase(b.dataset.case))); }
function goCase(id) {
  const c = CASES.find(x => x.id === id); if (!c) return;
  if (c.prov) { $('prov').value = c.prov; selectProvince(c.prov); }
  else { if (drawn) drawn.clearLayers(); const r = L.rectangle([[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]]], DRAW_STYLE); drawn.addLayer(r); selectLayer(r); map.fitBounds(r.getBounds(), { padding: [20, 20], animate: false }); }
  activeCase = id; history.replaceState(null, '', '#' + encodeSel(A.sel)); renderCase();
}
function renderCase() {
  renderCaseBtns(); requestAnimationFrame(() => { const e = $('case-line'); if (e) e.title = e.textContent; }); const el = $('case-line'); const c = CASES.find(x => x.id === activeCase); if (!c || !A) { el.hidden = true; return; }
  const mn = c.m.length > 1 ? `${t('months')[c.m[0] - 1]}–${t('months')[c.m[c.m.length - 1] - 1]}` : t('months')[c.m[0] - 1];
  const sum = y => c.m.reduce((a, m) => a + A.H[y - Y0][m - 1], 0);
  const ys = baselineYears().filter(y => c.m.every(m => usable(y, m)));
  const v = sum(c.y), hist = ys.filter(y => y !== c.y).map(sum), med = median(hist);
  el.hidden = false;
  if (med == null) { el.hidden = true; return; }
  const rank = ys.map(sum).filter(x => x > v).length + 1;
  if (med < 10) { el.innerHTML = t('caselow', c[lang], mn, c.y, fmt(v), fmt(med), rank, ys.length); return; }
  el.innerHTML = t('caseline', c[lang], mn, c.y, (v / med).toFixed(1).replace('.', lang === 'es' ? ',' : '.') + '×', rank, ys.length, ys[0], ys[ys.length - 1]);
}

// ---------- hotspots on the map: cells coloured by the harmonized count in the selected range ----------
let fireLayer = null;
const FIRE = [[60, 20, 10], [140, 30, 10], [215, 70, 15], [245, 140, 30], [255, 220, 90]];
const fireCol = x => { x = Math.max(0, Math.min(1, x)); const i = Math.min(FIRE.length - 2, Math.floor(x * (FIRE.length - 1))), f = x * (FIRE.length - 1) - i; const c = FIRE[i].map((v, k) => Math.round(v + (FIRE[i + 1][k] - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`; };
function renderFireMap() {
  if (!map) return; const on = fireLayer && map.hasLayer(fireLayer); if (fireLayer) fireLayer.clearLayers(); else fireLayer = L.layerGroup();
  const tot = {}; let max = 0;
  const only = A && A.sel.kind !== 'country' ? new Set(A.sel.cells.map(String)) : null; // the selected area only, coloured on its own scale
  for (const [id, c] of Object.entries(D.cells)) {
    if (only && !only.has(id)) continue;
    let v = 0; for (let y = Math.max(range.from[0], 2000); y <= Math.min(range.to[0], 2025); y++) { const hy = c.h[y - Y0]; for (let m = 1; m <= 12; m++) if (hy[m - 1] > 0 && inRange(y, m)) v += hy[m - 1]; }
    if (L26 && range.to[0] >= YCUR) { const lc = L26.cells[id]; if (lc) for (let m = 1; m <= 12; m++) if (lc.h[m - 1] > 0 && inRange(YCUR, m)) v += lc.h[m - 1]; }
    if (v > 0) { tot[id] = v; if (v > max) max = v; }
  }
  // colour by percentile among the cells shown (full contrast in a province as in the whole country), Fire ramp
  const sorted = Object.values(tot).sort((a, b) => a - b); const pr = v => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; } return sorted.length > 1 ? (lo - 1) / (sorted.length - 1) : 1; };
  const r0 = rampName; rampName = 'fire';
  for (const [id, v] of Object.entries(tot)) { const x = pr(v); if (!only && x < 0.15) continue; const [a, c, b, d] = cellBounds(+id); fireLayer.addLayer(L.rectangle([[a, c], [b, d]], { stroke: false, fillColor: ramp(0.12 + 0.88 * x).css, fillOpacity: 0.3 + 0.5 * x, interactive: false })); }
  rampName = r0;
  if (on || fireLayer._first !== false) { fireLayer.addTo(map); fireLayer._first = false; }
}


// ---------- summary strip: critical months, typical year, worst year, calibration skill ----------
const pctFmt = x => (100 * x).toFixed(1).replace('.', lang === 'es' ? ',' : '.') + ' %';
function renderKpis() {
  const ys = baselineYears(); const out = [];
  const meds = []; for (let m = 1; m <= 12; m++) meds.push(median(ys.filter(y => usable(y, m)).map(y => A.H[y - Y0][m - 1])) || 0);
  const tot = meds.reduce((a, b) => a + b, 0);
  if (tot >= 12) { // too few hotspots in a typical year: no 'critical months' (one stray month would read as 100 %)
    const order = meds.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const pick = new Set(); let acc = 0;
    for (const [v, i] of order) { if (acc >= 0.8 * tot) break; pick.add(i); acc += v; }
    // consecutive runs (circular: Dec–Jan joins)
    const runs = []; let start = null; for (let k = 0; k < 12; k++) { if (pick.has(k) && start == null) start = k; if (!pick.has(k) && start != null) { runs.push([start, k - 1]); start = null; } } if (start != null) runs.push([start, 11]);
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === 11) { const last = runs.pop(); runs[0] = [last[0], runs[0][1]]; }
    const M = t('months'); const label = runs.map(([a, b]) => a === b ? M[a] : `${M[a]}–${M[b]}`).join(' · ');
    out.push(`<div class="kpi"><div class="l">${t('kcrit')}</div><div class="v">${label}</div><div class="d">${t('kcritd', Math.round(100 * acc / tot), M[order[0][1]])}</div></div>`);
  }
  const yrs = annualTotals().filter(d => d.complete && d.y !== 2000 && ys.includes(d.y));
  if (yrs.length >= 3) {
    const medY = median(yrs.map(d => d.tot)); let ranked = yrs; if (A.tier === 'D' && showPre) ranked = yrs.filter(d => d.y >= 2012);
    const w = ranked.reduce((a, b) => b.tot > a.tot ? b : a, ranked[0]);
    out.push(`<div class="kpi"><div class="l">${t('kmean')}</div><div class="v">${fmt(medY)} <span class="u">${lang === 'es' ? 'focos' : 'hotspots'}</span></div><div class="d">${t('kmeand', yrs[0].y, yrs[yrs.length - 1].y)}</div></div>`);
    out.push(`<div class="kpi"><div class="l">${t('kworst')}</div><div class="v">${w.y}</div><div class="d">${t('kworstd', fmt(w.tot), medY > 0 ? (w.tot / medY).toFixed(1).replace('.', lang === 'es' ? ',' : '.') + '×' : '—')}</div></div>`);
  }
  if (SKILL) {
    const s = A.sel; let v = null, d = '';
    if (s.kind === 'country') { v = SKILL.country; d = t('kskilld', pctFmt(SKILL.country_scalar)); }
    else if (s.kind === 'province' && SKILL.prov[s.label]) { v = SKILL.prov[s.label].mape; d = t('kskillsz', A.n).replace(/~\d+ (cells|celdas)/, s.label); d = lang === 'es' ? `error de temporada fuera de muestra en ${s.label} (dejando un año afuera, 2012–23)` : `fire-season error out of sample in ${s.label} (leave-one-year-out 2012–23)`; }
    else { const c = SKILL.curve.filter(c => c.n <= Math.max(1, A.n)).pop() || SKILL.curve[0]; v = c.mape; d = t('kskillsz', c.n); }
    if (v != null) out.push(`<div class="kpi"><div class="l">${t('kskill')}</div><div class="v">± ${pctFmt(v)}</div><div class="d">${d}</div></div>`);
  }
  $('sum-kpis').innerHTML = out.join('');
}

// ---------- fire movie: 26 years on a dark basemap, high contrast (player bar under the map) ----------
let pulseTimer = null, movie = null; // movie = { frames, labels, rects, k, mode }
const MOVIE_STEP = { year: 650, month: 110 };
function movieFrames(mode) {
  const ids = A && A.sel.kind !== 'country' ? A.sel.cells.map(String) : Object.keys(D.cells);
  const labels = [], cols = [];
  if (mode === 'year') { for (let y = 2001; y <= 2025; y++) labels.push(String(y)); if (L26) labels.push(`${YCUR}*`); }
  else { for (let y = 2000; y <= 2025; y++) for (let m = 1; m <= 12; m++) if (y > 2000 || m >= 11) labels.push(`${t('months')[m - 1]} ${y}`); if (L26) L26.months.forEach(M => { if (M.days) labels.push(`${t('months')[M.m - 1]} ${YCUR}*`); }); }
  const vals = {}; const all = [];
  for (const id of ids) {
    const c = D.cells[id]; if (!c) continue; const a = []; const lc = L26?.cells[id];
    if (mode === 'year') { for (let y = 2001; y <= 2025; y++) a.push(c.h[y - Y0].reduce((p, q) => p + (q > 0 ? q : 0), 0)); if (L26) a.push(lc ? lc.h.reduce((p, q) => p + (q > 0 ? q : 0), 0) : 0); }
    else { for (let y = 2000; y <= 2025; y++) for (let m = 1; m <= 12; m++) if (y > 2000 || m >= 11) a.push(Math.max(0, c.h[y - Y0][m - 1])); if (L26) L26.months.forEach(M => { if (M.days) a.push(lc && lc.h[M.m - 1] > 0 ? lc.h[M.m - 1] : 0); }); }
    vals[id] = a; for (const v of a) if (v > 0) all.push(v);
  }
  all.sort((x, y) => x - y); const top = all.length ? all[Math.floor(0.99 * (all.length - 1))] : 1; // one fixed scale for the whole film (99th percentile)
  return { ids: Object.keys(vals), vals, labels, lm: Math.log1p(Math.max(1, top)), top };
}
let darkBase = null;
function movieOn() {
  if (!darkBase) { const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/'; darkBase = L.layerGroup([L.tileLayer(esri + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, attribution: '© Esri, HERE, Garmin · NASA FIRMS' }), L.tileLayer(esri + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, pane: 'shadowPane' })]); }
  darkBase.addTo(map); if (fireLayer) fireLayer.remove(); if (gridLayer) gridLayer.remove(); if (cellsLayer) cellsLayer.remove();
  const F = movieFrames(movie.mode); movie.F = F; movie.layer = L.layerGroup().addTo(map); movie.rects = {};
  for (const id of F.ids) { const [a, c, b, d] = cellBounds(+id); movie.rects[id] = L.rectangle([[a, c], [b, d]], { stroke: false, fillColor: '#000', fillOpacity: 0, interactive: false }).addTo(movie.layer); }
  const sc = $('mv-scrub'); sc.max = F.labels.length - 1; $('mv-top').textContent = fmt(F.top) + (movie.mode === 'year' ? (lang === 'es' ? ' focos/año' : ' /yr') : (lang === 'es' ? ' focos/mes' : ' /mo'));
}
function movieOff() { if (!movie) return; if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; } movie.layer?.remove(); darkBase?.remove(); movie = null; if (cellsLayer && !map.hasLayer(cellsLayer)) cellsLayer.addTo(map); $('mv-play').textContent = '▶'; $('mv-label').textContent = ''; $('mv-bar').classList.remove('playing'); renderFireMap(); if (gridLayer && map.getZoom() >= GRID_MIN_ZOOM) gridLayer.addTo(map); }
function movieShow(k) {
  const F = movie.F; movie.k = k; const r0 = rampName; rampName = 'fire';
  for (const id of F.ids) { const v = F.vals[id][k]; const R = movie.rects[id]; if (!v) { R.setStyle({ fillOpacity: 0 }); continue; } const x = Math.min(1, Math.log1p(v) / F.lm); R.setStyle({ fillColor: ramp(0.08 + 0.92 * x).css, fillOpacity: 0.35 + 0.6 * x }); }
  rampName = r0; $('mv-label').textContent = F.labels[k]; $('mv-scrub').value = k;
}
function moviePlay() {
  if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; $('mv-play').textContent = '▶'; $('mv-bar').classList.remove('playing'); return; }
  if (!movie) { movie = { mode: $('mv-bar').dataset.mode || 'year', k: 0 }; movieOn(); }
  if (movie.k >= movie.F.labels.length - 1) movie.k = 0;
  $('mv-play').textContent = '❚❚'; $('mv-bar').classList.add('playing');
  movieShow(movie.k);
  pulseTimer = setInterval(() => { if (movie.k >= movie.F.labels.length - 1) { clearInterval(pulseTimer); pulseTimer = null; $('mv-play').textContent = '▶'; $('mv-bar').classList.remove('playing'); return; } movieShow(movie.k + 1); }, MOVIE_STEP[movie.mode]);
}
function buildMovieBar() {
  const bar = document.createElement('div'); bar.id = 'mv-bar'; bar.className = 'mv-bar'; bar.dataset.mode = 'year';
  bar.innerHTML = `<button id="mv-play" type="button" class="mv-play" aria-label="Play">▶</button><div class="mv-mid"><div class="mv-title"><b>${t('pulseTitle')} 2000 → ${YCUR}</b><span class="mv-modes"><button type="button" data-mv="year" class="on">${lang === 'es' ? 'Años' : 'Years'}</button><button type="button" data-mv="month">${lang === 'es' ? 'Meses' : 'Months'}</button></span><span id="mv-label" class="mv-label"></span><button id="mv-close" type="button" class="mv-x" title="Close" aria-label="Close">✕</button></div><input id="mv-scrub" type="range" min="0" max="25" value="0" aria-label="Frame"><div class="mv-scale"><span>0</span><i></i><span id="mv-top"></span></div></div>`;
  document.getElementById('map').appendChild(bar); L.DomEvent.disableClickPropagation(bar); L.DomEvent.disableScrollPropagation(bar);
  $('mv-play').addEventListener('click', moviePlay);
  $('mv-close').addEventListener('click', movieOff);
  $('mv-scrub').addEventListener('input', e => { if (!movie) { movie = { mode: bar.dataset.mode, k: 0 }; movieOn(); } if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; $('mv-play').textContent = '▶'; bar.classList.remove('playing'); } movieShow(+e.target.value); });
  bar.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => { bar.dataset.mode = b.dataset.mv; bar.querySelectorAll('[data-mv]').forEach(x => x.classList.toggle('on', x === b)); const was = !!pulseTimer; movieOff(); if (was) moviePlay(); }));
}
const startPulse = moviePlay, stopPulse = movieOff;

// ---------- calendar heatmap ----------
let calCells = []; // for hit testing
function calendarRows() {
  const rows = []; for (let y = Math.max(range.from[0], 2000); y <= Math.min(range.to[0], 2026); y++) rows.push(y); return rows;
}
function cellValue(y, m) { // y calendar, m 1-based → { v, kind, lo, hi, flags }
  if (y === YCUR) { const M = A.cur?.months[m - 1]; if (!M || !M.days) return { v: null, kind: 'nodata' }; return { v: M.h, kind: 'prelim', partial: M.partial, through: M.through, complete: M.days >= daysInMonth(YCUR, m) }; }
  const yi = y - Y0; if (!A.has[yi][m - 1]) return { v: null, kind: 'nodata' };
  const v = A.H[yi][m - 1];
  // R10: a VIIRS-era month mostly filled from MODIS (January 2012) is labelled reconstructed; the gap share is capped at 100 %
  const reconShare = v > 0 ? A.recon[yi][m - 1] / v : 0;
  const o = { v, kind: y >= 2012 && reconShare <= 0.5 ? 'obs' : terraOnly(y, m) ? 'terra' : 'recon', lo: A.lo[yi][m - 1], hi: A.hi[yi][m - 1], cloud: A.cloudFlag[yi][m - 1], gap: v > 0 ? Math.min(1, A.gap[yi][m - 1] / v) : 0, grey: !usable(y, m) };
  return o;
}
function renderCalendar() {
  const cv = $('cal'), ctx = cv.getContext('2d'); const rows = calendarRows();
  const W = 900, left = 50, top = 24, totW = 96, cw = (W - left - totW - 8) / 12, ch = 22; const Hh = top + (rows.length + 1) * ch + 14;
  cv.width = W; cv.height = Hh; ctx.clearRect(0, 0, W, Hh);
  ctx.fillStyle = '#1e2230'; ctx.fillRect(0, 0, W, Hh);
  let max = 0; const vals = []; for (const y of rows) for (let m = 1; m <= 12; m++) { if (!inRange(y, m)) continue; const c = cellValue(y, m); if (c.v != null && !c.grey) { max = Math.max(max, c.v); vals.push(c.v); } }
  // colour by percentile of the months shown (full contrast at any scale); zero is always the bottom colour
  vals.sort((a, b) => a - b);
  const scale = v => { if (v <= 0 || vals.length < 2) return 0; let lo = 0, hi = vals.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (vals[mid] <= v) lo = mid + 1; else hi = mid; } return (lo - 1) / (vals.length - 1); };
  const ysB = baselineYears(); const monMed = []; for (let m = 1; m <= 12; m++) monMed.push(median(ysB.filter(y => usable(y, m)).map(y => A.H[y - Y0][m - 1])));
  // annual totals of the shown range (usable months; current year = preliminary sum)
  const tot = {}; let tmax = 1;
  for (const y of rows) { let v = 0, n = 0; for (let m = 1; m <= 12; m++) { if (!inRange(y, m)) continue; const c = cellValue(y, m); if (c.v != null && !c.grey && c.kind !== 'nodata') { v += c.v; n++; } } if (n) { tot[y] = v; if (y !== 2000) tmax = Math.max(tmax, v); } }
  ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'center';
  for (let m = 0; m < 12; m++) ctx.fillText(t('months')[m], left + m * cw + cw / 2, 12);
  const tx = left + 12 * cw + 8; ctx.textAlign = 'left'; ctx.fillText(lang === 'es' ? 'Total año' : 'Year total', tx, 12);
  calCells = [];
  const cellText = (txt, x, yy, fill) => { if (!txt) return; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = fill; ctx.fillText(txt, x + cw / 2, yy + ch / 2 + 0.5); };
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r]; const yy = top + r * ch;
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'right'; ctx.fillText(String(y), left - 8, yy + ch / 2);
    for (let m = 1; m <= 12; m++) {
      const x = left + (m - 1) * cw; const c = cellValue(y, m); const inR = inRange(y, m);
      let fill = '#2a3040', txtCol = '#e8eaf0', txt = '';
      if (!inR || c.kind === 'nodata') fill = '#262a36';
      else if (c.grey) { fill = '#3a3f4e'; txt = c.v ? kfmt(c.v) : ''; txtCol = '#7d8496'; }
      else if (c.v != null && calMode === 'anom') { const md = monMed[m - 1]; if (md == null || md < 3) { fill = '#2e3240'; txt = '·'; txtCol = '#7d8496'; } else { const r = c.v / md; const k = divRamp(0.5 + Math.max(-1, Math.min(1, Math.log2(Math.max(r, 1e-3)) / 2)) / 2); fill = k.css; txtCol = k.lum > 0.55 ? '#14161c' : '#ffffff'; txt = (r >= 10 ? r.toFixed(0) : r.toFixed(1)).replace('.', lang === 'es' ? ',' : '.') + '×'; } }
      else if (c.v != null) { const k = ramp(scale(c.v)); fill = k.css; txtCol = k.lum > 0.55 ? '#14161c' : '#ffffff'; txt = kfmt(c.v); }
      ctx.fillStyle = fill; ctx.fillRect(x + 1, yy + 1, cw - 2, ch - 2);
      if (inR && c.kind === 'terra' && !c.grey) { ctx.save(); ctx.beginPath(); ctx.rect(x + 1, yy + 1, cw - 2, ch - 2); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; for (let k = -ch; k < cw; k += 6) { ctx.beginPath(); ctx.moveTo(x + k, yy + ch); ctx.lineTo(x + k + ch, yy); ctx.stroke(); } ctx.restore(); }
      if (inR && c.kind === 'prelim') { ctx.strokeStyle = '#ffffff'; ctx.setLineDash([3, 2]); ctx.strokeRect(x + 1.5, yy + 1.5, cw - 3, ch - 3); ctx.setLineDash([]); }
      if (inR) cellText(txt + (c.kind === 'prelim' && !c.complete && txt ? '*' : ''), x, yy, txtCol);
      if (inR && c.v != null && !c.grey && c.kind !== 'prelim' && c.kind !== 'nodata') {
        if (c.cloud) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + cw - 2, yy + 2); ctx.lineTo(x + cw - 8, yy + 2); ctx.lineTo(x + cw - 2, yy + 8); ctx.fill(); }
        if (c.gap > 0.10 || (y >= 2012 && c.gap > 0)) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + 3, yy + ch - 6); ctx.lineTo(x + 6, yy + ch - 9); ctx.lineTo(x + 9, yy + ch - 6); ctx.lineTo(x + 6, yy + ch - 3); ctx.closePath(); ctx.fill(); }
      }
      calCells.push({ x: x + 1, y: yy + 1, w: cw - 2, h: ch - 2, year: y, month: m, c, inR });
    }
    // year total: bar + value
    if (tot[y] != null) { const bw = (totW - 44) * Math.min(1, tot[y] / tmax); ctx.fillStyle = y === YCUR ? 'rgba(255,255,255,.35)' : ramp(0.55 + 0.45 * tot[y] / tmax).css; ctx.fillRect(tx, yy + 6, Math.max(2, bw), ch - 12); ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#c9cfdb'; ctx.textAlign = 'left'; ctx.fillText(kfmt(tot[y]) + (y === YCUR ? '*' : ''), tx + Math.max(2, bw) + 4, yy + ch / 2); }
  }
  // median row (baseline years, usable months)
  const yy = top + rows.length * ch + 6; const ys = baselineYears();
  ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'right'; ctx.fillText(lang === 'es' ? 'Mediana' : 'Median', left - 6, yy + ch / 2);
  for (let m = 1; m <= 12; m++) { const med = median(ys.filter(y => usable(y, m)).map(y => A.H[y - Y0][m - 1])); if (med == null) continue; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#c9cfdb'; ctx.fillText(kfmt(med), left + (m - 1) * cw + cw / 2, yy + ch / 2); }
  ctx.strokeStyle = '#2a3040'; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(left + 12 * cw, yy); ctx.stroke();
  // legend
  const lg = $('legend'); lg.innerHTML = '';
  const lc = document.createElement('canvas'); lc.width = 160; lc.height = 10; const g = lc.getContext('2d'); for (let i = 0; i < 160; i++) { g.fillStyle = calMode === 'anom' ? divRamp(i / 159).css : ramp(i / 159).css; g.fillRect(i, 0, 1, 10); }
  if (calMode === 'anom') lg.append(Object.assign(document.createElement('span'), { textContent: '0,25×' }), lc, Object.assign(document.createElement('span'), { textContent: '4× · ' + t('anomlegend', ysB[0], ysB[ysB.length - 1]) }));
  else lg.append(Object.assign(document.createElement('span'), { textContent: t('legendlow') }), lc, Object.assign(document.createElement('span'), { textContent: `${t('legendhigh')} (${fmt(max)})` }));
  const sw = (color, label, dashed) => { const s = document.createElement('span'); s.innerHTML = `<i style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;vertical-align:-2px;margin-right:4px;${dashed ? 'border:1px dashed #fff;background:transparent;' : ''}"></i>${label}`; return s; };
  lg.append(sw('#3a3f4e', t('legendgrey')), sw('#262a36', t('legendnd')), sw('', t('prelim') + ' (*)', true), Object.assign(document.createElement('span'), { textContent: '◤ ' + t('cloud').split(':')[0] }), Object.assign(document.createElement('span'), { textContent: '◆ ' + t('gap', '').replace(' ()', '') }), Object.assign(document.createElement('span'), { textContent: `${lang === 'es' ? 'Mediana' : 'Median'}: ${ys.length ? ys[0] + '–' + ys[ys.length - 1] : '—'}` }));
}
function calTip(ev) {
  const cv = $('cal'); const rect = cv.getBoundingClientRect(); const sx = cv.width / rect.width, sy = cv.height / rect.height;
  const px = (ev.clientX - rect.left) * sx, py = (ev.clientY - rect.top) * sy;
  const hit = calCells.find(k => px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h);
  const tip = $('tip'); if (!hit || !hit.inR) { tip.hidden = true; return; }
  const c = hit.c; const lines = [`<b>${t('months')[hit.month - 1]} ${hit.year}</b>`];
  if (c.kind === 'nodata') lines.push(t('nodata'));
  else if (c.kind === 'prelim') { lines.push(`${fmt(c.v)} ${t('hotspots')} (${t('snppeq')})`, t(c.complete ? 'prelimfull' : 'prelim') + (c.through ? ` · ${t('through')} ${c.through}` : ''), c.partial ? '⚠ ' + t('partial') : ''); }
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
    else { h.push(c.v); lo.push(c.lo ?? null); hi.push(c.hi ?? null); cur.push(null); } // observed months carry no range (R3)
  }
  const el = $('series'); el.innerHTML = ''; if (uplot) { uplot.destroy(); uplot = null; }
  const width = Math.min(900, el.clientWidth || 900);
  uplot = new uPlot({
    width, height: 240, cursor: { drag: { x: false } }, scales: { x: { time: true } },
    axes: [{ stroke: '#9aa3b5', grid: { stroke: '#2a3040' }, ticks: { stroke: '#2a3040' } }, { stroke: '#9aa3b5', grid: { stroke: '#2a3040' }, ticks: { stroke: '#2a3040' }, size: 60, values: (u, vs) => vs.map(v => fmt(v)) }],
    series: [
      { label: lang === 'es' ? 'mes' : 'month', value: (u, v) => v == null ? '—' : new Date(v * 1000).toISOString().slice(0, 7) },
      { label: t('hotspots'), stroke: '#f5a623', width: 1.5, value: (u, v) => fmt(v), spanGaps: false },
      { label: t('rangehi'), stroke: 'rgba(245,166,35,0)', fill: 'rgba(245,166,35,0.18)', value: (u, v) => fmt(v), spanGaps: false },
      { label: t('rangelo'), stroke: 'rgba(245,166,35,0)', value: (u, v) => fmt(v), spanGaps: false },
      { label: String(YCUR), stroke: '#4fc3f7', width: 2, dash: [4, 3], points: { show: true, size: 6 }, value: (u, v) => fmt(v) },
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
  if (cur != null) { const hgt = (Hh - bottom - 10) * cur / max; const x = left + data.length * bw; ctx.setLineDash([3, 2]); ctx.strokeStyle = '#4fc3f7'; ctx.strokeRect(x + 1.5, Hh - bottom - hgt, bw - 3, hgt); ctx.setLineDash([]); ctx.fillStyle = '#4fc3f7'; ctx.fillText(String(YCUR), x + bw / 2, Hh - bottom + 4); }
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
    if (curM[m] != null) { const yc = Hh - bottom - (Hh - bottom - 10) * curM[m] / max; ctx.fillStyle = '#4fc3f7'; ctx.beginPath(); ctx.arc(x + bw / 2, yc, 4, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(t('months')[m], x + bw / 2, Hh - bottom + 4);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(max), left - 4, 12); ctx.fillText('0', left - 4, Hh - bottom);
  $('season-note').textContent = ys.length ? t('seasonnote', ys[0], ys[ys.length - 1]) + (A.cur ? ` ● ${YCUR}` : '') : '';
}

// ---------- where it burns: share by province (selections spanning 2+ provinces) ----------
function renderWhere() {
  const card = $('where-card'); const provs = Object.keys(A.provHY); if (provs.length < 2) { card.hidden = true; return; } card.hidden = false;
  const tot = {}; let T = 0; for (const p of provs) { let v = 0; for (let y = Math.max(A.fromYear, range.from[0]); y <= Math.min(2025, range.to[0]); y++) for (let m = 1; m <= 12; m++) if (inRange(y, m) && usable(y, m)) v += A.provHY[p][y - Y0][m - 1]; tot[p] = v; T += v; }
  const cur = {}; let TC = 0; if (A.cur) for (const p of provs) { const a = A.provCur[p]; const v = a ? a.reduce((x, y, i) => x + (A.cur.months[i].days ? y : 0), 0) : 0; cur[p] = v; TC += v; }
  const rows = provs.map(p => ({ p, share: T ? tot[p] / T : 0, cshare: TC ? cur[p] / TC : 0, tot: tot[p] })).sort((a, b) => b.share - a.share).slice(0, 10);
  const cv = $('where'), ctx = cv.getContext('2d'); const W = cv.width, rowH = 24, left = 150, Hh = rows.length * rowH + 30; cv.height = Hh; ctx.clearRect(0, 0, W, Hh); ctx.fillStyle = '#1e2230'; ctx.fillRect(0, 0, W, Hh);
  const max = Math.max(0.01, ...rows.map(r => Math.max(r.share, r.cshare))); const bw = W - left - 120; ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  rows.forEach((r, i) => { const y = 8 + i * rowH; ctx.fillStyle = '#e8eaf0'; ctx.textAlign = 'right'; ctx.fillText(r.p === TDF ? 'Tierra del Fuego' : r.p, left - 8, y + 10); ctx.fillStyle = '#f5a623'; ctx.fillRect(left, y + 2, bw * r.share / max, 9); if (A.cur) { ctx.fillStyle = '#4fc3f7'; ctx.fillRect(left, y + 12, bw * r.cshare / max, 6); } ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'left'; ctx.fillText(`${(100 * r.share).toFixed(1)} %${A.cur ? ` · ${(100 * r.cshare).toFixed(0)} %` : ''}`, left + bw * Math.max(r.share, r.cshare) / max + 6, y + 10); });
  ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'left'; ctx.fillText(lang === 'es' ? `naranja: participación ${Math.max(A.fromYear, range.from[0])}–${Math.min(2025, range.to[0])} · celeste: ${YCUR} a la fecha` : `orange: share ${Math.max(A.fromYear, range.from[0])}–${Math.min(2025, range.to[0])} · blue: ${YCUR} to date`, left, Hh - 10);
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
const csvField = s => { s = String(s ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = a => a.map(csvField).join(',');
function downloadCSV() {
  const ys = baselineYears(); const base = ys.length ? `${ys[0]}–${ys[ys.length - 1]}` : '—';
  const rows = [`# ${t('csvhdr')}`, `# unit: VIIRS-equivalent 375 m pixel counts (vegetation class; static sources in a separate column, VIIRS units from 2012) · area: ${A.sel.kind} ${A.sel.label || ''} · ${A.n} cells · tier ${A.tier} · region ${A.region} · dominant province ${A.dominant} · baseline ${base} (years with usable months) · factor_source ${A.borrowed ? 'assigned (borrowed from the region)' : 'estimated'} · generated ${new Date().toISOString()}`,
    `# rows: the full record Nov 2000 → today regardless of the date range shown on screen; in_statistics = 1 marks the months that enter medians and rankings · decimal point, comma separator`,
    'year,month,H,H_lo,H_hi,sensor,tier,baseline_from,in_statistics,reconstructed_share,gap_fill_share,cloud_flag,static_viirs,factor_source,note'];
  for (let y = 2000; y <= 2025; y++) for (let m = 1; m <= 12; m++) {
    const yi = y - Y0; if (!A.has[yi][m - 1]) continue; const v = A.H[yi][m - 1];
    const rs = v > 0 ? A.recon[yi][m - 1] / v : (y < 2012 ? 1 : 0), gs = v > 0 ? Math.min(1, A.gap[yi][m - 1] / v) : 0;
    const sensor = y >= 2012 ? (rs > 0.5 ? 'MODIS->VIIRS-eq (gap fill)' : 'VIIRS') : terraOnly(y, m) ? 'MODIS-Terra->VIIRS-eq' : 'MODIS->VIIRS-eq';
    const lo = A.lo[yi][m - 1], hi = A.hi[yi][m - 1];
    const note = y < 2012 && v === 0 && (A.tier === 'C' || A.tier === 'D') ? 'no MODIS detection' : y === 2002 ? 'mixed Terra-only / Terra+Aqua year' : y === 2000 ? 'two months only' : '';
    rows.push(csvRow([y, m, v.toFixed(1), lo == null ? '' : lo.toFixed(1), hi == null ? '' : hi.toFixed(1), sensor, A.tier, A.baselineFrom, usable(y, m) ? 1 : 0, rs.toFixed(2), gs.toFixed(2), A.cloudFlag[yi][m - 1] ? 1 : 0, y >= 2012 ? A.st[yi][m - 1] : '', A.borrowed ? 'assigned' : 'estimated', note]));
  }
  if (A.cur) for (const M of A.cur.months) if (M.days) { const complete = M.days >= daysInMonth(A.cur.year, M.m); rows.push(csvRow([A.cur.year, M.m, M.h.toFixed(1), '', '', `VIIRS NRT S-NPP-eq (NOAA-20/${A.cur.bridge['NOAA-20']}, NOAA-21/${A.cur.bridge['NOAA-21']})`, A.tier, A.baselineFrom, 0, 0, '', '', M.st.toFixed(1), '', `preliminary, ${complete ? 'complete month' : `month to date through ${M.through}`}; days with 3/2/1/0 satellites ${M.d3}/${M.d2}/${M.d1}/${M.d0}`])); }
  save(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `geofuego-harmonized_${slug()}.csv`);
}
function downloadPNG() {
  const cal = $('cal'); const W = cal.width, pad = 16, titleH = 56, footH = 44; const out = document.createElement('canvas'); out.width = W + 2 * pad; out.height = cal.height + titleH + footH + 2 * pad;
  const g = out.getContext('2d'); g.fillStyle = '#0f1115'; g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = '#e8eaf0'; g.font = 'bold 18px system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText(`${$('aoi-title').textContent} — ${t('caltitle')}`, pad, pad);
  g.font = '12px system-ui, sans-serif'; g.fillStyle = '#9aa3b5'; g.fillText($('aoi-sub').textContent, pad, pad + 26);
  g.drawImage(cal, pad, pad + titleH);
  g.fillStyle = '#9aa3b5'; g.font = '11px system-ui, sans-serif';
  g.fillText(t('unit').split(/\. /)[0] + '. ' + t('unit').split(/\. /)[1] + '.', pad, pad + titleH + cal.height + 8); g.fillText('GeoFuego Harmonization · NASA FIRMS (MODIS, VIIRS) · spaceapps.geofuego.com.ar · CC BY 4.0', pad, pad + titleH + cal.height + 24);
  // synchronous blob (toDataURL), so the save dialog / download still runs inside the click's user activation
  const bin = atob(out.toDataURL('image/png').split(',')[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  save(new Blob([u8], { type: 'image/png' }), `geofuego-calendar_${slug()}.png`);
}
const slug = () => (A.sel.label || A.sel.kind || 'aoi').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
async function save(blob, name) {
  // Chrome/Edge: native save dialog (File System Access API); elsewhere, or if it fails, a classic download link
  if (window.showSaveFilePicker) { try { const ext = name.slice(name.lastIndexOf('.')); const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext === '.csv' ? 'CSV' : 'PNG image', accept: ext === '.csv' ? { 'text/csv': ['.csv'] } : { 'image/png': ['.png'] } }] }); const w = await fh.createWritable(); await w.write(blob); await w.close(); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ---------- map & selection ----------
let map, drawn, cellsLayer, provLayers = {}, gridLayer = null, gridRects = {}, picked = new Set(), lastDrawTs = 0;
const drawing = () => Date.now() - lastDrawTs < 500 || !!document.querySelector('.leaflet-draw-toolbar .leaflet-draw-toolbar-button-enabled');
const GRID_MIN_ZOOM = 6;
const CELL_STYLE = { color: '#ffffff', opacity: 0.35, weight: 0.6, fill: true, fillColor: '#f5a623', fillOpacity: 0, interactive: true, bubblingMouseEvents: true };
const CELL_ON = { color: '#f5a623', opacity: 1, weight: 1.2, fillOpacity: 0.35 };
function buildGrid() {
  gridLayer = L.layerGroup();
  for (const id of Object.keys(D.cells)) { const [a, c, b, d] = cellBounds(+id); const r = L.rectangle([[a, c], [b, d]], CELL_STYLE); r.on('click', () => toggleCell(+id)); r.on('mouseover', () => { if (!picked.has(+id)) r.setStyle({ fillOpacity: 0.15 }); }); r.on('mouseout', () => { if (!picked.has(+id)) r.setStyle({ fillOpacity: 0 }); }); gridRects[id] = r; gridLayer.addLayer(r); }
  const sync = () => { const on = map.getZoom() >= GRID_MIN_ZOOM; if (on && !map.hasLayer(gridLayer)) gridLayer.addTo(map); if (!on && map.hasLayer(gridLayer)) gridLayer.remove(); };
  map.on('zoomend', sync); sync();
}
function toggleCell(id) {
  if (drawing()) return;
  if (!(A && A.sel.kind === 'cells')) { picked = new Set(); for (const r of Object.values(gridRects)) r.setStyle({ color: '#ffffff', opacity: 0.35, weight: 0.6, fillOpacity: 0 }); }
  if (picked.has(id)) { picked.delete(id); gridRects[id].setStyle({ color: '#ffffff', opacity: 0.35, weight: 0.6, fillOpacity: 0 }); } else { picked.add(id); gridRects[id].setStyle(CELL_ON); }
  if (!picked.size) { clearSelection(); return; }
  select({ kind: 'cells', label: `${t('cellsel')} (${picked.size})`, cells: [...picked] });
}
function paintPicked() { for (const r of Object.values(gridRects)) r.setStyle({ color: '#ffffff', opacity: 0.35, weight: 0.6, fillOpacity: 0 }); for (const id of picked) gridRects[id]?.setStyle(CELL_ON); }
const DRAW_STYLE = { color: '#d9480f', weight: 2, fillColor: '#f5a623', fillOpacity: 0.15 };
function highlightProvince(name) { for (const [n, l] of Object.entries(provLayers)) l.setStyle(n === name ? { color: '#f5a623', opacity: 1, weight: 3, fillOpacity: 0 } : { color: '#ffffff', opacity: 0.7, weight: 1, fillOpacity: 0 }); }
function clearSelection() { if (drawn) drawn.clearLayers(); if (cellsLayer) { cellsLayer.remove(); cellsLayer = null; } A = null; highlightProvince(null); picked = new Set(); paintPicked(); $('prov').value = ''; map.setView([-38.5, -63.5], 4); selectCountry(); }
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
  activeCase = null;
  A = aggregate(sel);
  if (cellsLayer) { cellsLayer.remove(); cellsLayer = null; }
  const feats = sel.cells.map(id => { const [a, c, b, d] = cellBounds(id); return [[a, c], [b, d]]; });
  if (sel.kind !== 'cells') { picked = new Set(); paintPicked(); cellsLayer = L.layerGroup(sel.kind === 'country' ? [] : feats.length > 1500 ? [L.rectangle(L.latLngBounds(feats.map(f => f[0]).concat(feats.map(f => f[1]))), { color: '#f5a623', weight: 1.5, fill: false, dashArray: '4 3', interactive: false })] : feats.map(f => L.rectangle(f, { color: '#f5a623', weight: 0.6, opacity: 0.6, fillOpacity: 0, interactive: false }))).addTo(map); }
  if (sel.kind !== 'drawn') { if (drawn) drawn.clearLayers(); }
  highlightProvince(sel.kind === 'province' ? sel.label : null);
  $('empty').hidden = true;
  if (sel.kind === 'point' || sel.kind === 'province' || sel.kind === 'country') { map.invalidateSize(); map.fitBounds(L.latLngBounds(feats.flat()), { paddingTopLeft: [10, 10], paddingBottomRight: [10, 104], maxZoom: sel.kind === 'point' ? 9 : 7, animate: false }); }
  location.hash = encodeSel(sel);
  if (movie) movieOff(); else renderFireMap();
  render();
}
// cell ids are encoded as sorted runs "a-b.c.d-e" (a rectangle is a handful of runs, one per grid row), never truncated
function encodeIds(ids) { const a = [...ids].sort((x, y) => x - y); const out = []; for (let i = 0; i < a.length;) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? `${a[i]}-${a[j]}` : String(a[i])); i = j + 1; } return out.join('.'); }
function decodeIds(s) { const ids = []; for (const part of s.split('.')) { if (!part) continue; const [a, b] = part.split('-').map(Number); if (!isFinite(a)) continue; if (b != null && isFinite(b)) { for (let k = a; k <= Math.min(b, a + 20000); k++) ids.push(k); } else ids.push(a); } return ids; }
function encodeSel(sel) {
  const p = [`lang=${lang}`]; if (sel.kind === 'country') p.push('aoi=ar'); else if (sel.kind === 'province') p.push('prov=' + encodeURIComponent(sel.label)); else if (sel.kind === 'point') p.push('pt=' + sel.label.replace(/\s/g, '')); else if (sel.kind === 'drawn' && sel.bbox) p.push('bbox=' + sel.bbox.map(v => v.toFixed(3)).join(',')); else if (sel.kind === 'cells') p.push('cells=' + encodeIds(sel.cells));
  if (!rangeIsDefault()) p.push(`from=${ym(range.from)}`, `to=${ym(range.to)}`);
  if (showPre) p.push('pre=1'); if (showStatic) p.push('st=1'); if (activeCase) p.push('case=' + activeCase);
  return p.join('&');
}
function readRangeFromHash(h) {
  const parse = s => { const [y, m] = (s || '').split('-').map(Number); return y && m ? [y, m] : null; };
  const f = parse(h.get('from')), to = parse(h.get('to'));
  if (f || to) { range = { from: f || RANGE_DEFAULT[0], to: to || RANGE_DEFAULT[1] }; normalizeRange(); $('from').value = ym(range.from); $('to').value = ym(range.to); }
  showPre = h.get('pre') === '1'; $('tog-pre').checked = showPre; showStatic = h.get('st') === '1'; $('tog-static').checked = showStatic;
}
function fromHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  readRangeFromHash(h);
  if (h.get('case') && CASES.some(c => c.id === h.get('case'))) { goCase(h.get('case')); return true; }
  if (h.get('aoi') === 'ar') { selectCountry(); return true; }
  if (h.get('prov')) { const p = h.get('prov'); $('prov').value = p; selectProvince(p); return true; }
  if (h.get('pt')) { const [lat, lon] = h.get('pt').split(',').map(Number); $('lat').value = lat; $('lon').value = lon; selectPoint(lat, lon); if (!A) selectCountry(); return true; }
  if (h.get('cells')) { picked = new Set(decodeIds(h.get('cells')).filter(id => D.cells[id])); if (picked.size) { paintPicked(); A = null; select({ kind: 'cells', label: `${t('cellsel')} (${picked.size})`, cells: [...picked] }); map.fitBounds(L.latLngBounds([...picked].map(id => { const [a, c, b, d] = cellBounds(id); return [[a, c], [b, d]]; }).flat()), { padding: [20, 20], maxZoom: 8, animate: false }); } return true; }
  if (h.get('bbox')) { const [s, w, n, e] = h.get('bbox').split(',').map(Number); const r = L.rectangle([[s, w], [n, e]], DRAW_STYLE); drawn.addLayer(r); selectLayer(r); return true; }
}
// B5: an inverted range is swapped, out-of-bounds months are clamped
const cmpYM = (a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
function normalizeRange() {
  const clamp = v => cmpYM(v, RANGE_DEFAULT[0]) < 0 ? [...RANGE_DEFAULT[0]] : cmpYM(v, RANGE_DEFAULT[1]) > 0 ? [...RANGE_DEFAULT[1]] : [v[0], Math.min(12, Math.max(1, v[1]))];
  range.from = clamp(range.from); range.to = clamp(range.to);
  if (cmpYM(range.from, range.to) > 0) { const x = range.from; range.from = range.to; range.to = x; }
}
function selectCountry() { $('prov').value = ''; select({ kind: 'country', label: 'Argentina', cells: Object.keys(D.cells).map(Number) }); }
function selectProvince(p) { if (!p) return; select({ kind: 'province', label: p, cells: Object.keys(D.cells).filter(id => D.cells[id].p === p).map(Number) }); }
function msg(text) { const el = $('msg'); el.textContent = text || ''; el.hidden = !text; if (text) setTimeout(() => { if (el.textContent === text) { el.hidden = true; el.textContent = ''; } }, 6000); }
function selectPoint(lat, lon) { const id = cellOf(lat, lon); if (id == null || !D.cells[id]) { msg(t('outside')); return; } $('prov').value = ''; select({ kind: 'point', label: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, cells: [id] }); }
function selectLayer(layer) { const { ids, snapped1 } = cellsForLayer(layer); const b = layer.getBounds(); select({ kind: 'drawn', label: 'drawn', cells: ids, snapped1, bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()] }); }
// rectangle tool → the cells become an editable cell selection (click to add/remove)
function rectToCells(layer) { const { ids } = cellsForLayer(layer); drawn.clearLayers(); if (!ids.length) return; picked = new Set(ids); paintPicked(); A = null; select({ kind: 'cells', label: `${t('cellsel')} (${picked.size})`, cells: [...picked] }); }

function initMap() {
  map = L.map('map', { preferCanvas: true, zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 }).setView([-38.5, -63.5], 4);
  map.attributionControl.setPrefix(false);
  const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const sat = L.layerGroup([L.tileLayer(esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, attribution: '© Esri, Maxar, Earthstar Geographics · NASA FIRMS' }), L.tileLayer(esri + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, opacity: 0.9 })]);
  const grey = L.tileLayer(esri + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, attribution: '© Esri, HERE, Garmin, OpenStreetMap contributors · NASA FIRMS' });
  const topo = L.tileLayer(esri + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, attribution: '© Esri, HERE, Garmin, FAO, NOAA, USGS · NASA FIRMS' });
  sat.addTo(map);
  L.control.layers({ [lang === 'es' ? 'Satelital' : 'Satellite']: sat, [lang === 'es' ? 'Topográfico' : 'Topographic']: topo, [lang === 'es' ? 'Gris' : 'Light grey']: grey }, null, { position: 'bottomright', collapsed: true }).addTo(map);
  applyDrawLocale();
  const brand = document.createElement('img'); brand.src = 'assets/geofuego-globo.png'; brand.alt = ''; brand.className = 'map-globo'; document.getElementById('map').appendChild(brand);
  if (PROV) for (const p of PROV.provincias) { const l = L.polygon(p.rings.map(r => [r]), { color: '#ffffff', opacity: 0.7, weight: 1, fillOpacity: 0, fillColor: '#f5a623', interactive: true, bubblingMouseEvents: true }).addTo(map); l.bindTooltip(p.n === TDF ? 'Tierra del Fuego' : p.n, { sticky: true, direction: 'top', opacity: 0.9 }); l.on('click', () => { if (drawing()) return; $('prov').value = p.n; selectProvince(p.n); }); l.on('mouseover', () => { if (!(A && A.sel.kind === 'province' && A.sel.label === p.n)) l.setStyle({ fillOpacity: 0.12 }); }); l.on('mouseout', () => l.setStyle({ fillOpacity: 0 })); provLayers[p.n] = l; }
  drawn = new L.FeatureGroup().addTo(map);
  const ctl = new L.Control.Draw({ position: 'topleft', draw: { polyline: false, circle: false, circlemarker: false, marker: false, polygon: false, rectangle: { shapeOptions: DRAW_STYLE, showArea: false } }, edit: false });
  map.addControl(ctl);
  map.on(L.Draw.Event.CREATED, e => { lastDrawTs = Date.now(); $('prov').value = ''; rectToCells(e.layer); });
  const Home = L.Control.extend({ onAdd() { const d = L.DomUtil.create('div', 'leaflet-bar leaflet-control-home'); const a = L.DomUtil.create('a', '', d); a.href = '#'; a.title = t('home'); a.setAttribute('aria-label', t('home')); a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2"/></svg>'; L.DomEvent.on(a, 'click', ev => { L.DomEvent.preventDefault(ev); L.DomEvent.stopPropagation(ev); map.setView([-38.5, -63.5], 4); }); return d; } });
  map.addControl(new Home({ position: 'topleft' }));
  buildMovieBar();
  buildGrid();
  renderFireMap();
  // hotspots layer toggle: a dark chip in the app's own style (replaces Leaflet's white overlay box)
  const FireTog = L.Control.extend({ onAdd() { const a = L.DomUtil.create('button', 'map-chip on'); a.type = 'button'; const lab = () => { a.innerHTML = `<i></i>${t('fireslayer')}`; }; lab(); L.DomEvent.disableClickPropagation(a); L.DomEvent.on(a, 'click', () => { const on = !map.hasLayer(fireLayer); if (on) fireLayer.addTo(map); else fireLayer.remove(); a.classList.toggle('on', on); }); map.on('langchange', lab); return a; } });
  map.addControl(new FireTog({ position: 'bottomleft' }));
}

// Leaflet.draw strings (B7-i): the toolbar reads L.drawLocal when the button is built and when a drawing starts
function applyDrawLocale() {
  const es = lang === 'es'; const d = L.drawLocal.draw;
  d.toolbar.buttons.rectangle = es ? 'Dibujar un rectángulo' : 'Draw a rectangle';
  d.toolbar.actions.title = es ? 'Cancelar el dibujo' : 'Cancel drawing'; d.toolbar.actions.text = es ? 'Cancelar' : 'Cancel';
  d.handlers.rectangle.tooltip.start = es ? 'Hacé click y arrastrá para dibujar un rectángulo' : 'Click and drag to draw a rectangle';
  d.handlers.simpleshape.tooltip.end = es ? 'Soltá el mouse para terminar' : 'Release mouse to finish drawing';
  const btn = document.querySelector('.leaflet-draw-draw-rectangle'); if (btn) btn.title = d.toolbar.buttons.rectangle;
  document.title = es ? 'GeoFuego Harmonization — calendario de focos de calor de 26 años para cualquier área de Argentina' : 'GeoFuego Harmonization — a 26-year fire-hotspot calendar for any area of Argentina';
}
function initUI() {
  const provs = [...new Set(Object.values(D.cells).map(c => c.p))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  for (const p of provs) $('prov').append(Object.assign(document.createElement('option'), { value: p, textContent: p === TDF ? 'Tierra del Fuego' : p }));
  $('prov').addEventListener('change', e => selectProvince(e.target.value));
  $('country').addEventListener('click', () => { $('prov').value = ''; selectCountry(); });
  $('clear').addEventListener('click', clearSelection);
  $('go').addEventListener('click', () => { const lat = +$('lat').value, lon = +$('lon').value; if (!isFinite(lat) || !isFinite(lon) || !$('lat').value || !$('lon').value) { msg(t('needpt')); return; } selectPoint(lat, lon); });
  const onRange = () => { const p = s => { const [y, m] = s.split('-').map(Number); return y && m ? [y, m] : null; }; range = { from: p($('from').value) || RANGE_DEFAULT[0], to: p($('to').value) || RANGE_DEFAULT[1] }; normalizeRange(); $('from').value = ym(range.from); $('to').value = ym(range.to); render(); renderFireMap(); };
  $('from').addEventListener('change', onRange); $('to').addEventListener('change', onRange);
  $('tog-pre').addEventListener('change', e => { showPre = e.target.checked; render(); });
  $('tog-static').addEventListener('change', e => { showStatic = e.target.checked; renderStatic(); if (A) history.replaceState(null, '', '#' + encodeSel(A.sel)); if (showStatic) $('static-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $('ramp').addEventListener('change', e => { rampName = e.target.value; renderCalendar(); });
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { calMode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); $('ramp').disabled = calMode === 'anom'; renderCalendar(); }));
  $('dl-csv').addEventListener('click', downloadCSV); $('dl-png').addEventListener('click', downloadPNG);
  $('cal').addEventListener('mousemove', calTip); $('cal').addEventListener('mouseleave', () => { $('tip').hidden = true; });
  $('lang').addEventListener('click', () => { lang = lang === 'en' ? 'es' : 'en'; applyI18n(); applyDrawLocale(); map.fire('langchange'); if (A) { location.hash = encodeSel(A.sel); render(); } });
  window.addEventListener('resize', () => { if (A) { renderSeries(); renderStep(); } });
  document.querySelectorAll('#step-card .pill').forEach(b => b.addEventListener('click', () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); stepShow[b.dataset.s] = on; applyStepShow(); }));
  window.addEventListener('hashchange', () => { if (A && location.hash === '#' + encodeSel(A.sel)) return; const h = new URLSearchParams(location.hash.replace(/^#/, '')); if (h.get('lang') && h.get('lang') !== lang) { lang = h.get('lang') === 'es' ? 'es' : 'en'; applyI18n(); } fromHash(); });
}

(async () => {
  applyI18n();
  try { await load(); } catch (e) { $('empty').innerHTML = `<p>Data could not be loaded (${e.message}).</p>`; return; }
  const chrome = () => { const h = document.querySelector('header.top')?.offsetHeight || 0, f = document.querySelector('footer')?.offsetHeight || 0; document.documentElement.style.setProperty('--chrome', (h + f + 30) + 'px'); if (map) map.invalidateSize(); };
  chrome(); window.addEventListener('resize', chrome);
  initMap(); initUI(); chrome(); if (fromHash() === undefined && !A) selectCountry();
  window.__ready = { cells: Object.keys(D.cells).length, live: L26 ? L26.data_through : null };
  window.__rectToCells = rectToCells; // test hook (QA scripts drive the rectangle tool without pointer gestures)
})();
})();
