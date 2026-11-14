# Peer review — GeoFuego Harmonization (data, method, validation)

> **This review was written by an SI system (Claude Fable 5.2, Anthropic) in an isolated session; it is not a human expert opinion.** The team answered it in `audit_2026-11-14.md` (addendum 13:00).

Reviewer role: senior active-fire products judge (NASA/CONAE perspective). Scope: harmonization only; app, video and form are not reviewed. Repository state: commit `458a9b5`, 14 Nov 2026, 12:00. Reviewer checks were read-only re-computations from `data/agg/counts.json`, `data/factors/factors.json` and the validation files, using `lib/factors.js` unchanged. Written with SI assistance (Claude Fable 5.2, Anthropic).

## 1. Summary verdict

This is a well above average Space Apps data-science submission: a transparent ratio-of-sums factor per 0.25° cell × calendar month × satellite set, fitted on paired days, with leave-one-year-out (LOYO) skill reported against a naive scalar, and a self-audit that found and fixed real problems (orbit drift, outages, a double-count bug). The main weaknesses are in what is claimed, not in what is computed: the "independent" burned-area continuity test is close to a tautology, the 80 % band covers about 69 % (and about 45–55 % in the Terra-only era), and the Terra-only reconstruction is not validated in any committed output. The work is Argentina-only with a hierarchy tied to provincial polygons, which limits a global challenge. All of this is fixable in hours, not days.

| Criterion | Score (data/method only) | Justification |
|---|---|---|
| Impact | 3.5 | Real operational user (live national platform), but one country and hotspot counts only. |
| Creativity | 4 | Persistent-source class, paired-day calibration, S-NPP→NOAA-20/21 bridge and AOI-size error curve are not standard at this level. |
| Validity | 3.5 | Solid LOYO; band under-covers, Terra-only era untested, external test overstated. |
| Relevance | 4.5 | Answers the statement literally (sensor of origin flagged, calendar 2000→today, CSV). |
| Presentation | 3 | Numbers are traceable, but README and figure titles are stale and there is no single "validation at a glance" figure. |

## 2. Strengths

- **Ratio of sums, not mean of ratios**, with the Jensen bias measured rather than asserted. Country LOYO annual pred/obs 0.90–1.02.
- **Ablation holds up** (reviewer re-computation, province season MAPE, 12 folds): scalar 17.1 % → country×month 15.7 % → province×month 13.7 % → cell hierarchy 10.6 %. The cell level earns its place; this ladder is not in the docs and should be.
- **Persistent thermal sources kept as a separate class** with a two-signature rule (persistence + night), audited with signatures the rule never used (FRP, type-2 co-location, seasonality) and by visual inspection. The non-stationarity argument (static V/M 3.6 → 13–26) is the right reason.
- **Orbit drift handled by restricting calibration to 2012–2023**, and outage days detected and excluded from calibration. The S-NPP August 2022 safe-hold catch is the kind of detail experts look for.
- **Bridge to NOAA-20/21** fitted on standard-processing archives, with the API-vs-archive path check (0.61 %) and an out-of-sample check on production NRT data.
- **Negative result reported**: ENSO conditioning tested three ways and not adopted.
- sha256 manifest of every input, DOI, licences, SI acknowledgment in every file.

## 3. Weaknesses, risks and possible errors

### 3.1 Numbers checked

| Claim | Source | Reviewer result |
|---|---|---|
| LOYO season MAPE 3.5 / 10.6 / 29.9 %, scalar province 17.1 %, annual 0.90–1.02 | audit | Confirmed (0.0354 / 0.1056 / 0.2988; 0.1709; 0.901–1.016). |
| Aqua/Terra 2.23 (2024), 2.46 (2025); VIIRS/Terra 11.6 (2025) | audit | Confirmed (2.234, 2.462, 11.57). "VIIRS/Terra ~9" before is loose: 2020 = 10.2, 2022 = 10.8. |
| Country f_TA August 3.03; Neuquén 4.35; Santa Cruz 5.94 | audit | 3.026; **4.38** (not 4.35, changed by the region commit); 5.94. |
| Argentina 2022 = 274 472; 2001 = 267 912 | audit | 274 472 confirmed; 2001 is **267 964** in the current CSV. |
| Static-class V/M "3.6 (2012) → 24–26 (2019–2025)" | static_sources_review | **Not correct.** 2019–2025: 24.2, 20.9, 20.5, 18.5, 15.4, 12.8, 25.6. |
| "Terra-only era 10 294 (Jun 2001)" gap fill | audit | Misleading label: June 2001 adds 1 574; July 2001 (3 outage days) adds 3 565. |
| AOI curve 34/31/29/28/23/20 % | audit | Confirmed. |
| "Fitted on the 2012–2025 overlap" | README, both figure titles, `04b` header | **Stale**: factors.json meta says 2012–2023, 12 folds (a commit message says 14). |
| K sweep "k ∈ {20,50,100}, lowest province MAPE wins" | METHOD_DESIGN §3 | Sweep run is {10,20,50}; **K = 10 has the lowest province MAPE (10.39 vs 10.56 %)**, K = 20 was kept. CAP has no effect at all (identical to 4 decimals). |

### 3.2 Uncertainty band (most important technical issue)

- **Coverage is not 80 %.** Reviewer LOYO re-computation with the exact band of `06_harmonize.mjs`: observed VIIRS falls inside the band in **68.9 % of cell-months, 68.1 % of province-months, 68.8 % of country-months**. Cause: the floor is a *median absolute relative error* used as if it were a σ (median |e| ≈ 0.67 σ), then multiplied by 1.28.
- **The Terra-only era uses the Terra+Aqua floor.** `empSigma()` comes from TA folds only, so 2001 country months carry σ = 0.058. Reviewer LOYO of the T set: country monthly median error **10.9 %**, province 27.9 %, province season MAPE **17.7 %**, annual pred/obs 0.78–1.05 (2022: 0.777). Band coverage for T: **43 % country, 54 % province, 47 % cell**. The weakest years have the most over-confident band.
- RSS across cells assumes independence; errors share a year effect (2020, 2022 under-predicted everywhere). The floor patches this for monthly values, but annual totals also sum months as independent.
- Gap-filled values in observed years carry σ = 0 (August 2022: 10 % of the month is modelled).
- Observed VIIRS years have no band at all; the series therefore shows a visual step in certainty at 2012 that is partly an artefact of definition.

### 3.3 External validation

- **MCD64A1 is not independent of MODIS hotspots.** The Collection 6 burned-area algorithm uses MODIS active-fire detections to train its classification (Giglio et al. 2018, the paper cited in `SOURCE.md`). `SOURCE.md` and the figure say "independent".
- **The continuity ratio is near-tautological.** Since f ≈ V/M on the overlap, ha per harmonized hotspot pre/post ≈ ha per raw MODIS hotspot pre/post. The file shows it: Argentina 0.971 vs 0.983; Salta 0.633 vs 0.633; Catamarca 0.927 vs 0.927. The test demonstrates that burned area per MODIS detection was stable, not that the factor is right before 2012. The "3.10 naive" comparison is the factor restated.
- Province ratios range 0.53 (Río Negro) to 2.5 (Santa Cruz); only the national median is quoted.
- The VIIRS burned-area file (`MVP64_*`) was downloaded and is used by no script.
- Nothing external covers November 2000 – 2001.

### 3.4 LOYO design

- Only the TA set is evaluated; T is never tested in the committed validation.
- Evaluation is on paired days, so gap filling is never validated.
- Mild leakage: the static mask, the outage list and K were all determined with the held-out year present. Effect is small but should be stated.
- Thresholds (province season ≥ 50, monthly ≥ 30 hotspots) exclude the low-fire units where the method is weakest; n_units = 21–22 of 24.
- LOYO cannot test stationarity. Overlap V/M rises from 3.07–3.33 (2012–2019) to 3.25–3.83 (2020–2023). Whether that is ENSO, fire size or MODIS ageing decides the sign of a possible bias in 2002–2011. Reviewer check: no dependence of the country residual on activity level (r = 0.07, n = 144), which is reassuring and should be reported.

### 3.5 Method

- **The "empirical Bayes" weight is a count rule**, w = n/(n+20), with one K for every level and no between-unit variance. 75 % of cell-months have w = 0; source level is province for 35 331 cell-months and cell for 14 726. The August factor map shows both symptoms: salt-and-pepper cells (1.5 next to 4) and visible provincial borders.
- **Terra-only factor is 7.0–15.1 with σ 0.11–0.25** (June–July 15). It multiplies small counts in the season when Terra sees one ninth of the activity. This is the highest-leverage part of the series.
- **No day/night split.** VIIRS gains much more at night than by day; the day/night mix differs by region and season and is already in the files.
- **Scan geometry and overlap** (MODIS pixel growth off-nadir, VIIRS aggregation zones, latitude-dependent swath overlap) are absorbed in the monthly cell factor, which is acceptable, but nowhere stated.
- **Cloud/obscuration** is declared as not corrected. Monthly counts in the Litoral summer are sensitive to it and the two sensors pass at different times.
- **Confidence equivalence** (MODIS ≥ 30 vs VIIRS non-low) is asserted with one sensitivity figure from 2020.
- **Outage detector**: national-zero days only; partial-swath or partial-day losses pass. It has not been compared with the official MODIS/VIIRS data-outage records (literature check needed).
- **Static mask is time-invariant** and built mostly from VIIRS; in Neuquén (111 of 204 cells, 48 % of VIIRS hotspots) it also removes pre-flare vegetation fire in those cells. Neuquén is the worst LOYO province (25 %).
- **Bridge**: three years, annual factor, shrunk with the same count rule. Sound. The 2026 pre-September divisor 2.931 assumes all three satellites reported all days.
- **Unit**: pixel counts. FRP is not harmonized, and no event/cluster unit exists, although the statement mentions "number of fires".

### 3.6 Scope, reproducibility, documentation

- Argentina only; hierarchy depends on IGN polygons and a hand-made region table.
- `05e_enso.mjs` and `06_harmonize.mjs` read ONI from `$HOME/.openclaw/data/firms_ar/oni.ascii.txt`, outside the repository: **the pipeline does not run on a clean clone.** No fetch script for ONI or the GWIS files.
- README omits the 2012–2023 window, the region level, the SP archives, GWIS/MCD64A1 and the bridge. `CITATION.cff` lists no data references.
- Forward test available but unreported (reviewer): 2012–2023 factors applied to 2024 and 2025 give country pred/obs **1.035 and 1.014** (TA) but **0.874 and 0.748** (T). This is strong evidence for the drift decision and for the method.

## 4. Suggestions, ranked by judge impact per hour

| # | What | Why | How | Expected effect | Effort |
|---|---|---|---|---|---|
| 1 | **Calibrate the band and report coverage** | 69 % is not 80 %; judges trust a band that is tested | In LOYO compute the empirical 10th/90th percentile of log(V/P) per level and per set (TA, T), per AOI size; use those as band multipliers; publish a coverage table | Coverage 78–82 %; one sentence "band verified" | 1 h |
| 2 | **Validate the Terra-only set and give it its own floor** | The 2000–mid-2002 years are unvalidated and over-confident | Add `--set=T` to `05_loyo` and `05c`; in `06` choose the floor by era | Honest ±11 % country, ±28 % province for 2001 | 0.5 h |
| 3 | **Report the 2024–2025 forward test** | True out-of-time evidence, free | Ten lines in `05_loyo`: apply final factors to 2024, 2025 | "1.04 and 1.01 on years never used" | 0.3 h |
| 4 | **Fix stale text and wrong numbers** | Inconsistencies cost Validity points | README window and data list, figure titles, static ratio sentence, Neuquén 4.38, 2001 total, K-sweep statement (adopt K = 10 or justify 20), drop CAP or say it is inert | Clean record | 0.5 h |
| 5 | **Reframe the external test** | Avoid an expert objection in the first minute | Call it a consistency check; state the MCD64A1 dependence; show the province distribution of the ratio, not one median | Credibility | 0.3 h |
| 6 | **Publish the ablation ladder as the headline figure** | It proves each level adds skill | Scalar → month → province×month → cell, bars with fold spread | Creativity and Validity | 0.5 h |
| 7 | **Make the repository run from a clean clone** | Reproducibility is judged | `01c_fetch_aux.mjs` for ONI and GWIS with sha256; relative paths only | Reproducible | 0.5 h |
| 8 | **Truly independent pre-2012 check** | The only way to test the factor before VIIRS | (a) Aqua-as-reference test inside 2003–2011: reconstruct T+A from Terra alone with overlap-fitted factors, compare with observed; this tests stationarity of an overpass factor backwards in time. (b) Compare 2002–2011 night counts with the ESA ATSR World Fire Atlas (night-time, independent sensor); availability to be checked | First backward-in-time evidence | 2–3 h |
| 9 | **Day/night split factors** | Physically motivated, data already present | Fit f separately for D and N, sum predictions; compare by LOYO | Likely gain in Patagonia and winter months; either result is reportable | 2 h |
| 10 | **Replace administrative levels by spatial pooling** | Removes border steps and makes the method portable to any country | Parent of a cell = ratio of sums over a 3×3 then 9×9 window, then land-cover class (MCD12Q1) × month; estimate K from the between-cell variance (method of moments) | Smoother map; runs on any FIRMS country file | 3–4 h |
| 11 | **Run a second country unchanged** | Global challenge | Bolivia or Paraguay through 01–06 with suggestion 10; report LOYO only | Impact +0.5 | 2 h after #10 |
| 12 | **Use the VIIRS burned-area file already downloaded** | Post-2012 cross-product consistency | ha per hotspot with MVP64 vs MCD64A1, 2013–2025 | One extra row in the validation table | 0.5 h |
| 13 | **Give σ to gap-filled observed months** | Currently exact by construction | σ = share filled × σ_TA | Consistency | 0.3 h |
| 14 | **FRP and event units as secondary products** | Experts will ask | Monthly summed FRP per sensor with its own ratio (expect a ratio near 1 rather than 3; compare with Li et al. 2018, JGR Atmospheres); fire events by space-time clustering of VIIRS pixels (750 m, 1 day) and of MODIS pixels (2 km), and their ratio | A second harmonized unit closer to "number of fires" | 4–6 h |
| 15 | **Check outage list against official records and add a cloud flag** | Detector is heuristic | Compare `coverage.json` with LANCE/MCST outage notices; flag months with anomalously low Terra+Aqua+VIIRS day count | Robustness | 1–2 h |

Literature the team should cite or check: Giglio et al. 2016 (MODIS C6 active fire, RSE); Schroeder et al. 2014 (VIIRS 375 m active fire, RSE); Giglio et al. 2018 (MCD64A1 C6, RSE); Giglio et al. 2006 (Terra/Aqua fire seasonality and overpass/cloud correction, JGR); Li et al. 2018 (VIIRS vs MODIS FRP, JGR Atmospheres). Published MODIS–VIIRS count-ratio studies by biome: literature check needed before citing.

## 5. Questions a judge would ask

1. **Why should a factor fitted in 2012–2023 hold in 2003?** It cannot be proven without VIIRS. Evidence offered: forward test on 2024–2025 (1.04, 1.01), no dependence on activity level, stable burned area per MODIS detection. Add the Terra→Aqua backward test.
2. **Your band is 80 %. Did you verify it?** Today: 69 %. After suggestion 1: state the measured coverage.
3. **Is MCD64A1 independent?** No, it is trained with MODIS active fires; it is a consistency check across the splice, not a validation of the factor.
4. **How good are 2000–2002?** Terra-only LOYO: 17.7 % province season error, 11 % country monthly, with a 0.78 worst year. Say it and widen the band.
5. **Why counts and not FRP or fire events?** Counts are what the challenge and FIRMS users handle; FRP per sensor is carried raw. Prepare the FRP ratio as a secondary product.
6. **Why exclude 2024–2025 if TA still predicts them well?** Because the Terra-only factor fails (0.87, 0.75) and both sets must share one window; TA loses nothing measurable.
7. **What happens to the calendar now that S-NPP has stopped and MODIS is ending?** Bridge g = 0.980 (NOAA-20), 0.951 (NOAA-21), checked on NRT production data; MODIS is not needed after 2012.
8. **Does it work outside Argentina?** The scripts take a FIRMS country file; the hierarchy currently needs provincial polygons. Show one more country or the spatial-pooling version.
9. **How do you know the removed "static" cells are not fires?** Night fraction 0.83 vs 0.27, FRP 1.3 vs 5.3 MW, 65 % of FIRMS type-2 detections inside 1.35 % of hotspots, visual review; 8 ambiguous cells, 0.2 % of their provinces. They are kept as a separate column.
10. **What is the error for my 20 km AOI?** About ±34 % for a single cell-month (median), ±20 % season; the app must show it and refuse to over-interpret single cells.
