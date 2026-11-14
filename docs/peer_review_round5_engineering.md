# Peer review, ronda 5 — ingeniería y reproducibilidad

**Esta revisión la escribió un sistema de SI (Claude Fable 5.2, Anthropic) en el rol de ingeniero de datos NASA/CONAE que recibe el repo y decide si es reproducible, confiable y publicable; no es la opinión de un experto humano.**

Commit auditado: `71a9af8` (2026-11-14 18:08 −03). Entorno: macOS arm64, Node 24.22.1, npm 11.19.1, Python 3.9.6 (numpy 2.0.2, matplotlib 3.9.4, netCDF4 presente, cdsapi ausente). Clon limpio en `/tmp/r5-repro` y un segundo clon virgen en `/tmp/r5-clean`. La working copy no se tocó salvo este archivo.

## Veredicto

El núcleo numérico es determinista y reproduce: con los CSV crudos de FIRMS y los NetCDF de ERA5 presentes, `npm run build` termina en 74 s y regenera `cells.json`, `cells.json.gz`, `harmonized_cells.csv` y `harmonized_provinces.csv` **byte a byte** (mismo sha256 que lo versionado). Eso es mejor que el promedio de un hackathon por mucho.

No es publicable todavía por cuatro motivos, ninguno de fondo: el DOI no resuelve, el repo de GitHub no es público, un clon limpio no puede regenerar el producto principal sin bajar ~1 GB con dos credenciales, y cuatro archivos de validación versionados están desactualizados respecto del código actual. Además hay cinco números del README que ningún script emite o que ya no coinciden con la salida.

---

## 1. Reproducibilidad

Qué corrí y qué pasó, en orden de README:

| paso | clon limpio, sin red | con crudos + ERA5 enlazados |
|---|---|---|
| `npm install` | OK, 0 dependencias, 0 vulnerabilidades; **crea `package-lock.json` sin trackear** | — |
| `npm run fetch` | no corrido (red; ERA5 exige `~/.cdsapirc` y `cdsapi`, que no estaba instalado) | — |
| `npm run build` | **falla en el 2.º paso** (`03a`: `ENOENT data/raw/modis_2000_Argentina.csv`) | OK, 74 s |
| `02_grid`, `04_factors`, `05_loyo`, `05c`, `05g` sueltos | OK (1 + 0,4 + 9 + 5 + 12 s); salidas idénticas salvo `generated` | ídem |
| `06_harmonize` | corre, **pero el resultado difiere** (ver H1) | **idéntico, sha256 `bd5b76b2…` / `25232d32…` / `76c2aa09…` / `f294551a…`** |
| `npm run validate` | `05_loyo --ablation`, `05b`, `05d`, `05e` OK; `05f` y `audit_static_sources` fallan sin insumos | OK, ~40 s; **4 salidas difieren de lo versionado** (H4) |
| `04b_bridge` | falla (`need S-NPP and at least one of NOAA20/NOAA21`) | OK, timestamp aparte idéntico |
| `audit_flare_start_year` | falla | OK, idéntico |
| `npm run figures` | — | OK, 2 s; `headline` y `ablation` idénticos, los otros 3 PNG cambian |
| `npm run live` | falla (`ENOENT ~/.config/nasa/firms-map-key`) | no corrido (red + clave; depende de la fecha) |
| `npm run app` | **falla fuera de esta máquina** (H3) | — |
| `npm run app:serve` | sirve la app, con dos defectos (H12) | — |

Ningún script se acercó a 15 min. El más lento es `05_loyo --ablation` (15 s).

### H1 — BLOQUEANTE. Un clon limpio no puede regenerar el producto principal, y el README dice que sí
- **Evidencia.** `.gitignore:12-13` excluye `data/agg/cloud_cells.json` y `precip_cells.json`. `06_harmonize.mjs:96` los lee con `try/catch` y sigue sin ellos: imprime `cloud_cells.json not found: no obscuration flag` y sale con código 0. Resultado en clon limpio: `cells.json` pierde el bloque `cl`, los CSV pierden `cloud_anom`/`cloud_underdetection`, el `.gz` pasa de 1 148 341 a 537 890 bytes. `git diff --stat`: 298 479 líneas cambiadas. Copiando ese único archivo desde la máquina del autor, los cuatro hashes cierran.
- **Por qué importa.** Falla silenciosa: un tercero obtiene un producto distinto, sin error, y no tiene cómo saberlo. Y el README (línea 7) afirma "Every number below is reproduced by the scripts in this repository".
- **Fix.** (a) Versionar `cloud_cells.json` comprimido (35 MB → 9,1 MB con gzip; menos si se redondea a 3 decimales) y `precip_cells.json` (12 MB), o subirlos a Zenodo y que un `scripts/00_get_inputs.mjs` los baje verificando sha256. (b) Que `06` falle con código ≠ 0 si falta el insumo, salvo `--no-cloud` explícito. **Esfuerzo: 1 h.**

### H2 — BLOQUEANTE. El DOI no resuelve y el repositorio no es público
- **Evidencia.** `curl -sIL https://doi.org/10.5281/zenodo.24220107` → `404`; `https://zenodo.org/api/records/24220107` → `{"status": 404, "message": "The persistent identifier is not registered."}`. `https://github.com/germankovacevic-lab/geofuego-harmonization` → `404` sin autenticar (el remoto existe y `origin/main` = `71a9af8`, o sea que está privado). La app sí responde 200.
- **Por qué importa.** README, `CITATION.cff:6`, `deploy/index.html:27-28` apuntan a dos enlaces muertos. El README además dice "derived products are published in the Zenodo record" (línea 90). Un juez que hace clic en "Method & code" o "DOI" desde la app se queda sin nada.
- **Fix.** Publicar el depósito de Zenodo (con los insumos de H1 adentro) y pasar el repo a público antes de entregar. Si el DOI queda reservado hasta último momento, decirlo en el README ("DOI reservado, se activa al publicar"). **Esfuerzo: 1–2 h, depende de la subida manual.**

### H3 — ALTA. `npm run app` depende de una ruta privada del autor
- **Evidencia.** `scripts/08_app_payload.mjs:18`: `VENDOR = ~/.openclaw/data/spaceapps-vendor`. Con otro `HOME`: `ENOENT …/.openclaw/data/spaceapps-vendor/leaflet-1.9.4/leaflet.js`, código 1. Las librerías ya están versionadas en `deploy/vendor/`, así que la copia es redundante. Efecto colateral: el script muere antes de estampar la versión en `index.html`. Además `deploy/vendor/SHA256SUMS.txt:7` lista un `./README.md` que no existe (`shasum -c`: "1 listed file could not be read").
- **Fix.** Borrar el bloque de copia de vendor (o hacerlo opcional con `--vendor=`), y que `08` verifique `deploy/vendor` contra `SHA256SUMS.txt`. Sacar la línea del README fantasma. **Esfuerzo: 20 min.**

### H4 — ALTA. Cuatro salidas de validación versionadas están viejas respecto del código y los datos actuales
- **Evidencia** (regenerado vs `HEAD`, ignorando `generated`):
  - `data/validation/external_mcd64a1_annual.csv`: `hotspots_H` 2002 = 231 805 versionado vs 231 720 regenerado; 298 líneas cambian. `external_mcd64a1.json` generado 18:05Z; `cells.json` actual es de 19:32Z.
  - `data/harmonized/ha_per_hotspot.{csv,json}`: 184 líneas cambian (2.º decimal).
  - `data/validation/cloud_tests.json`: r 0,0223 → 0,0228; pendiente 0,241 → 0,247.
  - `data/validation/loyo_summary_ablation.json`: cobertura provincial del intervalo en 2024, 0,830 versionado vs 0,757 regenerado; 2025, 0,806 vs 0,728. Es el archivo de antes del cambio de bins por tamaño.
  - `figures/external_validation_Argentina.png` cambia por lo mismo.
- **Por qué importa.** Los titulares (0,98 / 3,12; r = 0,02) sobreviven al redondeo, pero el repo publica artefactos que el código ya no produce. El `loyo_summary_ablation.json` versionado contradice al `loyo_summary.json` versionado en la misma métrica.
- **Fix.** Correr `npm run build && npm run validate && npm run figures` una vez y commitear. Después, H15 para que no vuelva a pasar. **Esfuerzo: 15 min.**

### H5 — ALTA. `audit_static_sources.mjs` no es determinista
- **Evidencia.** `scripts/audit_static_sources.mjs:47`: `if (st || Math.random() < 0.05)` — muestreo ×20 de las detecciones de vegetación, sin semilla. Cuatro corridas de `by_province_viirs_share_static` (Neuquén / Santa Cruz / Tierra del Fuego): versionado 0,571 / 0,292 / 0,210; corridas 0,586 / 0,251 / 0,222; 0,583 / 0,258 / 0,250; 0,589 / 0,249 / 0,255. Santa Cruz oscila 4 puntos, Tierra del Fuego 4,5.
- **Por qué importa.** Es el único script con azar sin semilla (`05c` y `05g` usan un LCG con semilla 20261114, bien). Y esos porcentajes son justo los que el README cita (ver H7).
- **Fix.** Sacar el muestreo: el script entero tarda segundos y `provinceOf` sobre todas las filas es barato; o reusar el LCG con semilla. **Esfuerzo: 15 min.**

### H6 — MEDIA. El README no le alcanza a un extraño
Lo que tuve que deducir leyendo código:
1. No hay sección de instalación: falta `pip install -r requirements.txt`. El README dice "Python 3 (numpy, matplotlib)" (línea 82), pero `03c`/`03d` necesitan `netCDF4` y `01d`/`01e` necesitan `cdsapi`.
2. `npm run all` necesita **dos credenciales** (FIRMS MAP_KEY y clave CDS). La de FIRMS se nombra solo para `01b`; `07_live` también la usa. La ruta `~/.config/nasa/firms-map-key` está fija en código, sin variable de entorno alternativa.
3. `npm run all` no corre `fetch:bridge` ni `bridge`, pero el README lista `04b_bridge` dentro de la pipeline. `07_live` depende de `bridge.json`.
4. La lista de pasos del README omite `01b`–`01e`, `03c`, `03d`, `05f` y los dos `audit_*`.
5. No dice cuánto pesa la descarga (README: "≈ 1 GB"; medido: 600 MB de CSV + 59 MB de ERA5), cuánto tarda, ni qué pasos se pueden correr sin red.
6. No dice que `npm run app` reescribe `deploy/index.html` (el árbol queda sucio en cada corrida) ni que todas las salidas JSON llevan un `generated` que cambia.
7. `npm install` no hace nada (cero dependencias) y deja un `package-lock.json` sin trackear.
- **Fix.** Sección "Reproduce" con tres niveles: (A) sin red, desde los intermedios versionados: qué comandos y qué hashes esperar; (B) con crudos de Zenodo; (C) desde FIRMS/CDS con claves. Tabla paso → insumos → salidas → tiempo. **Esfuerzo: 1 h.**

---

## 2. Coherencia README ↔ código ↔ datos

Rastreé 16 números. Origen = archivo de salida regenerado en el clon.

| # | README | origen | regenerado | estado |
|---|---|---|---|---|
| 1 | error de temporada 3,2 / 9,8 / 30 % (escalar 8,9 / 15,0 / 34) | `loyo_summary.json` → `summary[TA]` | 0,0319 / 0,0977 / 0,2956 (0,0887 / 0,1502 / 0,3421) | ✔ |
| 2 | ventanas partidas 0,965 y 0,992 (Terra 0,93 / 1,01) | `loyo_summary.json` → `split_window` | 0,965 / 0,992 (0,925 / 1,006) | ✔ |
| 3 | 2024 / 2025 predicho/observado 1,044 / 1,024 (Terra 0,88 / 0,75) | `forward_test` | 1,044 / 1,024 (0,88 / 0,754) | ✔ |
| 4 | intervalo en 2024/2025: celdas 80 / 77, provincias 76 / 73, país 10 y 11 de 12 | `forward_test.*.interval_coverage`, `size_bins_test.json` | 80,5 / 76,9; 76,2 / 73,3 (n 206); 0,833 / 0,917 | ✔ |
| 5 | áreas de 2–9 / 10–49 / 50–199: 81 / 80 / 77 y 77 / 74 / 73 | `size_bins_test.json` → `forward_coverage` | 81,2 / 79,8 / 77,1 y 76,6 / 73,6 / 73,2 | ✔ |
| 6 | 0,98 armonizado vs 3,12 ingenuo | `external_mcd64a1.json` → Argentina | 0,975 / 3,118 (MODIS crudo 0,984) | ✔ |
| 7 | 1 628 celdas (204 + 469 + 955) | `static_cells.json` → `n`, `by_rule` | 1 628; 204 / 469 / 955 | ✔ |
| 8 | puente g = 0,979 / 0,951 | `bridge.json` | 0,979 / 0,951 | ✔ |
| 9 | prueba hacia atrás 0,94–1,04; q80 0,21 | `backward_test_2003_2011.summary` | 0,943–1,038; 0,215 | ✔ (0,215 redondea a 0,22) |
| 10 | cobertura país 89 · provincia 79 · celda 81; Neuquén 77, Chubut 71 (n 35) | solo en el log de `05_loyo` ("regional band test", `region×class`) | 88,9 / 79,3 / —; 77,3 / 71,4 | ✔ pero **no está en ningún JSON con ese nombre**; `band_coverage.by_level` del mismo archivo dice 0,91 / 0,809 / 0,80 |
| 11 | 1,48 MODIS crudo, 1,41 armonizado | salida de `fig_headline_series.py` | 1,48 / 1,41 | ✔ (solo en stdout) |
| 12 | 3,0 % de los hotspots en la clase estática | — | derivable de `country_year.csv`: (Vs+Ts+As)/total = 2,99 % | ⚠ ningún script lo emite |
| 13 | **44,5 %** de celdas-mes VIIRS sin detección MODIS, 7 % de hotspots; 67 % y 20 % solo Terra; y la curva 45 / 37 / 23 / 10 % para 1 / 4 / 25 / 100 celdas | — | lo recalculé a mano desde `counts.json`: 44,9 % / 7,2 % / 67,1 % / 20,3 % | ✘ **ningún script lo emite**; la curva por tamaño no la pude reproducir |
| 14 | ENSO **r = −0,37** mensual | `enso_tests.json`, TEST 1 | Argentina mensual **−0,303**, anual −0,354 | ✘ número de `docs/audit_2026-11-14.md:45`, anterior al cambio de regiones |
| 15 | Neuquén 56 %, Santa Cruz 28 %, **Tierra del Fuego 24 %** en la clase estática | `audit_static.json` (ruidoso, H5) o `harmonized_provinces.csv` | CSV: 56,3 / 28,3 / **18,1 %**; auditoría: 57–59 / 25–29 / 21–25 % | ✘ TdF no sale de ninguna fuente; las dos definiciones no coinciden entre sí |
| 16 | nivel celda estimado en "30 % de las celdas-mes" | `factors.json` → `level` | TA: 14 261 / 50 316 = **28,3 %**; T: 17,6 % | ⚠ redondeo generoso |

### H7 — ALTA. Cinco números del README no salen de la pipeline
Filas 13, 14 y 15 (✘) y 12 y 16 (⚠) de la tabla. El 44,5 % está en el título de "Known limits" y en "Read first"; es de los números que un juez va a querer verificar.
- **Fix.** (a) Emitir los ceros estructurales desde `05c_aoi_error.mjs` (ya sortea bloques por tamaño) a `aoi_error_curve.json`. (b) Corregir ENSO a −0,30 o explicar la definición. (c) Elegir una definición de "share estático por provincia", calcularla exacta en `03_aggregate` y citar esa. (d) 30 % → 28 %. **Esfuerzo: 1,5 h.**

### H8 — MEDIA. Un resultado desfavorable medido y no reportado
- **Evidencia.** `size_bins_test.json` → forward, clase 200+: 2024 **75,8 %**, 2025 **63,7 %** con bins por tamaño (82,6 / 68,2 % con los bins `agg` que el README dice que se usan para 200+). El README reporta 2–199 celdas y provincias, y saltea la clase 200+.
- **Fix.** Una frase en la fila del intervalo: "200+ celdas: 83 % / 68 % (n 528)". Es coherente con la deriva orbital de 2025 que ya declaran. **Esfuerzo: 5 min.**

### H9 — MEDIA. Comentarios de código que contradicen el código o el README
- `06_harmonize.mjs:18` dice cobertura "country 90 %, province 82 %, cell 80 %; Neuquén 82 %, Chubut 80 %"; el README dice 89 / 79 / 81; 77; 71.
- `06_harmonize.mjs:86`: "added in quadrature"; las líneas 135 y 159 lo suman linealmente (`b10 -= es; b90 += es`), que es lo que dice el README.
- `06_harmonize.mjs:6`: cita `METHOD_DESIGN §2.3`; ese documento no está en el repo.
- README línea 16: "false 3× jump in 2012"; `fig_headline_series.py` imprime `naive splice step 2011→2012 = 2.33`.
- README línea 47: "no external services beyond the basemap tiles"; `deploy/_headers:7` habilita `static.cloudflareinsights.com` y la app en producción carga la baliza de Cloudflare Web Analytics.
- README: Tierra del Fuego "assigned"; en `harmonized_provinces.csv` alterna `assigned`/`estimated` mes a mes (2000-11 assigned, 2000-12 estimated). Es correcto por el umbral `ASSIGNED_W = 0.5`, pero el texto dice otra cosa.
- **Fix.** Pasada de 30 min sobre encabezados y README.

---

## 3. Calidad del código

Lo bueno, primero: cero dependencias npm, todo ESM con `node:` nativo; rutas relativas a `ROOT`; manifiesto con sha256 por archivo crudo; LCG con semilla en los dos scripts con muestreo que alimentan el producto; reglas y umbrales de la clase estática guardados dentro de `static_cells.json`; la clave de FIRMS se enmascara en el manifiesto (`<MAP_KEY>`) y en los mensajes de error (`07_live_2026.mjs:67`).

### H10 — MEDIA. Constantes duplicadas entre scripts
- `BINS = [1, 5, 15, 40, 100, 300, 1000, 3000, 1e12]`: `05_loyo.mjs:124` y `05g_size_bins.mjs:37`. `MIN_BIN = 30`: `05_loyo:148` y `05g:36`.
- `SEASON = [7,8,9,10,11]`: `05_loyo:44`, `05c:26`, `05e:26`.
- `Z = 1.2816`: `05_loyo:44` y `06:47`.
- Tabla `SEAS` de ONI y su parser: `05e:29`, `06:88`, `08:25`.
- LCG idéntico: `05c:27` y `05g:42`.
- Parser de CSV de FIRMS por posición de columna (`f[5]`, `f[12]`, `f[13]`, `f[14]`): repetido en `03_aggregate`, `03a`, `03b`, `04b`, `07`, y los dos `audit_*`. Si FIRMS cambia el orden de columnas, falla en silencio en siete lugares.
- Años `2012..2023` escritos a mano en `05c:25`, `05e:25`, `05f:23`, `05g:34` (en `04`/`05` son argumento).
- Clases de tamaño: `06` y `deploy/app.js:112` (`SIZE`), sin fuente común.
- **Fix.** `lib/constants.js` (bins, temporada, años, clases de tamaño, Z), `lib/firms_csv.js` (parser por nombre de columna con chequeo del header), `lib/oni.js`, `lib/rng.js`. **Esfuerzo: 2 h.** No lo haría antes de entregar: riesgo de romper hashes sin tests (H15).

### H11 — MEDIA. Números mágicos sin fuente
- `06_harmonize.mjs:95`: `CLOUD_SLOPE = 3.0` (medido −3,11 VIIRS / −2,92 MODIS en `cloud_tests.json`), `CLOUD_FLAG = 0.05` sin justificación.
- `06_harmonize.mjs:86`: `ENSO_SIGMA_BETA = 0.025`, "medido en 05e", copiado a mano.
- `07_live_2026.mjs:35`: `OPERATING_MIN = 5`.
- `04b_bridge.mjs:29`: `K = 20` (el motor usa `K = 10`), sin explicar la diferencia.
- `deploy/app.js:150`: umbrales de nivel 100 / 25 / 4; `app.js:296`: `gap > 0.10`.
- `lib/factors.js:34`: `CAP = 200`, `K_MIN = 5`, `K_ADD = 3`; el README dice "CAP is inert", entonces sobra.
- **Fix.** Que `06` lea β y la pendiente de nube de `enso_tests.json`/`cloud_tests.json`, o un comentario con archivo y campo de origen. **Esfuerzo: 45 min.**

### H12 — MEDIA. `app:serve` tiene path traversal y escucha en todas las interfaces
- **Evidencia.** `package.json:20`: `p.join('deploy', u)` sin normalizar y `.listen(8080)` sin host. `curl --path-as-is http://127.0.0.1:8080/../package.json` → `200`. Cualquiera en la misma red (la del hackathon) puede leer archivos fuera de `deploy/`. Aparte: `.svg` sale como `application/octet-stream` (falta en el mapa de tipos), y el README promete `http://127.0.0.1:8080/` pero se bindea a `0.0.0.0`.
- **Fix.** `.listen(8080, '127.0.0.1')`, rechazar si `path.resolve(x)` no empieza con `path.resolve('deploy')`, agregar `.svg`. O reemplazarlo por `npx wrangler pages dev deploy`, que además aplica `_headers`. **Esfuerzo: 10 min.**

### H13 — MEDIA. Manejo de errores de red desparejo
- `01_fetch.mjs:38-39`: un intento, sin reintento ni timeout; si falla sigue con el resto y deja `exitCode = 1`. No verifica el sha256 contra el manifiesto versionado: si FIRMS reprocesa un archivo, se pisa el hash y nadie se entera.
- `01c_fetch_aux.mjs:21,26`: `try/catch` que traga el error.
- `07_live_2026.mjs:57-67`: 4 reintentos con espera creciente y validación del header. Es el único bien hecho.
- `07_live_2026.mjs:70`: el `fetch` de disponibilidad no tiene reintento.
- `deploy/app.js:115`: `fetch('data/cells.json')` sin `catch`; si falla, la app queda en blanco sin mensaje. Los otros tres sí degradan.
- **Fix.** Mover `get()` de `07` a `lib/` y usarlo en `01`, `01b`, `01c`; en `01`, comparar sha256 contra el manifiesto y abortar si difiere salvo `--force`; mensaje de error visible en la app. **Esfuerzo: 1 h.**

### H14 — BAJA. Dependencias, lock y versión
- `requirements.txt`: cuatro paquetes con `>=`, sin fijar. `fig_factor_map` cambia bytes del PNG entre corridas/versiones.
- No hay `package-lock.json` versionado. Con cero dependencias es inocuo, pero `npm audit` falla en un clon limpio (`loadVirtual requires existing shrinkwrap file`). Tras `npm install`: `found 0 vulnerabilities`.
- `engines: node >= 20` ✔. No hay `.nvmrc`/`.python-version`.
- `version: 0.1.0` en `package.json` y `CITATION.cff` ✔ coherentes; **no hay tag de git** ni CHANGELOG.
- **Fix.** Fijar versiones de Python (`==`), commitear el lock, `git tag v0.1.0` en el commit que se deposita en Zenodo. **Esfuerzo: 15 min.**

### Encabezados de autoría / SI
- 35 de 36 archivos de código llevan `Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.` Falta en `lib/provincias.js` (datos IGN reutilizados, declarados; no es código generado, pero conviene una línea para que la frase del README "Each script carries the header" sea literalmente cierta).
- CSV publicados y `cells.json`: llevan la marca ✔. Intermedios: no, y el README lo declara ✔.
- Figuras PNG: sin marca; son gráficos de datos, no imágenes generativas. Aceptable; una línea en el pie no cuesta nada.
- Las revisiones de `docs/` lo dicen en la primera línea ✔.

---

## 4. Datos

- **Insumos mínimos sin red.** Versionados: `counts.json`, `coverage.json`, `static_cells.json`, grilla, ONI, tablas GWIS de Argentina. Alcanza para `04` → `05*` (idénticos). **No alcanza para `06`** (H1) ni para `03*`, `04b`, `05f`, auditorías.
- **Tamaños.** 78 MB trackeados; el mayor es `harmonized_cells.csv` (21 MB), bajo los límites de GitHub. `.git` pesa 97 MiB porque hay 8+ versiones de ese CSV en el historial. `cells.json` (9,7 MB) y `cells.json.gz` están los dos versionados: redundante. `data/validation/v1_before_audit/` y `factors_noregions/` suman ~18 MB de experimentos descartados.
- **Manifiestos.** `data/raw/MANIFEST.json` con url, bytes, sha256, filas y fecha por archivo ✔. `MANIFEST_aux.json` para ERA5 ✔. `data/external/gwis/SOURCE.md` con sha256 de los zip ✔. Falta el sha256 de `oni.ascii.txt` y la fecha de descarga.
- **Esquema.** Las columnas de los dos CSV se describen en prosa en el README y en líneas `#`. No hay diccionario de datos formal ni JSON Schema para `cells.json` (claves `h`, `cl`, `p`, valor `-1` = sin dato: hay que leer `app.js` para saberlo).

### H16 — ALTA. `CITATION.cff` no valida
- **Evidencia.** `cffconvert --validate -i CITATION.cff` → `ValidationError: Additional properties are not allowed ('notes' was unexpected)`. `notes` (`CITATION.cff:17`) solo existe dentro de `references` en CFF 1.2.0. GitHub no va a mostrar el botón "Cite this repository" y Zenodo puede ignorar el archivo.
- **Fix.** Renombrar `notes` → `abstract`. Agregar `type: dataset` o `software` y, si se quiere, `identifiers`. **Esfuerzo: 5 min.**

### H17 — ALTA. Citas de productos incompletas frente a lo que pide la guía
- DOI `10.5281/zenodo.24220107`: idéntico en README:7, `CITATION.cff:6`, `deploy/index.html:28` ✔ coherente (pero no resuelve, H2). En el pie de la app (`foot`) no figura; está como chip en el encabezado.
- **No aparecen en ningún lado los nombres de producto**: `MCD14ML`, `VNP14IMGTDL`/`VNP14IMG`, `VJ114IMG`, `VJ214IMG` (`grep` en README: cero resultados). Se dice "MODIS C6/6.1" y "VIIRS S-NPP/NOAA-20/NOAA-21".
- No se citan los DOI de producto: MCD14ML `10.5067/FIRMS/MODIS/MCD14ML`, VIIRS S-NPP `10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002` (y equivalentes NOAA-20/21), MCD64A1 `10.5067/MODIS/MCD64A1.061`. Verificar los identificadores exactos en la página de cada producto antes de pegarlos.
- FIRMS: frase de agradecimiento ✔, Giglio 2016 y Schroeder 2014 ✔ (README). ERA5: artículo + DOI de dataset + frase Copernicus ✔. MCD64A1: Giglio 2018 ✔. ONI: nombrado, sin URL ni fecha de acceso. IGN: nombrado, sin URL del WFS ni fecha.
- `CITATION.cff` → `references` tiene FIRMS, ERA5 ×2 y GFI; **faltan** Giglio 2016, Schroeder 2014, Giglio 2018, ONI, GWIS, IGN.
- El pie de la app nombra FIRMS, ERA5, ONI, IGN; **falta MCD64A1/GWIS** y la frase de agradecimiento de FIRMS.
- `MVP64` se baja y se versiona pero no se usa ni se cita.
- **Fix.** Tabla "Data sources" con columna producto + DOI + fecha de acceso; espejar en `CITATION.cff` y en el pie. **Esfuerzo: 45 min.**

---

## 5. Deploy y seguridad

- **`deploy/_headers`** ✔ sólido: CSP con `default-src 'self'`, `script-src 'self'` + Cloudflare Insights, `object-src 'none'`, `frame-ancestors 'none'`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. Verificado en producción con `curl -I`. Único punto flojo: `style-src 'unsafe-inline'` (lo exige Leaflet; aceptable).
- **`noindex` + `robots.txt Disallow: /`** ✔ coherentes. Ojo: con `Disallow` los buscadores no llegan a leer el `noindex`; para un entregable de hackathon da igual. Si después de la evaluación quieren que se encuentre, hay que sacar los dos.
- **Secretos en el historial** ✔ limpio. `git log -p --all -G'(MAP_KEY|token|secret|api_key|password|Bearer|PRIVATE KEY)'` sobre 68 commits: solo el marcador `<MAP_KEY>` y menciones a la ruta. Ninguna cadena hexadecimal de 32 caracteres en scripts, deploy, docs. Autor de los commits: dirección `noreply` de GitHub ✔.
- **`npm audit`** ✔ 0 vulnerabilidades (0 dependencias). Falla sin lockfile (H14).
- **Librerías vendoreadas** ✔ Leaflet 1.9.4 (BSD-2), Leaflet.draw 1.0.4 (MIT), uPlot 1.6.31 (MIT), cada una con su `LICENSE` y sha256 que verifican. `LICENSE` del repo: MIT + CC BY 4.0 para datos ✔.
- **XSS** ✔ el título del área usa `textContent`; el hash de la URL se parsea con `URLSearchParams` y `Number`. Hay varios `innerHTML` con cadenas propias de i18n; la CSP los cubre.
- **H12** (servidor de desarrollo) es el único hallazgo de seguridad real, y es local.
- **H18 — BAJA.** Teselas de Esri World Imagery: atribución presente ✔; conviene citar los términos de uso de Esri en la tabla de licencias (hoy solo aparecen en el `attrib` de la app). Y declarar Cloudflare Web Analytics en el README (H9). **Esfuerzo: 10 min.**

---

## 6. Qué falta para "Best Use of Data" / "Best Use of Science"

### H15 — ALTA. No hay ninguna prueba automática ni CI
- **Evidencia.** Sin `tests/`, sin `.github/`, sin `Makefile`, sin `Dockerfile`, sin `npm test`. H4 (salidas viejas) y H7 (números del README a la deriva) son la consecuencia directa: nada avisa cuando el código y los artefactos se separan.
- **Fix mínimo, 2 h:**
  1. `scripts/check_reproduce.mjs`: corre `04 → 05 → 05c → 05g → 06` en un directorio temporal y compara contra lo versionado quitando `generated`. Sale ≠ 0 si difiere. Es exactamente lo que hice a mano en §1.
  2. `scripts/check_readme_numbers.mjs`: una tabla `{número del README → archivo, campo, tolerancia}` con las 16 filas de §2. Sale ≠ 0 si alguno no coincide.
  3. `tests/` con `node --test`: `cellOf`/`cellBounds` ida y vuelta, `provinceOf` en 5 puntos conocidos, `fitFactors` sobre un juguete de 3 celdas (la contracción tiende al valor provincial cuando M → 0), invariantes del producto (`H_lo ≤ H ≤ H_hi`, suma de provincias = país, sin negativos, 4 193 celdas, 290 923 filas de datos).
  4. `.github/workflows/ci.yml`: `npm test` + los dos checks en cada push. Corre en menos de un minuto porque no necesita los crudos (una vez resuelto H1).

### Resto, por valor
- **`make reproduce` / Dockerfile** (alta, 1 h). `FROM node:22-slim` + `python3-numpy python3-matplotlib python3-netcdf4`; `make reproduce` = bajar insumos de Zenodo → `build` → `validate` → `check_reproduce`. Con eso la frase "every number is reproduced" pasa a ser un comando.
- **Sacar el timestamp de las salidas** (media, 30 min). 20 scripts escriben `generated: new Date()`; por eso cada corrida ensucia el árbol y hay que comparar con un filtro. Usar `SOURCE_DATE_EPOCH` o mover la fecha a un `RUN_MANIFEST.json` único con commit, versión de Node y sha256 de entradas y salidas.
- **Diccionario de datos** (media, 45 min). `docs/data_dictionary.md`: cada columna de los dos CSV con tipo, unidad, rango y significado de vacío; estructura de `cells.json` y `band_calibration.json`. Ideal: `datapackage.json` (Frictionless) o JSON Schema.
- **Notebook de ejemplo** (media, 45 min). `examples/aoi_quickstart.ipynb`: leer `harmonized_cells.csv` con `comment='#'`, sumar un área, pegarle el intervalo desde `band_calibration.json`, graficar. Hoy la receta del intervalo para un agregado es un párrafo del README que nadie va a implementar bien al primer intento.
- **CHANGELOG + tag** (baja, 15 min). `v0.1.0` en el commit depositado; el changelog puede salir de las secciones "response" de las rondas 1–4.
- **Metadatos de Zenodo** (media, 20 min). `.zenodo.json` con `related_identifiers` (`isDerivedFrom` → DOI de los productos FIRMS, ERA5, MCD64A1; `isSupplementTo` → repo; `isNewVersionOf`/`references` → GFI), `communities`, licencia doble (MIT código, CC-BY-4.0 datos), palabras clave.
- **Limpieza** (baja, 20 min). Mover `data/validation/v1_before_audit/` y `factors_noregions/` a Zenodo o a una rama; sacar `cells.json` sin comprimir o el `.gz` (uno solo); decidir si `MVP64` se usa o se va.
- **Formato abierto para la grilla** (baja). `harmonized_cells.csv` de 21 MB en formato largo es incómodo para un usuario de teledetección; un NetCDF/Zarr CF (tiempo × lat × lon, con `H`, `H_lo`, `H_hi`, banderas) o GeoParquet lo vuelve utilizable en xarray/QGIS de una. Es lo que más suma para "Best Use of Data" después de la reproducibilidad.

---

## Resumen de hallazgos

| # | severidad | hallazgo | esfuerzo |
|---|---|---|---|
| H1 | bloqueante | clon limpio no regenera el producto; `06` degrada en silencio sin `cloud_cells.json` | 1 h |
| H2 | bloqueante | DOI 404, repo GitHub 404 | 1–2 h |
| H3 | alta | `08_app_payload` depende de `~/.openclaw/data/spaceapps-vendor` | 20 min |
| H4 | alta | 4 salidas de validación versionadas viejas | 15 min |
| H5 | alta | `audit_static_sources` con `Math.random()` sin semilla | 15 min |
| H7 | alta | 5 números del README sin origen en la pipeline (44,5 %; −0,37; TdF 24 %; 3,0 %; 30 %) | 1,5 h |
| H15 | alta | sin tests ni CI | 2 h |
| H16 | alta | `CITATION.cff` no valida (`notes`) | 5 min |
| H17 | alta | faltan nombres y DOI de producto (MCD14ML, VNP14IMG, VJ114IMG, MCD64A1) | 45 min |
| H6 | media | README insuficiente para un extraño | 1 h |
| H8 | media | cobertura 200+ celdas en 2025 (64–68 %) no reportada | 5 min |
| H9 | media | comentarios y frases que contradicen el código | 30 min |
| H10 | media | constantes y parser duplicados | 2 h |
| H11 | media | números mágicos sin fuente | 45 min |
| H12 | media | `app:serve`: path traversal + `0.0.0.0` | 10 min |
| H13 | media | manejo de errores de red desparejo | 1 h |
| H14 | baja | versiones sin fijar, sin lock, sin tag | 15 min |
| H18 | baja | términos de Esri y Cloudflare Analytics sin declarar | 10 min |

## Las 10 acciones de mayor valor para las próximas 24 h

1. **Publicar Zenodo y abrir el repo** (H2). Sin esto, todo lo demás no se puede evaluar. Verificar después con `curl -sIL https://doi.org/10.5281/zenodo.24220107` y abriendo GitHub en una ventana privada.
2. **Versionar `cloud_cells.json.gz` (o bajarlo de Zenodo con sha256) y hacer que `06` falle si falta** (H1). Verificación: clon limpio → `node scripts/06_harmonize.mjs` → `shasum -a 256 data/harmonized/cells.json` = `bd5b76b2…`.
3. **Regenerar y commitear validación y figuras** (H4): `npm run build && npm run validate && npm run figures`, después de (4).
4. **Sacar el `Math.random()` de `audit_static_sources.mjs`** (H5).
5. **Arreglar los cinco números del README** (H7) y agregar la clase 200+ (H8): emitir los ceros estructurales desde `05c`, ENSO −0,30, Tierra del Fuego con una sola definición, 28 %.
6. **`CITATION.cff`: `notes` → `abstract`, y agregar las referencias que faltan** (H16, H17). Verificación: `cffconvert --validate`.
7. **Nombres y DOI de producto en README, CITATION y pie de la app** (H17): MCD14ML, VNP14IMG, VJ114IMG/VJ214IMG, MCD64A1, ONI e IGN con URL y fecha de acceso.
8. **Sacar la ruta privada de `08_app_payload.mjs` y arreglar `app:serve`** (H3, H12).
9. **`check_reproduce.mjs` + `check_readme_numbers.mjs` + un workflow de CI** (H15). Es lo que convierte la frase "every number is reproduced" en algo que un juez puede ver en verde.
10. **Sección "Reproduce" en el README con los tres niveles, `pip install -r requirements.txt`, las dos credenciales, tiempos y hashes esperados** (H6); `git tag v0.1.0` y `.zenodo.json` (H14).

Si sobra tiempo: notebook de ejemplo, diccionario de datos y NetCDF de la grilla, en ese orden.
