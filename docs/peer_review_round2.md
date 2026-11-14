# Peer review, round 2 — harmonization engine (data, method, validation, claims)

Scope: the harmonization work only (app, video and form are not built). All checks were done with print-only scripts on the committed files and by re-running the LOYO with `lib/factors.js`.

## 1. Verdict and provisional scores

This is a serious, unusually honest piece of work for a hackathon: a hierarchical ratio-of-sums factor, a separate class for persistent thermal sources, outage-aware pairing, a Terra-only era treated on its own, an S-NPP → NOAA-20/21 bridge, and a validation suite whose headline numbers I reproduced to the last digit. The weaknesses: (i) a real defect in the delivered series (January 2012), (ii) a band calibrated only in the pooled sense that under-covers badly in Patagonia, (iii) validation that interpolates inside the overlap while the product extrapolates 1–12 years before it, with a measurable trend in the ratio, and (iv) several README/docs statements the files do not support.  All are fixable in hours.

| Criterion | Score | Justification (data/method only) |
|---|---|---|
| Impact | 4 | A 26-year consistent series plus continuity after S-NPP is what a fire agency needs; one country only. |
| Creativity | 4 | Static-source class, Terra-only set, outage pairing and NOAA bridge go beyond "multiply by 3.5"; the factor itself is standard empirical Bayes. |
| Validity | 3.5 | Reproducible and self-critical; band heterogeneity, untested extrapolation, the Jan-2012 hole, no independent truth. 4.5 with items 1–5 of section 4. |
| Relevance | 4 | NASA FIRMS is the core and the objective is addressed literally; the app half does not exist yet. |
| Presentation | 3 | Candid but written as an audit log; a judge needs one figure and five numbers. Provisional until the demo exists. |

**Global Nominee bar:** on the science alone, yes: nominee-level locally and competitive globally. Blockers: no working app at submission (the challenge is a web application), a judge finding the January 2012 defect in the calendar, and over-stated sentences ("covers 80 % by construction", "factor per cell") that the team's own files falsify.

## 2. Strengths a judge would single out

- **Correct estimator.** Ratio of sums with log-space shrinkage avoids the Jensen bias of mean log-ratios; one shared fit function serves production and LOYO.
- **The Terra/Aqua insight.** A separate Terra-only set with strongly seasonal factors (7.0–15.1 by month, reproduced) and its own wider band.
- **Persistent thermal sources** separated, not deleted, with an independent audit (night fraction, FRP, FIRMS type-2 co-location) and a documented non-stationarity (V/M 3.6 → 13–26). The most original element; it materially changes Neuquén.
- **Self-audit culture.** Orbit-drift exclusion with a measured forward test, an ablation ladder (which honestly shows the Terra-only country×month step *worse* than a scalar), a negative ENSO result reported as negative.
- **Provenance.** sha256 manifest, DOI, SI acknowledgment in every script and data header, MCD64A1 correctly demoted to a consistency check.

## 3. Weaknesses, risks and errors

### 3.1 Re-computed numbers

| Claim | Source | My result | Status |
|---|---|---|---|
| LOYO season MAPE TA: country 3.3 %, province 10.4 %, cell 30 %; scalar 8.6 / 17.1 / 34 % | mean of 12 folds in `loyo_summary.json` | 3.26 / 10.39 / 30.03; 8.65 / 17.09 / 34.28 | agrees |
| Ablation 17.1 → 15.7 → 14.8 → 13.7 → 10.4 % | `loyo_summary_ablation.json` folds | 17.09 / 15.69 / 14.79 / 13.72 / 10.39 | agrees |
| Terra-only 5.8 % / 17.5 %, worst year 0.79 | folds | 5.75 / 17.50; 0.786 (2022) | agrees |
| Forward test TA 1.035 / 1.02, T 0.87 / 0.75 | `band_calibration.json` | 1.035 / 1.020, 0.873 / 0.748 | agrees |
| Factors: Neuquén Aug 4.41, Santa Cruz 6.91 (w 0.72), country Aug 3.03 | `factors.json` | 4.407, 6.907 (raw 238/26 = 9.0), 3.026 | agrees |
| 204 static cells, Neuquén 111, 78 rejected | `static_cells.json` | 204 / 111 / 78 (3 cells fall outside any province) | agrees |
| Bridge g = 0.980 / 0.951, 1 006 of 1 096 paired days | `bridge.json` | 0.9798 / 0.9508, 1006/1096 | agrees |
| Bridge provincial range NOAA-20 "0.94 (Formosa) – 1.03 (Misiones)"; NOAA-21 "0.92 – 0.99" | `bridge.json`, w > 0.99 | NOAA-20: **San Luis 1.163** (n = 8 460), Santa Cruz 0.931; NOAA-21: **Neuquén 0.889, San Juan 0.892** | **discrepancy** |
| Aqua/Terra "1.7–1.9 in 2003–2023" | `country_year.csv` | 1.54 (2014) – 1.92; 2024 2.23, 2025 2.46 | loose (2014, 2005, 2010–11, 2017, 2023 are below 1.7) |
| Argentina 2001 = 268 128; 2022 = 274 472 | sum of `harmonized_provinces.csv` | 268 128; 274 470 | agrees |
| "IC80 covers 80 % by construction" | my LOYO with the **final** band (`sigma_curve` by province cell count) | pooled province-months with V ≥ 30: 81.4 %; country 79.9 %; **Neuquén 40 %, Santa Cruz 46 %, Chubut 50 %, Río Negro 65 %**, Chaco 96 %; all non-zero province-months 69.7 %; all cell-months 35 % | **true only pooled and only above the count threshold** |

### 3.2 Defects in the delivered series

1. **January 2012 is a false low with zero uncertainty.** S-NPP data start on 20 Jan 2012; `03_aggregate` only gap-fills days after `start.SNPP`. The series reports 4 950 hotspots for the month, band [4 950, 4 950]; f·(T+A) for the full month is ≈ 19 900. A spurious −75 % minimum exactly at the sensor splice. Fix: treat 1–19 Jan 2012 as an S-NPP outage.
2. **Observed years carry σ = 0.** After 2012 the band is zero except on filled days, so the pre/post-2012 halves of the calendar are not statistically comparable objects. State it, or give VIIRS months a small band.
3. **Outage detector has a selection effect.** Dozens of single "outage" days for Terra fall in May–July of almost every year (winter, 10:30 pass, low counts). The Poisson-zero argument ignores overdispersion and cloud. Removing days where MODIS saw nothing while VIIRS saw fire biases f low; filling them from Aqua in 2002–2011 adds fire Terra legitimately did not see. Magnitude is small (V − Vp < 1 % per year except 2022). Keep only multi-day events confirmed by official outage records.

### 3.3 Statistical soundness

- **Interpolation vs extrapolation.** LOYO removes one year from the middle of the window; the product is applied before it. Split-window test (my run, TA): train 2012–2017 → 2018–2023 gives country pred/obs 0.96, 1.00, 0.92, 0.96, 0.85, 0.94 (mean 0.94); train 2018–2023 → 2012–2017 gives 1.04, 0.98, 1.06, 1.04, 1.04, 1.05 (mean 1.03); province season MAPE 12.5–13.9 %. The ratio rose ≈ 7–10 % between the two halves. Whether ENSO (La Niña 2020–22), early Terra drift or a collection change, the honest country-level error for 2003–2011 is ≈ 5–8 %, not 3.3 %.
- **ENSO is confounded with that trend.** The three La Niña years are consecutive and at the end of the window; leave-one-phase-out is the same experiment as the split above. The monthly p < 0.001 ignores autocorrelation (ONI is a 3-month running mean; effective n is far below 144). "Not adopted" is right; the causal reading is not established.
- **Band construction.** q80 of |log(V/P)| assumes a symmetric, homoscedastic multiplicative error. Residuals are neither: cell level has median bias +0.10 (TA) and +0.38 (Terra-only), and the Terra-only cell q80 = 3.219 is exactly log(12.5/0.5), i.e. more than 20 % of cell-months with V ≥ 10 have **zero** Terra detections. A multiplicative model cannot create fire where MODIS saw none: a structural limit, not "wide uncertainty". Selecting months on observed V ≥ threshold conditions on the outcome (use P, or all months). The band depends on the number of cells, not on the count, so a 500-hotspot month and a 12-hotspot month in the same province get the same relative width; hence 40 % coverage in Neuquén and 96 % in Chaco. Use p10/p90 of signed residuals binned by predicted count.
- **Inconsistent curve.** The σ curve jumps from 0.40 at 111 cells (random blocks, season ≥ 30) to 0.29 at "175 cells" (provinces, month ≥ 30): two populations on one axis. Provinces range from 1 to 531 cells, so Santa Cruz (281 cells, almost no fire) gets a *narrower* band than Tucumán (34 cells).
- **K selection.** K = 10 beat K = 20 by 10.4 vs 10.6 % on the same folds used to report skill; with fold IQR ≈ ±1.5 points this is noise, and K = 10 was the edge of the grid. Do not present it as an optimisation; `CAP` is inert.
- **"Factor per cell" overstated.** In `factors.json` 70 % of cell-months (35 331 of 50 316) have no cell-level estimate and inherit the province value. Say "cell where data allow (30 %), province otherwise".
- **Leakage (minor, declare it):** static mask, outage list, region table, T/A fill ratios, K and band quantiles all used every year, including held-out ones.
- **Region table is hand-made** and LOYO cannot distinguish it (declared). The Patagonia August regional factor is 3.47, below its own provinces (4.4–6.9), so the stated rationale fails in the month shown; Tierra del Fuego and CABA (M = 0) are pure prior.

### 3.4 Physics and data

- **Homogeneity of inputs.** The MODIS files are not one collection: the `version` column reads 6.2 (2001–2019), 6.03 (2020–2022) and 61.03 (2023–2025), while README says "C6.1". A processing change inside the calibration window may contribute to the trend above (FIRMS documentation check needed).
- **Terra-only era.** Good news the team has not reported: inside 2003–2011, f_T·T reproduces f_TA·(T+A) at country level within 0.94–1.04 per year (my run; province-year q80 |log| = 0.19). That is the backward test they list as "not done", and it supports 2001. Caveat: the same ratio averages 0.95 inside 2012–2023 (≈ 5 % era offset); Terra's 2000–2002 crossing time needs a literature check.
- **Unit.** VIIRS-equivalent pixel counts inherit scan-edge double detections and have no cloud/obscuration correction. A cloudy month reads as "below median". Day and night are pooled although the VIIRS/MODIS ratio differs between them.
- **Factor map.** A streak of f = 8–12 along the Paraná (≈ −60°, −32°) needs an explanation.
- **Static class.** NOAA-21/S-NPP for the static class is 0.75 (vs 0.95 for vegetation), unexplained.
- **MCD64A1.** Correctly reframed; it only detects a gross splice error. Only the national 0.97 is quoted; by province the ratio spans 0.53 (Río Negro) to 2.50 (Santa Cruz), tracking raw MODIS.
- **Bridge.** Sound and cross-checked (0.61 % data-path check, NRT 0.982); no uncertainty is carried into the live month and the provincial outliers above are unreported.
- **Scope.** Argentina only; transferability is not shown.

### 3.5 Reproducibility, licensing, stale text

No `package.json`/`requirements.txt`/run-all script; `01b` needs a private MAP_KEY path; `tmp/f2023/` is committed; `coverage.json` rule text ("sees ≥ 5") contradicts the code (expected ≥ 8); the `06_harmonize` and province-CSV headers describe the old band; `05c` header says medians form the curve (q80 is used); "IC80" is a Spanish abbreviation (use "80 % prediction interval"); the audit table shows 3.5 / 10.6 % next to README's 3.3 / 10.4 %; CITATION.cff licence says MIT only; confirm GWIS redistribution terms.

## 4. Ranked suggestions (impact per hour)

| # | What | Why / how | Expected effect | Effort |
|---|---|---|---|---|
| 1 | Fix January 2012 | Treat 1–19 Jan as S-NPP outage in `03_aggregate`/`06` | Removes a visible false minimum at the splice | 20 min |
| 2 | Split-window and backward tests | Add both block tests and the 2003–2011 Terra-only vs Terra+Aqua comparison to `05_loyo` | A defensible "3 % interpolated, 5–8 % extrapolated"; validates 2001 | 1 h |
| 3 | Count-aware, asymmetric band | Signed p10/p90 of log(V/P) binned by predicted count (5–6 bins) × set; report coverage per province and per fold | Coverage near 80 % everywhere, including Neuquén; kills the n-cells artefact | 2 h |
| 4 | Truth-in-labelling pass | Fix every item in 3.5; say "cell where supported (30 %)"; give the bridge outliers; state MODIS versions | Removes all easy judge attacks | 1 h |
| 5 | Zero-MODIS handling | Additive term: expected VIIRS count when M = 0 per cell-month, from the overlap | Removes the +0.10 / +0.38 low-count bias; meaningful small AOIs | 2 h |
| 6 | Day/night split factors | Fit f separately for D and N (column exists), sum | Likely gain in winter and Patagonia; physically motivated | 2 h |
| 7 | Second country without polygons | Run Paraguay or Uruguay with cell → 1° block → country pooling | Demonstrates generality, answers "Argentina only" | 2–3 h |
| 8 | Outage list from official records | Keep only multi-day events confirmed by mission status pages | Removes selection bias, simpler story | 1 h |
| 9 | Land-cover covariate | Pool cells by land-cover class (MCD12Q1) | Replaces the hand-made region table | 3 h |
| 10 | Event or FRP-weighted unit as a second column | Cluster hotspots within 1 km / 1 day per sensor; compare event counts | A unit far less resolution-dependent; strong creativity point | 4 h+ |
| 11 | Cloud/obscuration flag | Monthly cloud fraction per cell as a warning | Cloudy months not read as quiet months | 3 h+ |
| 12 | Independent truth | Landsat/Sentinel-2 active fire or agency fire reports for a few seasons | The only route to a real accuracy claim | later |

Literature: Schroeder et al. (2014, RSE 143); Giglio, Schroeder & Justice (2016, RSE 178); Giglio et al. (2018, RSE 217); Giglio, Csiszar & Justice (2006, JGR) for overpass and cloud corrections. Published MODIS-vs-VIIRS ratios by biome and prior harmonization schemes: literature check needed.

## 5. Ten questions a judge would ask

1. **Why should I trust 2003–2011 if you can only test inside 2012–2023?** Split-window tests give ±5–8 % at country level; inside the MODIS era Terra-only and Terra+Aqua reconstructions agree within 6 %; the band is 8 %.
2. **Does your 80 % band cover 80 %?** Pooled yes (81 % province, 80 % country, measured on the final band); fire-poor provinces were under-covered until the band became count-aware (item 3).
3. **What happens where MODIS saw nothing?** The multiplicative model returns zero; over 20 % of Terra-only cell-months with ≥ 10 VIIRS detections are such cases. Small AOIs before 2012 are therefore lower bounds; we show it.
4. **Is the factor really per cell?** Cell-level where the overlap has enough detections (30 % of cell-months), province otherwise; the cell level still cuts province error from 13.7 to 10.4 %.
5. **Why exclude 2024–2025 but keep 2020–2023, when Terra was already drifting?** Aqua/Terra stays in its historical range until 2023 and jumps in 2024; the forward test (0.87, 0.75 Terra-only) quantifies it.
6. **Could your outage detection bias the factor?** It conditions on MODIS zeros; the effect is below 1 % of counts per year, and the list is being restricted to confirmed multi-day events.
7. **Is MCD64A1 a validation?** No. It shares MODIS active fires; it only shows the 3× step of a naive splice is gone. LOYO against VIIRS is the validation.
8. **Why counts and not fires, FRP or area?** The challenge asks for a hotspot calendar and counts are what both archives share; event counts are the next unit.
9. **How does the series continue after S-NPP?** Per-satellite bridge to S-NPP-equivalents (0.980, 0.951), checked against a different pipeline (0.982); provincial spread 0.89–1.16 is carried as uncertainty.
10. **Does it work outside Argentina?** The code needs only a FIRMS country file; say plainly whether a second country was run.
