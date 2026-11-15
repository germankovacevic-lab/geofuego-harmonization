> Literal English translation of the original Spanish report (original text in git history, commit 2518c20). Translated with SI assistance (Claude, Anthropic); content unchanged.
# Peer review, round 5 — cold user test of the app

*Review done by an SI system (Claude) in an isolated session. Two blind passes over https://spaceapps.geofuego.com.ar/ (build `app.js?v=202611142108`, data up to 2026-11-14): first as a provincial fire manager with 5 minutes, then as a judge with 3. The README and rules R1–R13 were read only at the end. Chromium browser, 1920×992, 1366×768 and 390×844. Screenshots in `outbox/spaceapps-r5/`.*

**What was tested and what was not.** Tested live: loading, province by click and by dropdown, rectangle, point, date range, language, the two toggles, CSV and PNG, tooltips, hash, 390 px, console. Map gestures (click, drag) and hovers were triggered with synthetic events, not with a real finger: the mobile part is measured layout, not a touch test on a phone. Console and errors: **zero messages, zero errors** throughout the session.

---

## 1. First impression in 10 seconds

**What I thought it was.** A dashboard of fire hotspots in Argentina with a map on the left and a colour calendar year × month on the right. That it covers 2000 → today is understood from the subtitle. Fine so far.

**What I read first** (the biggest and greenest thing on the screen): `6,465 · 41 % below the median`. As a manager I thought "November is coming in quiet". That is false; see bug B1.

**What I did not understand.**

- "Harmonization" as a title tells me nothing. The problem it solves (two satellites that count differently, a false 3× jump in 2012) does not appear anywhere on the screen.
- "VIIRS-equivalent counts" and "calibrated 80 % range on every reconstructed month": three technical terms in the only introductory sentence.
- "4193 cells · tier A": I don't know what a cell is or what a tier is, or whether A is good.
- The green and orange numbers: I don't know whether green means "good" or "few".
- The little white triangles and diamonds in the calendar look like dirt at real size (they measure 3–4 px).
- What I do with this. There is no "what it is for" and no example.

**Perceived load time.** Instant on fibre: HTML 9 KB in 60–90 ms, everything drawn in ~0.7 s, changing province takes ~0.1 s. The weight is in `cells.json` (1.18 MB compressed, 1.4 s on this connection). On 3G it would be several seconds; I could not verify whether there is a loading indicator during that wait.

---

## 2. Real bugs

Ordered by damage. All reproduced; the lines cited are from `deploy/app.js`.

### B1. The headline number compares 14 days against the median of the whole month

- **Steps:** open `https://spaceapps.geofuego.com.ar/#lang=en&aoi=ar` on a 14th of the month.
- **Shown:** `Nov 2026 · month to date — 6,465 — 41 % below the median · median 10,936 (25 years)`.
- **Why it is wrong:** 10,936 is the median of complete Novembers (`renderNow`, line 242: `hist` takes `A.H` of the whole month). At a proportional pace, 14 days out of 30 are equivalent to ~5,100; 6,465 is **~27 % above**, not 41 % below. The `Jan–Nov` card carries the same bias (10.5 months against 11).
- **Consequence:** it is the first thing anyone reads and it says the opposite of what is happening. It meets the letter of R4 (it has the "month to date" label) and violates its spirit. In addition the colour comes out green ("down").
- **Fix:** in the current month do not show the percentage. Show `6,465 so far (14 of 30 days) · a full November is typically 10,936`, without colour. Alternative if there are historical daily data: median at the same date. Screenshot `01`, `15`.

### B2. The shared link of a large rectangle opens another area

- **Steps:** country view → rectangle tool → draw over the NEA an area of more than 400 cells → copy the URL → open it again.
- **Shown:** before `Selected cells (2155) · mostly in Santa Fe · Nov 4,093`; after reloading `Selected cells (400) · mostly in La Pampa · Nov 32`.
- **Cause:** `encodeSel`, line 499: `sel.cells.slice(0, 400)`. It cuts silently and keeps the 400 cells with the lowest ID (the southern ones).
- **Fix:** save the rectangle as `bbox=` (the hash reader already understands it, line 505) instead of the list of cells; for hand-edited selections, encode ranges. Along the way it brings the URL down from 2,000 characters to 60.

### B3. January 2012 appears as "observed (VIIRS)" and is mostly modelled

- **Steps:** `#lang=en&prov=San%20Luis`, hover the mouse over Jan 2012.
- **Shown:** `805 VIIRS-equivalent hotspots · observed (VIIRS) · ◆ partly modelled (satellite outage, 200 %)`. In Corrientes: `observado (VIIRS) · 29 %` [observed (VIIRS) · 29 %], while the CSV of the same area says `reconstructed_share 0.87, gap_fill_share 0.29`.
- **Cause:** line 269, `kind: y >= 2012 ? 'obs'`; and `gap / v` without a cap.
- **Why it matters:** R10 asks to treat January 2012 as reconstructed. Today it comes out without a range and with an observed label, and a percentage of 200 % is impossible.
- **Fix:** if `recon/v > 0.5` → label "reconstructed" and range; cap the percentage at 100.

### B4. The CSV breaks in the 2026 rows

- **Steps:** any area → CSV → open in Excel or `pandas.read_csv(comment='#')`.
- **Shown:** header of 15 columns; 2026 rows with 17. Example: `2026,9,3440.2,,,VIIRS NRT S-NPP-eq (NOAA-20/0.979, NOAA-21/0.951),A,2000,0,0,,,4.3,,preliminary, month to date through 2026-09-30; days…`.
- **Cause:** line 434, two fields with a comma and without quotes.
- **Other defects of the same file:** (a) no BOM: Excel shows `Â·` and `â€"` in the comment lines; (b) the header says `baseline 2000–2025` and the screen `baseline: 2001–2025`; (c) it ignores the chosen date range without saying so; (d) with Excel in Spanish the comma separator and the decimal point are not interpreted on their own.
- **Fix:** put every text field in quotes; BOM `﻿` (U+FEFF); unify the baseline year.

### B5. Inverted date range: empty screen and "undefined–undefined"

- **Steps:** `#lang=en&prov=San%20Luis` → From = June 2022, to = March 2010.
- **Shown:** empty calendar, cards with "—", legend `many (0)` and the note `baseline: undefined–undefined`. No message. Screenshot `06`.
- **Variant:** typing by hand From 1990 and to 2030 leaves "Which years burned most" and "Which months" empty.
- **Fix:** if `from > to`, swap them; clamp to `min`/`max` when reading.

### B6. Mobile: the map panel stays stuck and the content passes over it

See section 5. One-line cause in `app.css`.

### B7. Minor

| # | What | Where |
|---|---|---|
| a | The finished months of 2026 say "month to date" (`Jan 2026 · preliminary, near-real-time, month to date · data through 2026-01-31`). Line 250 has both branches of the ternary identical. | tooltip, card |
| b | `1 cells` / `1 celdas` [1 cells]. | subtitle |
| c | With the "show greyed years" toggle activated, the banner still says "greyed and excluded… by default (toggle to show them)". Screenshot `09`. | banner |
| d | In large areas "show greyed years" does nothing and is not disabled. | toggle |
| e | The date range and the two toggles are not saved in the hash: the shared link loses that part of the state. | hash |
| f | With range 2015–2020 the banner still says "Full calendar, all years". | banner |
| g | `0 · 5th highest of 15 years · median 0 (14 years)`: 15 against 14 on the same line, and a zero ranked fifth. | card, level C/D |
| h | "Go" with the fields empty does nothing and gives no warning. A point outside the grid leaves the province dropdown at "—" although the province is still on screen. | controls |
| i | In Spanish these remain in English: `<title>`, "Draw a rectangle", "Click and drag to draw rectangle", "Cancel", the `aria-label` of the charts and the acknowledgement sentence to FIRMS. | i18n |
| j | Santa Cruz and Chubut show at the same time "tier A · Full calendar, all years" and "one tier stricter… not comparable across 2012". | banners |
| k | In Tierra del Fuego the "borrowed factor" appears twice in a row, and the second banner names the Ciudad de Buenos Aires. Screenshot `11`. | banners |
| l | The legend of the series shows `p90 140 · p10 140` in observed months (equal to H): it looks like a zero-width range. It should be "—". | series |

**Discarded as a bug:** a "San Luis" label that seemed to be left hanging on the map was the tooltip of the still pointer. And the test tab once jumped to spaceappschallenge.org: the app has no link there; it was another process using the same browser.

---

## 3. UX frictions

### Blocking

1. **The current-month percentage misleads** (B1). Fix above.
2. **Nothing explains the problem or the result.** A judge does not see on screen why this exists. Fix: a one-line strip under the header, always visible:
   - EN: `Before 2012 Argentina's fire record comes from MODIS; since 2012 from VIIRS, which sees about 3 fire pixels where MODIS saw one. This app puts both on the same scale so you can compare this season with any year since 2000.`
   - ES: `Hasta 2012 el registro de focos de Argentina viene de MODIS; desde 2012, de VIIRS, que ve unos 3 píxeles de fuego donde MODIS veía uno. Esta app los pone en la misma escala para comparar esta temporada con cualquier año desde 2000.`
3. **Mobile unusable** (section 5).
4. **The series with the range —the central proof of the work— is two screens down** (y = 1,248 px on a 768 laptop) and the band is barely distinguishable from the background. Fix: move it above the calendar or beside it, give the band a visible fill (orange at 25–30 %) and mark 2012 with a vertical line labelled `VIIRS starts`.

### Annoying

5. **"Fixed heat sources" produces no visible change:** the chart appears at the bottom of the page (screenshot `05`). Fix: insert it below the calendar or scroll to it.
6. **The date filter changes the median of "This month" without warning** (25 years → 6 years when choosing 2015–2020). Fix: have the range affect only calendar and series, or label `median of 2015–2020 (your date range)`.
7. **The selection is barely visible on the map:** thin orange outline without fill, no marker on the entered point (screenshot `10`); after drawing a rectangle in country view the map does not zoom to the area (screenshot `07`). Fix: fill at 25 %, marker, `fitBounds`.
8. **▲ ◆ markers illegible and without touch.** 3–4 px; the detail only appears on hover. In San Luis 2001 there are ▲ in 5 of 12 months: so many that they stop informing (R9 already suggested raising the threshold). Fix: double the size and open the detail on click as well.
9. **Card colours without a legend**, and the orange paints a zero as "high". Fix: arrow and word (`▼ below normal`) and no colour when the median is less than 10.
10. **Header and footer eat 24 % of a laptop** (122 + 62 px of 768); the calendar shows 6 rows. Fix: one-line footer with a collapsible "About / data sources".
11. **Native `alert()`** for a point outside the grid. The Malvinas (-51.7, -59.0) return "Punto fuera de la grilla de Argentina" [Point outside the Argentina grid], with a province whose title is "…e Islas del Atlántico Sur" [… and South Atlantic Islands]. Fix: inline message `No hotspot data for this point (outside the mainland grid).`
12. **The header links open in the same tab.** Fix: `target="_blank" rel="noopener"`.
13. **The "reconstructed" years top almost all the rankings** (San Luis: 2003, 2002, 2001, 2009 before 2020). Without explanation it looks as if the method inflates the past. Fix, next to the list:
    - EN: `Years before 2012 rank high because fire activity really was higher then: the raw MODIS record, with no conversion, falls by the same amount after 2011.`
    - ES: `Los años anteriores a 2012 quedan arriba porque de verdad hubo más fuego: el registro MODIS crudo, sin conversión, cae lo mismo después de 2011.`

### Cosmetic

14. Series legend `month / H / p90 / p10`. Fix: `Hotspots / range high / range low`.
15. "Where it burns": two percentages per bar (`12.7 % · 10 %`) with the key in grey at the bottom. Fix: label `2000–2025: 12.7 % · 2026: 10 %`.
16. The fixed-sources chart has a single axis number ("41").
17. "SI assistance": a judge reads "SI" and does not know what it is; the form asks about AI use. If the acronym is the team's decision, expand it the first time: `SI (super intelligence, i.e. AI) assistance`.
18. "Clear" goes back to "Whole country", it does not clear. Rename `Reset`.
19. No `og:title` / `og:image`: the link pasted in a chat or form comes out without a preview.

---

## 4. Texts: terms a non-expert does not understand

**Answer to the three questions of the brief.** Does it explain what a "VIIRS-equivalent hotspot" is? Halfway: it says what it is *not* (neither fires nor area) but not what "equivalent" means. Does it explain the band? Yes numerically ("about 1 month in 5 falls outside it"), which is the best sentence in the app; it does not say where it comes from nor that it applies only before 2012 until you open the dropdown. "Factor borrowed"? No: it never says factor of what. Does one come out knowing what to do? No: there is not a single usage sentence.

| Term on screen | EN gloss | ES gloss |
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
| lower bound / cota inferior [lower bound] | At least this many; some days had fewer satellites reporting. | Como mínimo esta cantidad; algunos días reportaron menos satélites. |
| baseline | The years used as "normal" for the comparison. | Los años que se toman como "lo normal" para comparar. |
| median | The middle year: half the years had more, half had less. | El año del medio: la mitad de los años tuvo más, la mitad menos. |
| inter-quartile range | The range the middle half of the years fell in. | El rango donde cayó la mitad central de los años. |
| no MODIS detection | The old satellite saw nothing here; small fires may have burned unseen. | El satélite viejo no vio nada acá; pudo haber fuegos chicos que no detectó. |
| ENSO (in "How to read") | El Niño / La Niña years. | Años de El Niño / La Niña. |
| calibrated out of sample | Checked against years the method had not seen. | Verificado contra años que el método no había visto. |
| region: NEA / Centro | Fire-regime region used to group provinces. | Región de régimen de fuego usada para agrupar provincias. |

**Missing usage sentence** (above the cards):
- EN: `Use it to answer: is this month above or below normal here, which years were worst, and when does the season peak.`
- ES: `Sirve para responder: ¿este mes viene por encima o por debajo de lo normal acá?, ¿qué años fueron los peores?, ¿cuándo es el pico de la temporada?`

---

## 5. Mobile at 390 px

Measured at 390×844. Screenshots `12`, `13`, `14`.

1. **The content is drawn on top of the map.** When scrolling, the calendar and the series pass over the controls panel and the map, which stays fixed. **Cause:** in `app.css` the media query on line 18 (`.map-panel { position:static }`, `#map { height:380px }`) is *before* the base rules on lines 20–21 (`position:sticky`, `height:520px`), which override it. **Fix:** move the media query below those rules. Five minutes.
2. **The logos cover the title.** The Space Apps globe falls over "GEOFUEGO" and "Harmonization".
3. **49 % of the screen is left for the content.** Header 280 px, footer 151 px (fixed, 11 px font), useful area 413 px. Fix: on mobile, `body { overflow:auto; height:auto }`, hide the header paragraph and collapse the footer.
4. **Everything is cut off 25–38 px on the right** and horizontal scrolling is not possible: the grid column measures 408 px on a 390 screen. One reads "click the cells you" and it cuts off. Fix: `grid-template-columns: minmax(0, 1fr)`.
5. **Illegible calendar:** the 900 px canvas shrinks to 352; the years and the markers cannot be read.
6. **No touch tooltips:** the detail of each month depends on `mousemove`. I did not test it with a real finger.
7. **Small buttons:** CSV 49×25 px, 13 px checkboxes, zoom 30×30 (the recommended size is 44).
8. **The map traps the gesture:** 469 px high inside an area of 413; dragging moves the map instead of the page.

A manager in the field opens this on the phone. Today they cannot use it.

---

## 6. As a judge: do I believe it?

**Halfway. I believe there is serious work behind it; the screen does not prove it to me.**

**What gives me confidence without reading anything else:** the explicit negations ("not a number of fires and not burned area", "not an alert system"); "about 1 month in 5 falls outside it"; each month labelled as observed or reconstructed; grey years with their reason; DOI and code one click away; clean console; instant response.

**What takes it away:**

- The month headline is biased (B1) and I discover it with a rule of three.
- January 2012 "observed" with "200 % modelled" (B3).
- No accuracy number on the screen. The README has 3.2 % country / 9.8 % province and the range tested in 2024–2025; the app, nothing.
- I don't see the before and after. The figure that sells the work (the false 3× jump in 2012 against the harmonized series) is in the README and not in the app.
- The reconstructed years lead the rankings without explanation.

**What I need to see to believe without opening the README:**

1. **A "How was this calculated?" one click away**, open by default the first time, with three lines: `Conversion factor per 25 km cell and calendar month, fitted on the days both satellites flew (2012–2023).` · `Tested on years left out: season totals off by 3 % for the country, 10 % for a province, 30 % for a single cell.` · `The 80 % range was checked on 2024 and 2025, never used to build it: it held 73–81 % of the time.`
2. **A "raw vs harmonized" toggle on the series**, which draws raw MODIS + raw VIIRS with the 2012 step. It is the demonstration of the challenge in one gesture.
3. **The band visible** and a line at 2012.
4. **The most important limit next to the data**, not in the dropdown: `Nothing independent can check 2000–2011; the estimate holds if the MODIS–VIIRS relation of 2012–2023 held before.` Saying it on screen adds credibility.
5. **The DOI as a copyable citation**, not just a chip.
6. **Date and source of the data** next to the number: `NASA FIRMS, updated 2026-11-14`.

### Visible compliance with R1–R13

| Rule | Status | Evidence |
|---|---|---|
| R1 geometry | **Complies** | Snaps to cells, shows count and km²; "smaller than one cell" banner verified. Thin outline (friction 7). |
| R2 levels | **Complies** | A (San Luis 120), B (Misiones 59), C (9 cells: baseline 2012–2025, zero = "no MODIS detection"), D (1 cell: grey, no ranking). The letters A–D are not explained. |
| R3 range | **Partial** | Lower bound ≤ value in all cases seen; in C/D the zero goes without range and with a label. At level A a pre-2012 zero comes out without range and without the label. Which bins it uses is not verifiable from the screen. |
| R4 baseline | **Letter yes, spirit no** | C/D use 2012–2025 and say so; ranking when the median < 10. But the current month is compared with full-month medians (B1). |
| R5 Terra only | **Complies in what is visible** | Hatching at level A, 2000 never ranked, 2002 marked. The exclusion of that era in the B–D baselines cannot be confirmed: Misiones (B) says "25 years · 2001–2025". **Review.** |
| R6 fixed sources | **Complies** | Separate series from 2012, labelled; banner in Neuquén 56 %, Santa Cruz 28 %, TdF 18 %, CABA 70 %. |
| R7 Tierra del Fuego | **Complies** | Only 2012 →, with banner. |
| R8 southern Patagonia | **Partial** | Banner present in Chubut and Santa Cruz, contradictory with "tier A · Full calendar" (B7-j). |
| R9 clouds | **Partial** | Marker and sentence, without percentage. The bias warning is missing when the current month is cloudy: the 2026 months carry no cloud flag. Threshold not raised. |
| R10 gaps | **Does not comply** | Marker and percentage >10 % yes; January 2012 is still shown as observed and a 200 % appears (B3). |
| R11 assigned factor | **Complies, badly worded** | Banner in TdF and CABA; column in the CSV. Duplicated and unexplained (B7-k). |
| R12 current year | **Complies** | Preliminary label, ⚠ with fewer than three satellites. The "± 5 %" only in the dropdown. |
| R13 downloads | **Partial** | It has all the requested columns; the 2026 rows are malformed and the header baseline does not match (B4). |
| §3.3 mandatory texts | **Complies** | The five texts appear verbatim, in 12 px grey font. |

Summary: 7 comply, 5 partial, 1 does not comply (R10).

---

## 7. Top 5 changes for Presentation and Impact

| # | Change | Improvement | Effort |
|---|---|---|---|
| 1 | **Fix the month headline** (B1): remove the percentage of the current month, show "so far, N of 30 days" against the typical month. | Impact and credibility: it is the first number the judge reads and today it is wrong. | 30 min |
| 2 | **"raw vs harmonized" toggle** on the series, with the 2012 step, vertical line and visible band; move the series up. | Presentation: shows the challenge solved in one gesture. It is what the judge remembers. | 2–3 h (raw national and provincial MODIS and VIIRS must be added to the payload) |
| 3 | **"What it is / what it is for" strip + "How was this calculated?" panel** with the three validation numbers and the 2000–2011 limit. | Presentation and Impact: the judge believes without opening the README; the manager knows what to ask. | 1 h (text only, EN/ES) |
| 4 | **Mobile:** move the media query, `minmax(0,1fr)`, header and footer collapsed, tooltips on click. | Impact: the real user opens it on the phone; the judge can too. | 1–1.5 h (the fix that unblocks the overlap is 5 min) |
| 5 | **Integrity of what is shared:** hash with `bbox`, dates and toggles (B2, B7-e); CSV with quotes and BOM (B4); January 2012 as reconstructed (B3); inverted range (B5). | Credibility before a judge who tests the link and downloads the CSV. | 1.5 h |

If one hour is left: 1, the 5-minute mobile fix, and the text of 3.
