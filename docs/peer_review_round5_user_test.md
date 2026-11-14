# Peer review, ronda 5 — prueba de usuario frío sobre la app

*Revisión hecha por un sistema de SI (Claude) en sesión aislada. Dos pasadas a ciegas sobre https://spaceapps.geofuego.com.ar/ (build `app.js?v=202611142108`, datos hasta 2026-11-14): primero como gestor provincial de incendios con 5 minutos, después como juez con 3. El README y las reglas R1–R13 se leyeron recién al final. Navegador Chromium, 1920×992, 1366×768 y 390×844. Capturas en `outbox/spaceapps-r5/`.*

**Qué se probó y qué no.** Probado en vivo: carga, provincia por click y por desplegable, rectángulo, punto, rango de fechas, idioma, los dos toggles, CSV y PNG, tooltips, hash, 390 px, consola. Los gestos de mapa (click, arrastre) y los hover se dispararon con eventos sintéticos, no con dedo real: lo de mobile es layout medido, no una prueba táctil en un teléfono. Consola y errores: **cero mensajes, cero errores** en toda la sesión.

---

## 1. Primera impresión en 10 segundos

**Qué creí que era.** Un tablero de focos de calor de Argentina con un mapa a la izquierda y un calendario de colores año × mes a la derecha. Que cubre 2000 → hoy se entiende por el subtítulo. Hasta ahí bien.

**Qué leí primero** (lo más grande y verde de la pantalla): `6,465 · 41 % below the median`. Como gestor pensé "noviembre viene tranquilo". Es falso; ver bug B1.

**Qué no entendí.**

- "Harmonization" como título no me dice nada. El problema que resuelve (dos satélites que cuentan distinto, un salto falso de 3× en 2012) no aparece en ningún lado de la pantalla.
- "VIIRS-equivalent counts" y "calibrated 80 % range on every reconstructed month": tres términos técnicos en la única frase de presentación.
- "4193 cells · tier A": no sé qué es una celda ni qué es un tier, ni si A es bueno.
- Los números verdes y naranjas: no sé si verde es "bien" o "poco".
- Los triangulitos y rombos blancos del calendario se ven como suciedad a tamaño real (miden 3–4 px).
- Qué hago con esto. No hay un "para qué sirve" ni un ejemplo.

**Tiempo de carga percibido.** Instantáneo en fibra: HTML 9 KB en 60–90 ms, todo dibujado en ~0,7 s, cambiar de provincia tarda ~0,1 s. El peso está en `cells.json` (1,18 MB comprimido, 1,4 s en esta conexión). En 3G serían varios segundos; no pude verificar si hay indicador de carga durante esa espera.

---

## 2. Bugs reales

Ordenados por daño. Todos reproducidos; las líneas citadas son de `deploy/app.js`.

### B1. El número titular compara 14 días contra la mediana del mes entero

- **Pasos:** abrir `https://spaceapps.geofuego.com.ar/#lang=en&aoi=ar` un día 14.
- **Se ve:** `Nov 2026 · month to date — 6,465 — 41 % below the median · median 10,936 (25 years)`.
- **Por qué está mal:** 10.936 es la mediana de noviembres completos (`renderNow`, línea 242: `hist` toma `A.H` del mes entero). A ritmo proporcional, 14 días de 30 equivalen a ~5.100; 6.465 es **~27 % por encima**, no 41 % por debajo. La tarjeta `Jan–Nov` arrastra el mismo sesgo (10,5 meses contra 11).
- **Consecuencia:** es lo primero que lee cualquiera y dice lo contrario de lo que pasa. Cumple la letra de R4 (tiene el rótulo "month to date") y viola su sentido. Además el color sale verde ("down").
- **Fix:** en el mes en curso no mostrar el porcentaje. Mostrar `6,465 so far (14 of 30 days) · a full November is typically 10,936`, sin color. Alternativa si hay datos diarios históricos: mediana a la misma fecha. Captura `01`, `15`.

### B2. El link compartido de un rectángulo grande abre otra área

- **Pasos:** vista país → herramienta rectángulo → dibujar sobre el NEA un área de más de 400 celdas → copiar la URL → abrirla de nuevo.
- **Se ve:** antes `Selected cells (2155) · mostly in Santa Fe · Nov 4,093`; después de recargar `Selected cells (400) · mostly in La Pampa · Nov 32`.
- **Causa:** `encodeSel`, línea 499: `sel.cells.slice(0, 400)`. Corta en silencio y se queda con las 400 celdas de ID más bajo (las del sur).
- **Fix:** guardar el rectángulo como `bbox=` (el lector de hash ya lo entiende, línea 505) en vez de la lista de celdas; para selecciones editadas a mano, codificar rangos. De paso baja la URL de 2.000 caracteres a 60.

### B3. Enero 2012 figura como "observed (VIIRS)" y es mayormente modelado

- **Pasos:** `#lang=en&prov=San%20Luis`, pasar el mouse por Jan 2012.
- **Se ve:** `805 VIIRS-equivalent hotspots · observed (VIIRS) · ◆ partly modelled (satellite outage, 200 %)`. En Corrientes: `observado (VIIRS) · 29 %`, mientras el CSV de la misma área dice `reconstructed_share 0.87, gap_fill_share 0.29`.
- **Causa:** línea 269, `kind: y >= 2012 ? 'obs'`; y `gap / v` sin tope.
- **Por qué importa:** R10 pide tratar enero 2012 como reconstruido. Hoy sale sin rango y con etiqueta de observado, y un porcentaje de 200 % es imposible.
- **Fix:** si `recon/v > 0.5` → etiqueta "reconstructed" y rango; acotar el porcentaje a 100.

### B4. El CSV se rompe en las filas de 2026

- **Pasos:** cualquier área → CSV → abrir en Excel o `pandas.read_csv(comment='#')`.
- **Se ve:** encabezado de 15 columnas; filas 2026 con 17. Ejemplo: `2026,9,3440.2,,,VIIRS NRT S-NPP-eq (NOAA-20/0.979, NOAA-21/0.951),A,2000,0,0,,,4.3,,preliminary, month to date through 2026-09-30; days…`.
- **Causa:** línea 434, dos campos con coma sin comillas.
- **Otros defectos del mismo archivo:** (a) sin BOM: Excel muestra `Â·` y `â€"` en las líneas de comentario; (b) el encabezado dice `baseline 2000–2025` y la pantalla `baseline: 2001–2025`; (c) ignora el rango de fechas elegido sin decirlo; (d) con Excel en español el separador coma y el punto decimal no se interpretan solos.
- **Fix:** poner entre comillas todo campo de texto; BOM `﻿`; unificar el año de base.

### B5. Rango de fechas invertido: pantalla vacía y "undefined–undefined"

- **Pasos:** `#lang=en&prov=San%20Luis` → From = June 2022, to = March 2010.
- **Se ve:** calendario vacío, tarjetas con "—", leyenda `many (0)` y la nota `baseline: undefined–undefined`. Ningún mensaje. Captura `06`.
- **Variante:** escribir a mano From 1990 y to 2030 deja vacíos "Which years burned most" y "Which months".
- **Fix:** si `from > to`, intercambiarlos; acotar a `min`/`max` al leer.

### B6. Mobile: el panel del mapa queda pegado y el contenido pasa por encima

Ver sección 5. Causa de una línea en `app.css`.

### B7. Menores

| # | Qué | Dónde |
|---|---|---|
| a | Los meses terminados de 2026 dicen "month to date" (`Jan 2026 · preliminary, near-real-time, month to date · data through 2026-01-31`). La línea 250 tiene las dos ramas del ternario iguales. | tooltip, tarjeta |
| b | `1 cells` / `1 celdas`. | subtítulo |
| c | Con el toggle "show greyed years" activado, el cartel sigue diciendo "greyed and excluded… by default (toggle to show them)". Captura `09`. | banner |
| d | En áreas grandes "show greyed years" no hace nada y no está deshabilitado. | toggle |
| e | El rango de fechas y los dos toggles no se guardan en el hash: el link compartido pierde esa parte del estado. | hash |
| f | Con rango 2015–2020 el cartel sigue diciendo "Full calendar, all years". | banner |
| g | `0 · 5th highest of 15 years · median 0 (14 years)`: 15 contra 14 en la misma línea, y un cero rankeado quinto. | tarjeta, nivel C/D |
| h | "Go" con los campos vacíos no hace nada ni avisa. Un punto fuera de la grilla deja el desplegable de provincia en "—" aunque la provincia siga en pantalla. | controles |
| i | En español quedan en inglés: `<title>`, "Draw a rectangle", "Click and drag to draw rectangle", "Cancel", los `aria-label` de los gráficos y la frase de reconocimiento a FIRMS. | i18n |
| j | Santa Cruz y Chubut muestran a la vez "tier A · Full calendar, all years" y "one tier stricter… not comparable across 2012". | banners |
| k | En Tierra del Fuego el "factor prestado" aparece dos veces seguidas, y el segundo cartel nombra a la Ciudad de Buenos Aires. Captura `11`. | banners |
| l | La leyenda de la serie muestra `p90 140 · p10 140` en meses observados (igual a H): parece un rango de ancho cero. Debería ser "—". | serie |

**Descartado como bug:** una etiqueta "San Luis" que parecía quedar colgada en el mapa era el tooltip del puntero quieto. Y la pestaña de prueba saltó una vez a spaceappschallenge.org: la app no tiene ningún link ahí; fue otro proceso usando el mismo navegador.

---

## 3. Fricciones de UX

### Bloqueantes

1. **El porcentaje del mes en curso engaña** (B1). Fix arriba.
2. **Nada explica el problema ni el resultado.** Un juez no ve en pantalla por qué existe esto. Fix: una franja de una línea bajo el encabezado, siempre visible:
   - EN: `Before 2012 Argentina's fire record comes from MODIS; since 2012 from VIIRS, which sees about 3 fire pixels where MODIS saw one. This app puts both on the same scale so you can compare this season with any year since 2000.`
   - ES: `Hasta 2012 el registro de focos de Argentina viene de MODIS; desde 2012, de VIIRS, que ve unos 3 píxeles de fuego donde MODIS veía uno. Esta app los pone en la misma escala para comparar esta temporada con cualquier año desde 2000.`
3. **Mobile inutilizable** (sección 5).
4. **La serie con el rango —la prueba central del trabajo— está dos pantallas abajo** (y = 1.248 px en una laptop de 768) y la banda casi no se distingue del fondo. Fix: subirla arriba del calendario o al lado, dar a la banda un relleno visible (naranja al 25–30 %) y marcar 2012 con una línea vertical rotulada `VIIRS starts`.

### Molestas

5. **"Fixed heat sources" no produce ningún cambio visible:** el gráfico aparece al fondo de la página (captura `05`). Fix: insertarlo debajo del calendario o hacer scroll hasta él.
6. **El filtro de fechas cambia la mediana de "This month" sin avisar** (25 años → 6 años al elegir 2015–2020). Fix: que el rango afecte solo calendario y serie, o rotular `median of 2015–2020 (your date range)`.
7. **La selección casi no se ve en el mapa:** contorno naranja fino sin relleno, sin marcador en el punto ingresado (captura `10`); tras dibujar un rectángulo en vista país el mapa no hace zoom al área (captura `07`). Fix: relleno al 25 %, marcador, `fitBounds`.
8. **Marcadores ▲ ◆ ilegibles y sin tacto.** 3–4 px; el detalle solo aparece con hover. En San Luis 2001 hay ▲ en 5 de 12 meses: tantos que dejan de informar (R9 ya sugería subir el umbral). Fix: duplicar el tamaño y abrir el detalle también con click.
9. **Colores de las tarjetas sin leyenda**, y el naranja pinta un cero como "alto". Fix: flecha y palabra (`▼ below normal`) y sin color cuando la mediana es menor a 10.
10. **Encabezado y pie se comen el 24 % de una laptop** (122 + 62 px de 768); el calendario muestra 6 filas. Fix: pie de una línea con "About / data sources" desplegable.
11. **`alert()` nativo** para punto fuera de grilla. Las Malvinas (-51,7, -59,0) devuelven "Punto fuera de la grilla de Argentina", con una provincia que se titula "…e Islas del Atlántico Sur". Fix: mensaje en línea `No hotspot data for this point (outside the mainland grid).`
12. **Los links del encabezado abren en la misma pestaña.** Fix: `target="_blank" rel="noopener"`.
13. **Los años "reconstruidos" encabezan casi todos los rankings** (San Luis: 2003, 2002, 2001, 2009 antes que 2020). Sin explicación parece que el método infla el pasado. Fix, junto a la lista:
    - EN: `Years before 2012 rank high because fire activity really was higher then: the raw MODIS record, with no conversion, falls by the same amount after 2011.`
    - ES: `Los años anteriores a 2012 quedan arriba porque de verdad hubo más fuego: el registro MODIS crudo, sin conversión, cae lo mismo después de 2011.`

### Cosméticas

14. Leyenda de la serie `month / H / p90 / p10`. Fix: `Hotspots / range high / range low`.
15. "Where it burns": dos porcentajes por barra (`12.7 % · 10 %`) con la clave en gris al pie. Fix: rotular `2000–2025: 12.7 % · 2026: 10 %`.
16. El gráfico de fuentes fijas tiene un solo número de eje ("41").
17. "SI assistance": un juez lee "SI" y no sabe qué es; el formulario pregunta por uso de IA. Si la sigla es decisión del equipo, desplegarla la primera vez: `SI (super intelligence, i.e. AI) assistance`.
18. "Clear" vuelve a "Whole country", no limpia. Renombrar `Reset`.
19. Sin `og:title` / `og:image`: el link pegado en un chat o formulario sale sin vista previa.

---

## 4. Textos: términos que un no-experto no entiende

**Respuesta a las tres preguntas del encargo.** ¿Explica qué es un "VIIRS-equivalent hotspot"? A medias: dice qué *no* es (ni incendios ni área) pero no qué significa "equivalent". ¿Explica la banda? Sí en lo numérico ("about 1 month in 5 falls outside it"), que es la mejor frase de la app; no dice de dónde sale ni que aplica solo antes de 2012 hasta abrir el desplegable. ¿"Factor borrowed"? No: nunca dice factor de qué. ¿Sale sabiendo qué hacer? No: no hay una sola frase de uso.

| Término en pantalla | Glosa EN | Glosa ES |
|---|---|---|
| VIIRS-equivalent hotspots | Fire detections counted the way the VIIRS satellite counts them (375 m pixels), so years before and after 2012 can be compared. | Detecciones de fuego contadas como las cuenta el satélite VIIRS (píxeles de 375 m), para poder comparar años de antes y después de 2012. |
| Harmonization | Putting two satellite records that count fire differently on one scale. | Poner en una misma escala dos registros satelitales que cuentan el fuego distinto. |
| reconstructed from MODIS | Estimated: the older satellite's count multiplied by a local conversion factor. | Estimado: el conteo del satélite viejo multiplicado por un factor de conversión local. |
| observed (VIIRS) | Counted directly by the current satellite; no estimate involved. | Contado directo por el satélite actual; no hay estimación. |
| 80 % range | The true value is expected inside this range 4 times out of 5. | El valor real cae dentro de este rango 4 de cada 5 veces. |
| H / p10 / p90 | Hotspots / low end of the range / high end of the range. | Focos / extremo bajo del rango / extremo alto del rango. |
| cell (0.25°) | The map square the data comes in, about 25 × 25 km. | El cuadrado del mapa en que vienen los datos, unos 25 × 25 km. |
| tier A / B / C / D | How much of the history is reliable for an area this size: A = all of it, D = only since 2012. | Cuánta historia es confiable para un área de este tamaño: A = toda, D = solo desde 2012. |
| factor borrowed from the region | Too few fires here to work out a local conversion factor, so the regional one is used; treat the pre-2012 values as rough. | Acá hay muy pocos fuegos para calcular un factor de conversión propio; se usa el de la región. Tomar los valores previos a 2012 como aproximados. |
| fixed heat sources | Gas flares and industrial sites that the satellite sees as fire; counted separately, never in the calendar. | Antorchas de gas e industrias que el satélite ve como fuego; se cuentan aparte, nunca en el calendario. |
| ▲ cloudier than usual at overpass time | Clouds hid part of the fires when the satellite passed; the real number is probably higher. | Las nubes taparon parte del fuego cuando pasó el satélite; el número real probablemente sea mayor. |
| ◆ partly modelled (satellite outage) | The satellite was down some days; those days were filled in from the other satellite. | El satélite estuvo caído algunos días; esos días se completaron con el otro satélite. |
| Terra-only era (hatch) | Nov 2000 – Jun 2002: one satellite instead of two, so the estimate is rougher. | Nov 2000 – jun 2002: un satélite en vez de dos; la estimación es más gruesa. |
| S-NPP-equivalent (NOAA-20 ÷ 0.979…) | This year's data comes from newer satellites, adjusted to match the one used for 2012–2025. | Los datos de este año vienen de satélites más nuevos, ajustados para coincidir con el usado en 2012–2025. |
| preliminary, near-real-time | First-pass data from the last hours or days; it can change. | Datos de primera pasada, de las últimas horas o días; pueden cambiar. |
| lower bound / cota inferior | At least this many; some days had fewer satellites reporting. | Como mínimo esta cantidad; algunos días reportaron menos satélites. |
| baseline | The years used as "normal" for the comparison. | Los años que se toman como "lo normal" para comparar. |
| median | The middle year: half the years had more, half had less. | El año del medio: la mitad de los años tuvo más, la mitad menos. |
| inter-quartile range | The range the middle half of the years fell in. | El rango donde cayó la mitad central de los años. |
| no MODIS detection | The old satellite saw nothing here; small fires may have burned unseen. | El satélite viejo no vio nada acá; pudo haber fuegos chicos que no detectó. |
| ENSO (en "How to read") | El Niño / La Niña years. | Años de El Niño / La Niña. |
| calibrated out of sample | Checked against years the method had not seen. | Verificado contra años que el método no había visto. |
| region: NEA / Centro | Fire-regime region used to group provinces. | Región de régimen de fuego usada para agrupar provincias. |

**Frase de uso que falta** (arriba de las tarjetas):
- EN: `Use it to answer: is this month above or below normal here, which years were worst, and when does the season peak.`
- ES: `Sirve para responder: ¿este mes viene por encima o por debajo de lo normal acá?, ¿qué años fueron los peores?, ¿cuándo es el pico de la temporada?`

---

## 5. Mobile a 390 px

Medido a 390×844. Capturas `12`, `13`, `14`.

1. **El contenido se dibuja encima del mapa.** Al desplazar, el calendario y la serie pasan por arriba del panel de controles y del mapa, que queda fijo. **Causa:** en `app.css` la media query de la línea 18 (`.map-panel { position:static }`, `#map { height:380px }`) está *antes* de las reglas base de las líneas 20–21 (`position:sticky`, `height:520px`), que la pisan. **Fix:** mover la media query debajo de esas reglas. Cinco minutos.
2. **Los logos tapan el título.** El globo de Space Apps cae sobre "GEOFUEGO" y "Harmonization".
3. **Queda el 49 % de la pantalla para el contenido.** Encabezado 280 px, pie 151 px (fijo, 11 px de letra), área útil 413 px. Fix: en mobile, `body { overflow:auto; height:auto }`, ocultar el párrafo del encabezado y colapsar el pie.
4. **Todo se corta 25–38 px a la derecha** y no se puede desplazar en horizontal: la columna de la grilla mide 408 px en una pantalla de 390. Se lee "click the cells you" y se corta. Fix: `grid-template-columns: minmax(0, 1fr)`.
5. **Calendario ilegible:** el lienzo de 900 px se achica a 352; los años y los marcadores no se leen.
6. **Sin tooltips táctiles:** el detalle de cada mes depende de `mousemove`. No lo probé con un dedo real.
7. **Botones chicos:** CSV 49×25 px, casillas de 13 px, zoom 30×30 (lo recomendado es 44).
8. **El mapa atrapa el gesto:** 469 px de alto dentro de un área de 413; arrastrar mueve el mapa en vez de la página.

Un gestor en el campo abre esto en el teléfono. Hoy no puede usarlo.

---

## 6. Como juez: ¿le creo?

**A medias. Creo que hay trabajo serio atrás; la pantalla no me lo demuestra.**

**Lo que me da confianza sin leer nada más:** las negaciones explícitas ("not a number of fires and not burned area", "not an alert system"); "about 1 month in 5 falls outside it"; cada mes etiquetado como observado o reconstruido; años grises con su motivo; DOI y código a un click; consola limpia; respuesta instantánea.

**Lo que me la quita:**

- El titular del mes está sesgado (B1) y lo descubro con una regla de tres.
- Enero 2012 "observed" con "200 % modelled" (B3).
- Ningún número de exactitud en la pantalla. El README tiene 3,2 % país / 9,8 % provincia y el rango probado en 2024–2025; la app, nada.
- No veo el antes y el después. La figura que vende el trabajo (el salto falso de 3× en 2012 contra la serie armonizada) está en el README y no en la app.
- Los años reconstruidos lideran los rankings sin explicación.

**Qué me falta ver para creer sin abrir el README:**

1. **Un "How was this calculated?" a un click**, abierto por defecto la primera vez, con tres líneas: `Conversion factor per 25 km cell and calendar month, fitted on the days both satellites flew (2012–2023).` · `Tested on years left out: season totals off by 3 % for the country, 10 % for a province, 30 % for a single cell.` · `The 80 % range was checked on 2024 and 2025, never used to build it: it held 73–81 % of the time.`
2. **Un toggle "raw vs harmonized" en la serie**, que dibuje MODIS crudo + VIIRS crudo con el escalón de 2012. Es la demostración del desafío en un gesto.
3. **La banda visible** y una línea en 2012.
4. **El límite más importante al lado del dato**, no en el desplegable: `Nothing independent can check 2000–2011; the estimate holds if the MODIS–VIIRS relation of 2012–2023 held before.` Decirlo en pantalla suma credibilidad.
5. **El DOI como cita copiable**, no solo un chip.
6. **Fecha y fuente del dato** junto al número: `NASA FIRMS, updated 2026-11-14`.

### Cumplimiento visible de R1–R13

| Regla | Estado | Evidencia |
|---|---|---|
| R1 geometría | **Cumple** | Ajusta a celdas, muestra cantidad y km²; cartel "smaller than one cell" verificado. Contorno fino (fricción 7). |
| R2 niveles | **Cumple** | A (San Luis 120), B (Misiones 59), C (9 celdas: base 2012–2025, cero = "no MODIS detection"), D (1 celda: gris, sin ranking). Las letras A–D no están explicadas. |
| R3 rango | **Parcial** | Límite inferior ≤ valor en todos los casos vistos; en C/D el cero va sin rango y con etiqueta. En nivel A un cero previo a 2012 sale sin rango y sin la etiqueta. Qué bins usa no es verificable desde la pantalla. |
| R4 base | **Letra sí, sentido no** | C/D usan 2012–2025 y lo dicen; ranking cuando la mediana < 10. Pero el mes en curso se compara con medianas de mes completo (B1). |
| R5 solo Terra | **Cumple en lo visible** | Rayado en nivel A, 2000 nunca rankeado, 2002 marcado. La exclusión de esa era en las bases de B–D no se puede confirmar: Misiones (B) dice "25 years · 2001–2025". **Revisar.** |
| R6 fuentes fijas | **Cumple** | Serie aparte desde 2012, rotulada; cartel en Neuquén 56 %, Santa Cruz 28 %, TdF 18 %, CABA 70 %. |
| R7 Tierra del Fuego | **Cumple** | Solo 2012 →, con cartel. |
| R8 Patagonia sur | **Parcial** | Cartel presente en Chubut y Santa Cruz, contradictorio con "tier A · Full calendar" (B7-j). |
| R9 nubes | **Parcial** | Marcador y frase, sin porcentaje. Falta el aviso de sesgo cuando el mes en curso está nublado: los meses de 2026 no llevan bandera de nubes. Umbral sin subir. |
| R10 huecos | **No cumple** | Marcador y porcentaje >10 % sí; enero 2012 sigue como observado y aparece un 200 % (B3). |
| R11 factor asignado | **Cumple, mal redactado** | Cartel en TdF y CABA; columna en el CSV. Duplicado y sin explicar (B7-k). |
| R12 año en curso | **Cumple** | Rótulo preliminar, ⚠ con menos de tres satélites. El "± 5 %" solo en el desplegable. |
| R13 descargas | **Parcial** | Tiene todas las columnas pedidas; las filas 2026 están malformadas y la base del encabezado no coincide (B4). |
| §3.3 textos obligatorios | **Cumple** | Los cinco textos aparecen literales, en letra gris de 12 px. |

Resumen: 7 cumplen, 5 parciales, 1 no cumple (R10).

---

## 7. Top 5 cambios para Presentation e Impact

| # | Cambio | Mejora | Esfuerzo |
|---|---|---|---|
| 1 | **Arreglar el titular del mes** (B1): sacar el porcentaje del mes en curso, mostrar "so far, N of 30 days" contra el mes típico. | Impact y credibilidad: es el primer número que lee el juez y hoy está mal. | 30 min |
| 2 | **Toggle "raw vs harmonized"** en la serie, con el escalón de 2012, línea vertical y banda visible; subir la serie arriba. | Presentation: muestra el desafío resuelto en un gesto. Es lo que el juez recuerda. | 2–3 h (hay que sumar MODIS y VIIRS crudos nacionales y provinciales al payload) |
| 3 | **Franja "qué es / para qué sirve" + panel "How was this calculated?"** con los tres números de validación y el límite de 2000–2011. | Presentation e Impact: el juez cree sin abrir el README; el gestor sabe qué preguntar. | 1 h (solo texto, EN/ES) |
| 4 | **Mobile:** mover la media query, `minmax(0,1fr)`, encabezado y pie colapsados, tooltips con click. | Impact: el usuario real lo abre en el teléfono; el juez también puede. | 1–1,5 h (el arreglo que destraba el solapamiento son 5 min) |
| 5 | **Integridad de lo que se comparte:** hash con `bbox`, fechas y toggles (B2, B7-e); CSV con comillas y BOM (B4); enero 2012 como reconstruido (B3); rango invertido (B5). | Credibilidad ante un juez que prueba el link y descarga el CSV. | 1,5 h |

Si queda una hora: 1, el arreglo de 5 minutos de mobile, y el texto de 3.
