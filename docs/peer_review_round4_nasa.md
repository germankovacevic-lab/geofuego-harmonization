# Peer review, round 4 — active-fire products view: is the dataset fit to carry a public application?

**This review was written by an SI system (Claude Fable 5.2, Anthropic) acting as a reviewer in the role of a senior MODIS/VIIRS active-fire products scientist; it is not a human expert opinion.**

Repository state reviewed: commit `0f8c681` (14 Nov 2026, 15:41 ART), working tree clean. Method: every file listed in the brief was read; checks were read-only scripts under `/tmp/review4/` that re-fit the factors with `lib/factors.js`, re-implement the leave-one-year-out (LOYO) metrics and the interval look-up independently of `05_loyo.mjs` / `06_harmonize.mjs`, read the committed CSV/JSON, and scan ten MODIS and seven VIIRS raw files. Nothing in the repository was modified and no pipeline script was run. "Verified" = I recomputed it. "Not verified" is stated where it applies. I did not open the three public links, did not consult the official outage tables, and did not re-run the raw-file co-location statistics of rule 3.

---

## 1. Scientific assessment of the harmonized dataset

### 1.1 Is the approach right for the physics?

| Physical difference | How the product handles it | Assessment |
|---|---|---|
| **Pixel size and minimum detectable fire** (MODIS 1 km at nadir, growing several-fold toward the scan edge; VIIRS I-band 375 m with on-board aggregation that limits growth) | Empirical count ratio per 0.25° cell × calendar month, ratio of sums on paired days, shrunk to province → region → country | Correct in kind. A count ratio is the product of a geometric term (more pixels per fire front) and a detection term (small fires VIIRS sees and MODIS does not). The second term depends on the fire-size distribution of the place and season, which is why a cell × month factor beats a scalar (province error 15.0 → 9.8 %, verified). It also means the factor is only valid while the fire-size distribution is the one of 2012–2023. Nothing in the repository can test that for 2000–2011 (§1.3). |
| **Overpass time** (Terra 10:30, Aqua and S-NPP 13:30, plus night passes) | Two satellite sets: VIIRS/(Terra+Aqua) for Jul 2002–2011 and VIIRS/Terra for Nov 2000–Jun 2002 | Correct. The Terra-only factor is 7.4–15.0 by month at country level (verified: Jun 14.9, Jul 15.0, Dec 7.4). It converts a morning sample of the diurnal cycle into an afternoon-plus-night count, so it is the highest-leverage and least stable number in the product; the team's own errors say so (province 16.8 %, worst year 0.80, verified). |
| **Day vs night sensitivity** | Pooled; split tested and rejected | Acceptable. The night ratio 5.7–7.2 vs day 2.6–3.2 (verified in `country_year.csv`) is the expected physics. Pooling is safe only because the day/night mix per cell-month is stable; it is a hidden assumption for the pre-2012 years, not a tested one. |
| **Detection algorithm and false-alarm profile** (MODIS contextual C6 vs VIIRS 375 m) | Static-source class; rule 3 for MODIS static false alarms | Sound and above hackathon level. I verified on the raw files that the MODIS `version` string is 6.2 through 2017, 6.03 for 2018–2022, 61.03 for 2023–2025, and that the `type = 2` share is 0.6–1.9 % in the 6.2 files and 3.0–5.6 % afterwards (all rows, no confidence filter; README quotes 2.3–4.9 % with its filter). What a product scientist would still ask: why build a 26-year record on an archive that mixes processing versions instead of one homogeneous reprocessing of the MODIS fire location product. I could not determine from the repository whether a single-version country file exists; the team should check and say so. |
| **Confidence filters** (MODIS ≥ 30 vs VIIRS not low) | Declared as equivalent | Acceptable convention, not an equivalence. It removes 4–6 % of MODIS rows and 6–10 % of VIIRS rows (verified); the difference is absorbed by the factor. The VIIRS files contain no low-confidence night detections at all (verified, 7 files), so the confidence filter does nothing against night-time noise over the South Atlantic Anomaly, where Argentina lies; whether isolated night pixels remain in the vegetation class was not tested by the team nor by me. |
| **Static sources** | Separate class, 1 628 cells of 0.02°, never deleted | Right decision: the static-class VIIRS/MODIS ratio is 1.3–2.3 (verified) against ≈ 3.2 for vegetation, so one factor cannot serve both. Weakness: the class is time-invariant and the static column is **not harmonized** — it carries raw MODIS counts before 2012 and raw VIIRS counts after. Neuquén: 547 static detections in total for Nov 2000–2011, 24 948 for 2012–2025 (verified in the province CSV). Any application that adds this column back to the calendar re-creates the splice the project exists to remove (§3). |
| **Orbit drift** | Calibration window 2012–2023; 2024–2025 used as a forward test | Correct and well evidenced: Aqua/Terra is 1.59–1.96 in every year 2003–2023 and 2.25 / 2.47 in 2024 / 2025 (verified). One caution: the window still contains 2022, the year of the Terra orbit manoeuvre recorded in the team's own outage file (10–23 Oct 2022), and 2022 is the worst year of every test (split-window 0.874, Terra-only 0.763, verified). The repository cannot separate drift, La Niña and the unusual 2022 fire season. |
| **Cloud** | Not corrected; ERA5 monthly cloud fraction at the overpass hour used as a flag and to widen the upper bound | The decision not to correct is right. The implementation is weaker than the text suggests: reanalysis monthly cloud fraction is a coarse proxy for what the sensor's own cloud mask saw, the −3 slope is an observational regression confounded with fire weather (declared), and the flag fires in **26 % of all province-months** (1 874 of 7 248) and 49 of 302 national months, with a median stated under-detection of 25 % (verified). A flag that is on a quarter of the time, with a number attached, will be read as a measurement. It is not one. |
| **Outages** | Detected from the data, filled across sensors, flagged | Sound. Months with more than 10 % modelled content nationally (verified): Jan 2012 76 %, Jul 2024 38 %, Jul 2022 20 %, May 2024 20 %, Jun 2001 50 %, Mar 2002 29 %, Dec 2003 18 %, Apr 2002 17 %. |
| **Unit** | VIIRS-equivalent 375 m pixel detections | Declared. It is not fires, not area, not energy. A fire burning for ten days is counted on every overpass. |

### 1.2 Where it is strong

1. **Reproducible to the last digit.** Re-fitting from `data/agg/counts.json` gives a maximum difference of 0 over 100 632 cell-month factors.
2. **Out-of-sample errors reproduce** with independent metric code (table below).
3. **The 2012 level change is shown to be real**, not an artefact: raw MODIS alone falls by the same proportion (1.48 vs 1.41). This is the single most convincing figure in the repository.
4. **Negative results are reported** (ENSO, day/night, additive term, dated mask), and four independent review rounds changed the product each time.
5. **Calibration on paired days and a separate Terra-only set** are what a product team would do.

### 1.3 Where it is weak — what a MODIS/VIIRS fire scientist would object to

1. **Stationarity is assumed, not tested, for the period that matters.** Every test of the VIIRS relation lives inside 2012–2025. The backward test (2003–2011) compares two MODIS-based reconstructions with each other; it tests the Terra-only factor against the Terra+Aqua factor, not either against truth. "≈ 3–5 % country error for 2002–2011" is an extrapolation of a drift measured between two halves of the overlap. Land use, agricultural burning practice and the fire-size distribution of the 2000s (the main Chaco clearing years) are not those of 2012–2023. The claim must be conditional.
2. **A multiplicative model cannot create detections.** Verified on paired days 2012–2023: 44.9 % of VIIRS-active cell-months (7.2 % of VIIRS hotspots) have no Terra+Aqua detection; 67.1 % and 20.3 % for Terra alone. Scaling fixes totals; it cannot fix detection frequency. In the delivered product the share of months with H > 0 is lower before 2012 than after for the same area, although national activity was 41 % higher (§3.1, measured).
3. **The interval is calibrated for two unit types only** — one cell, and a province or the country. A user-drawn area is neither. With the rule shipped in `cells.json` (2+ cells → class `agg`) the 80 % interval covers 65–76 % of out-of-sample months for areas of 4–100 cells, and the true value falls **below** the lower bound in 15–31 % of them (§2, item 2; new finding).
4. **The headline interval test is reported for bins that were later replaced** (§2, item 2).
5. **Patagonia south of 42° S is not a validated product.** Chubut 16.4 % and Santa Cruz 25.4 % season error with 9 usable folds of 12; share of zero months before 2012 vs after: Chubut 28 % vs 2 %, Santa Cruz 17 % vs 1 %, Tierra del Fuego 91 % vs 66 % (verified, province CSV).
6. **No independent truth.** MCD64A1 is rightly labelled a consistency check. There is no comparison with any reference that is not MODIS or VIIRS active fire.

### 1.4 Numbers recomputed

| # | Reported (source) | My result | Status |
|---|---|---|---|
| 1 | Committed factors reproducible | max difference 0 over 100 632 factors | agrees |
| 2 | LOYO Terra+Aqua 3.2 / 9.8 / 30 % (README) | 3.19 / 9.77 / 29.56 % | agrees |
| 3 | Naive scalar 8.9 / 15.0 / 34 % | 8.87 / 15.02 / 34.21 % | agrees |
| 4 | Terra-only 5.6 / 16.8 %, worst year 0.80 | 5.56 / 16.75 %, 0.797 | agrees |
| 5 | Split-window 0.965 / 0.992; Terra-only 0.93 / 1.01 | 0.965 / 0.992; 0.925 / 1.006 | agrees |
| 6 | Forward 2024 / 2025: 1.044 / 1.024; Terra-only 0.88 / 0.75 | 1.044 / 1.024; 0.880 / 0.754 | agrees |
| 7 | Structural zero 44.5 % of cell-months, 7 % of hotspots; Terra 67 % / 20 % | 44.9 % / 7.2 %; 67.1 % / 20.3 % | agrees (0.4 point) |
| 8 | 2003–2011 mean over 2012–2025 mean: 1.48 raw MODIS, 1.41 harmonized | 1.475, 1.415 | agrees |
| 9 | 1 628 static cells (204 + 469 + 955), 3.0 % of hotspots | 1 628 (204 / 469 / 955); 2.99 % | agrees |
| 10 | MCD64A1 consistency 0.98 vs 3.12 | 0.975 vs 3.118 (file) | agrees |
| 11 | Bridge g = 0.979 / 0.951; spread 0.93–1.16, 0.89–0.99 | 0.979 / 0.951; 0.938–1.163, 0.893–0.992 | agrees; README item 4 still prints 0.980 |
| 12 | Flare cells: 0.31 % national, Neuquén 6.4 %, Tierra del Fuego 44 % of 130 | 2 262 / 736 191 = 0.31 %; 222 / 3 466 = 6.4 %; 57 / 130 = 44 % (file) | agrees |
| 13 | Interval coverage, LOYO: country 89, province 79, cell 81 %; province P 5–30 77 % | 88.9 / 79.3 / 80.9 %; 77.0 % (file) | agrees |
| 14 | **"83 % / 81 % of province-months inside the interval on 2024 / 2025"** (README, five numbers) | 83.0 / 80.6 % with the **variant A** bins (`by_region`); **75.7 / 72.8 %** with the shipped variant D bins (`by_region_class`), n 206 | **stale: describes a superseded interval** |
| 15 | "59 % of Neuquén's VIIRS hotspots" in the static class; Santa Cruz 28 %, Tierra del Fuego 25 % | 57.1 %, 28.5 %, 18.8 % (from `counts.json`); `audit_static.json` says 57.1 / 29.2 / 21.0 | **stale** for Neuquén and Tierra del Fuego |
| 16 | Outages: "15 of the 24 runs confirmed, 2 partial, 7 unconfirmed; all 7 outages of ≥ 8 days" | records in `outages_vs_official.json`: 13 confirmed, 2 partial, 9 unconfirmed; 9 runs of ≥ 8 days, all confirmed | **miscounted**; conclusion holds |
| 17 | "30 % of cell-months" estimated at cell level | 14 261 / 50 316 = 28.3 % (Terra+Aqua); 17.6 % (Terra-only) | rounded up |
| 18 | Tierra del Fuego factor "own weight 0" (README) | own weight 0.93 in December, 0.73 February, 0.38 November, 0.33 January; 0 in the other eight months | **inaccurate** (§2, item 4) |
| 19 | Argentina 2001 / 2012 / 2022: 266 037 / 181 522 / 271 769 (audit 15:40) | 266 022 / 181 522 / 271 769 (CSV) | agrees |
| 20 | Jan 2012: 20 387 [18 662–22 498] (audit 15:40) | 20 387 [18 624–22 459] (CSV) | value agrees; bounds changed with variant D |

Thirteen of twenty agree outright, two agree with a remark; five are stale, miscounted or inaccurate. None is invented; all five are text that was not updated after a later commit.

---

## 2. Do the responses to rounds 1–3 hold?

| # | Round-3 item | Status | Evidence |
|---|---|---|---|
| 1 | MODIS `type`-flag inhomogeneity | **Resolved in the data** | Version boundary and type-2 shares verified on raw files. Rule 3 is in `03a` (955 cells, not dilated), type-2 counted in the static columns in `03`. Refit is exact; split-window 0.938 → 0.965 and 1.032 → 0.992 verified. Residual, declared: type-2 detections outside the cells are treated differently before and after 2018 (≈ 0.7 %). Not verified by me: the co-location figures (11 % vs 76 %) that justify calling these sites non-fire. |
| 2 | Interval for low-count aggregates | **Partially** | Holds for what it was fitted on: province-months with P 5–30 covered 77 % in LOYO and 92 % / 82 % on 2024 / 2025 (n 37 / 45, my computation). Does not hold in four respects. (a) The README's 83 % / 81 % on unused years is variant A; the shipped interval gives 76 % / 73 % for province-months with P ≥ 30 and 77 % / 75 % for all province-months with P ≥ 1 — the forward block of `05_loyo.mjs` (line 217) still reads `band.by_region`. (b) Areas between a cell and a province: random contiguous blocks in LOYO, Terra+Aqua, shipped rule → coverage 65 % (4 cells), 68 % (9), 71 % (25), 75 % (49), 76 % (100), with 31 → 15 % of true values below the lower bound. The same blocks with the **cell** bins: 80–82 % for 4–100 cells (misses 3–8 % below, 12–15 % above). Terra-only set with the shipped rule: 57 % (4 cells) to 74 % (100). (c) 28 province rows have H below their own lower bound (Chubut 16, Tierra del Fuego 6, Santa Cruz 4, Río Negro 1, Neuquén 1): the Patagonia aggregate bin 1–5 has p10 = +0.18 (n 38). (d) Under variant D, La Pampa is covered 70 % (n 116), Corrientes 72 % (n 144), La Rioja 73 %, Salta 75 %; README names only Neuquén and Chubut. |
| 3 | GFI regions | **Resolved**, with stale text | `lib/regions.js` holds the four regions; LOYO with them is 3.19 / 9.77 / 29.56 % (verified). I did not recompute the five-region variant; "no measurable effect" rests on the team's files. README Known limits still says "the intervals of Pampa/Cuyo provinces are wider than needed (coverage 85–94 %)": those regions no longer exist and under variant D the figure is 78–80 %. Scientific remark: the regions are now chosen for consistency with another product, not for fire regime (Mendoza and San Juan share a region with Buenos Aires). Harmless while own weights are ≈ 0.99; say it is a convenience. |
| 4 | Tierra del Fuego | **Partially** | The `factor_source` column exists (92 of Tierra del Fuego's reconstructed rows are `assigned`). But 42 rows are `estimated`, and the December factor, **9.06** with weight 0.93, comes from one event: December 2022, 1 353 VIIRS against 136 MODIS detections on paired days; the other eleven years contribute 6 VIIRS and 5 MODIS. That factor makes the largest pre-2012 value of the province: December 2008, H = 328 of the year's 338 (39 MODIS detections in the year), labelled `estimated`. `lib/regions.js` says "180 MODIS detections in August over 12 years"; the 180 are all months together and August has none. README repeats the phrase. |
| 5 | Dated flare mask | **Resolved as a measurement** | Numbers match `flare_start_year.json` (item 12 above); Neuquén cells by start year 147 / 42 / 6 / 25 match. Not implementing it is defensible for every province except Tierra del Fuego, where 44 % of the pre-2012 MODIS detections are removed and nothing is estimable anyway. I did not re-run the script. |
| 6 | Outages vs official records | **Partially** | The cross-check file exists and every long run is marked confirmed. The counts in README, audit and the file's own summary (15 / 2 / 7; "7 events ≥ 8 days") do not match the file's records (13 / 2 / 9; 9 runs ≥ 8 days). I did not consult the official tables. |
| 7 | Stale text | **Partially** | Round-3 list is fixed (ablation row, version years, "23 %" sentence, title, forward ratios). New stale items are listed below. |
| 8 | SI labelling | **Resolved** | All three earlier reviews state SI authorship in their opening lines; 26 of 26 scripts and 3 of 4 `lib` files carry the header (`lib/provincias.js` is pre-existing data with a source line); README narrows the data claim to the three published products, and those three carry the note (verified in the CSV headers and `cells.json`). |
| 9 | Sources and licences table | **Resolved** | Present in README with FIRMS acknowledgment text and the Copernicus attribution; FIRMS and ERA5 are in `CITATION.cff`. Minor: the table points to `deploy/` licence files that do not exist yet (stated as future). |
| 10 | Headline figure | **Resolved** | `figures/headline_series_Argentina.png` shows the four series and the interval; ratios verified. Nit: 2000 is two months plotted as a year. |
| 11 | README for a judge | **Resolved in structure**, carries items 14–18 of §1.4 | — |

**New stale or inconsistent text found in this round**

| Where | Says | Data say |
|---|---|---|
| README, five numbers and validation table | interval on 2024 / 2025: 83 % / 81 % | 76 % / 73 % with the shipped bins |
| README (three places) | Neuquén 59 %, Tierra del Fuego 25 % static share | 57 %, 19–21 % |
| README item 4 | bridge g = 0.980 | 0.979 (as README says elsewhere) |
| README Known limits | Pampa/Cuyo intervals 85–94 % | superseded by variant D and by the GFI regions |
| README, audit 17:45, JSON summary | 15 confirmed / 7 unconfirmed; 7 long events | 13 / 9; 9 long runs |
| README, `lib/regions.js` | Tierra del Fuego own weight 0; "180 detections in August" | weight up to 0.93; 180 in all months |
| Headers of `harmonized_cells.csv` and `harmonized_provinces.csv` (published products) | "band_calibration.json by_region"; "Argentina uses the national pooled bins" | bins are `by_region_class`; Argentina uses `national.agg` |
| Header of `06_harmonize.mjs`, `05_loyo.mjs` | coverage 90 / 82 / 80 %, Neuquén 82 %, Chubut 80 %, Pampa/Cuyo 85–94 % | variant A figures |
| `package.json` | "2000→today" | series ends Dec 2025 |
| Figure footers | "MODIS C6.1" | files read 6.2 / 6.03 / 61.03 |
| Audit addenda labelled 15:40 to 17:45 | — | committed 15:01 to 15:37 ART; the last label is later than the review itself. README states "git timestamps are the record"; the labels are not clock times and should say so or be removed. |

---

## 3. Fitness for the application

**Plain answer: yes, the data are fit to build the application on, provided the application enforces the rules below. Without them it will show small areas a calendar in which the sensor of origin still matters, and an interval that is wrong for most user-drawn areas.**

### 3.1 What the tests say about area size (my computation; LOYO 2012–2023, random contiguous blocks, Terra+Aqua; one cell ≈ 500–700 km² depending on latitude)

| Area (nominal block; fewer cells at borders) | Fire-season error, median / 80th pct | VIIRS-active months the model predicts as zero (share of hotspots in them) | Share of months with H > 0 in the product, 2003–2011 vs 2012–2020 | 80 % interval coverage: shipped rule / cell bins |
|---|---|---|---|---|
| 1 cell | 22 % / 45 % | 45 % (6.8 %) | 33 % vs 41 % | 80 % / 80 % |
| 4 cells | 19 % / 40 % | 37 % (3.0 %) | 46 % vs 58 % | 65 % / 80 % |
| 9 cells | 16 % / 39 % | 32 % (1.8 %) | 57 % vs 70 % | 68 % / 81 % |
| 25 cells | 15 % / 34 % | 23 % (0.8 %) | 71 % vs 84 % | 71 % / 81 % |
| 49 cells | 12 % / 29 % | 16 % (0.4 %) | 80 % vs 90 % | 75 % / 81 % |
| 100 cells | 9 % / 23 % | 10 % (0.1 %) | 89 % vs 96 % | 76 % / 82 % |
| 225 cells | — | — | 93 % vs 97 % | 78 % / 86 % |

Terra-only set (Nov 2000–Jun 2002): 66 % of VIIRS-active months predicted zero for one cell (19.6 % of hotspots), 40 % for 25 cells, 20 % for 100 cells; season error median 41 %, 25 %, 16 %.

Limits of this table: one random seed per row, blocks drawn uniformly over land cells with data, third column of the product restricted to areas with ≥ 50 hotspots in 2012–2020.

### 3.2 Rules for the application

**R1. Geometry.** The unit of the data is the 0.25° cell. Snap every drawn area to whole cells, show the snapped outline, and state the cell count and km². Do not weight cells by fractional overlap: nothing validates it. An area smaller than one cell becomes that cell, with a sentence saying so.

**R2. Tiers by size.**

| Tier | Cells (approx. km²) | Behaviour |
|---|---|---|
| A | ≥ 100 (≥ ~60 000) | Full calendar, all years, all statistics. |
| B | 25–99 (~15 000–60 000) | Full calendar. Monthly values before 2012 carry the interval; label "reconstructed". |
| C | 4–24 (~2 500–15 000) | Calendar shown. Before 2012, a zero is displayed as "no MODIS detection", not as "no fire". Default baseline for "this month vs history" is 2012–2025. Seasonal and annual totals preferred over single months. |
| D | 1–3 (< ~2 500) | Years before 2012 greyed and excluded from every statistic by default; a toggle shows them with the warning text of §3.3. No ranking of years across 2012. |

**R3. Interval.** Use the `cell` bins of the dominant region for areas of 1–99 cells and the `agg` bins for ≥ 100 cells; whole country `national.agg`. This is a change of one line against the rule now written in `cells.json` and raises coverage for 4–100 cells from 65–76 % to 80–82 %. Clamp the lower bound to H (28 province rows violate it today). Where H = 0 before 2012, show no interval and the "no MODIS detection" label. Better, if two hours are available: fit bins on the block residuals of `05c_aoi_error.mjs` by size class.

**R4. Baseline for "this month vs the historical median".** Tier A and B: all years, with the reconstructed years marked. Tier C and D: 2012–2025 only (14 years; say so). When the median is below 10 hotspots, show the rank among years ("3rd highest of 14") instead of a ratio. A month in progress is "month to date" and must not be compared with full-month medians without that label.

**R5. Terra-only era (Nov 2000–Jun 2002).** Show for tier A only, hatched; interval −20 / +33 % on national months (verified). Exclude from baselines for tiers B–D. Year 2000 has two months and must never appear in annual rankings; 2002 is a mixed year and should be marked.

**R6. Static-source toggle.** The static column is in the sensor's own units: MODIS counts before 2012, VIIRS counts after. Never add it to H. Show it as a separate series, from 2012 only, labelled "fixed heat sources (flares, industry), VIIRS counts". Show a banner whenever the class holds more than 10 % of the area's VIIRS detections: Neuquén 57 %, Santa Cruz 29 %, Tierra del Fuego 19 %, Mendoza 12 % (and the City of Buenos Aires, 70 %).

**R7. Tierra del Fuego.** For areas whose cells lie mostly in Tierra del Fuego, show 2012–2025 only and state that the earlier years cannot be reconstructed. Reasons, all verified: 91 % of pre-2012 months are zero against 66 % after; the December factor rests on a single fire; 44 % of the pre-2012 MODIS detections are removed by the static mask; the interval has three months of evidence.

**R8. Patagonia south of 42° S (Chubut, Santa Cruz).** Tier rules apply one level stricter (treat B as C, C as D), and the "reconstructed" label adds "few detections; frequency of fire months not comparable across 2012".

**R9. Cloud-flagged months.** Show a marker and the sentence "cloudier than usual at overpass time: the count may be low". Do not display the estimated percentage and do not correct the count. If the current month is flagged, say that the comparison is biased low. Consider raising the threshold: at +0.05 the flag is on 26 % of the time.

**R10. Gap-filled months.** Marker "partly modelled (satellite outage)"; show the modelled share when above 10 %. January 2012 is 76 % modelled and should be treated as reconstructed.

**R11. Assigned factors.** Where `factor_source = assigned`, label "factor borrowed from the region". Treat Tierra del Fuego's `estimated` months as assigned (R7).

**R12. Current year.** No 2026 month exists in the product. Whatever the app shows for 2026 comes from near-real-time data through the bridge and must be labelled "preliminary, near-real-time, NOAA-20/21 converted to S-NPP-equivalent (± 5 %)". The 2.931 divisor for 3-satellite totals assumes all three satellites reported every day; flag those months.

**R13. Downloads.** The CSV must carry the unit, the sensor flag, interval, gap-fill, cloud and factor-source columns, the tier, and the baseline used. If raw FIRMS points are offered for a search, label them "raw detections in each sensor's own units, not harmonized".

### 3.3 Text the application must show

Always visible, near the calendar:

> Counts are satellite fire detections expressed in VIIRS-equivalent pixels (375 m). They are not a number of fires and not burned area. A fire that burns for several days is counted on every satellite pass.

> From 2012 the values are observed by VIIRS. Before 2012 they are estimated from MODIS, a coarser sensor, and shown with an 80 % range: about 1 month in 5 falls outside it.

For tiers C and D, before 2012:

> MODIS missed many small fires that VIIRS detects. In an area this size, a month with no value before 2012 means "MODIS detected nothing", not "nothing burned". Do not compare how often it burned before and after 2012.

When static sources exceed 10 %:

> Fixed heat sources (gas flares, industry) are excluded from this calendar. In this area they are X % of all detections since 2012.

For the current month:

> Preliminary near-real-time data, month to date. Smoke and cloud hide fires from the satellite. This is not an alert system: an empty cell does not mean there is no fire.

---

## 4. Claims

**May be made**

- A reproducible MODIS → VIIRS-equivalent monthly series for Argentina, Nov 2000–Dec 2025, with every factor re-derivable from NASA FIRMS files.
- Out-of-sample fire-season error inside 2012–2023: 3 % country, 10 % province, 30 % single cell; a single national factor gives 9 / 15 / 34 %.
- On 2024 and 2025, never used for fitting, the national total is predicted within 2–5 %.
- The fall in activity after 2011 is real: raw MODIS shows the same proportion (1.48 vs 1.41).
- The naive splice steps ≈ 3×; the harmonized series does not.
- A labelling change in the MODIS archive at 2017/2018 was found, measured and handled.
- Outages of S-NPP, Terra and Aqua are detected, filled and flagged; all long ones match documented events (per the team's cross-check).

**Must be softened**

- "The sensor of origin no longer matters" → true for totals of areas of roughly 100 cells and more; not for small areas, not for the frequency of fire months.
- "Calibrated 80 % interval for any area of interest" → calibrated for single cells and for provinces; for areas in between only with the rule R3.
- "≈ 3–5 % country error for 2002–2011" → "if the 2012–2023 relation held in 2002–2011; this cannot be tested without VIIRS".
- "83 % / 81 % on years never used" → 76 % / 73 % for the interval actually shipped (province-months, P ≥ 30); cells 80 % / 77 % stands.
- "Cloud … ≈ −26 % detections per +0.10 cloud" → an upper bound from a confounded regression on reanalysis cloud; a flag, not a correction.
- "Static-source class separates flares from fire" → a behavioural class plus NASA's own flag; time-invariant; includes some real fire (0.4–0.5 % per year).
- "Tierra del Fuego factor assigned" → assigned in eight months, fitted on one event in December.
- "26-year calendar" → 25 years and 2 months; 2000–mid 2002 from a single morning satellite.

**Must not be made**

- That the series is validated before 2012 against independent data.
- That values are fires, fire events, burned area or emissions.
- That the product is NASA-endorsed, a NASA product, or an operational early-warning or detection system.
- That a zero before 2012 in a small area means no fire.
- That Tierra del Fuego, or single cells in Chubut and Santa Cruz, have a usable pre-2012 record.
- That cloud obscuration is corrected.
- That the method transfers to other countries: it has been run on one.
- That 2026 is part of the harmonized record.

---

## 5. Remaining risks, ranked

| # | Risk in front of a NASA / CONAE judge | Effort | Blocks the app? |
|---|---|---|---|
| 1 | The app applies the `agg` bins to any area of 2+ cells: interval covers 65–76 % and sits too high for most drawn areas | 10 min (rule R3 in the app and in the `cells.json` note); 2 h for size-class bins | **Yes** — decide before coding the interval |
| 2 | Static toggle adds a non-harmonized column and re-creates the 2012 step (Neuquén 547 → 24 948) | 30 min inside the app (R6) | **Yes** for the toggle only |
| 3 | Headline "83 % / 81 %" belongs to a superseded interval; a judge who reruns `05_loyo` logic with the shipped bins gets 76 % / 73 % | 15 min: point the forward block to `by_region_class`, rerun, edit README | No; blocks publishing the README |
| 4 | Small-area calendars step at 2012 in fire frequency; "historical median" pulled down by reconstructed zeros | 1–2 h inside the app (R2, R4, texts) | No, if tiers are built in from the start |
| 5 | Tierra del Fuego: a factor of 9 from one fire labelled "estimated"; README says weight 0 | 20 min text; 30 min app rule (R7) | No |
| 6 | Five stale or miscounted numbers in README (§1.4 items 14–18) and stale headers in the two published CSVs | 30 min text; CSV headers need a rerun of `06` (minutes) | No |
| 7 | "Why a mixed-version MODIS archive?" and "is the error before 2012 really 3–5 %?" — the two questions a fire-products scientist asks first | 20 min: one paragraph each in Known limits | No |
| 8 | Cloud flag on 26 % of months with a percentage attached | 15 min in the app (R9); 30 min to test a higher threshold | No |
| 9 | 28 rows with H below its own lower bound | 5 min clamp in `06` | No |
| 10 | Addendum times later than the commits and than the clock, next to the sentence "git timestamps are the record" | 10 min | No |
| 11 | Outage counts inconsistent with the file that supports them | 10 min | No |
| 12 | No 2026 month in the product; the statement asks for "this month vs history" | 2–3 h (bridge applied to live data) | No, but the calendar's main use case depends on it |
| 13 | Public links (DOI, repository, app) not checked in this review; round 3 found all three closed | 30 min | Blocks judging, not building |

---

## 6. Verdict

1. **Scientifically sound** as a statistical cross-calibration of MODIS to VIIRS-equivalent counts at province and country scale; reproducible to the last digit; 13 of 20 recomputed numbers agree and the other seven are rounding, stale or miscounted text, none invented.
2. **Not validated before 2012** by anything independent, and not able to restore fires MODIS did not see: for small areas the sensor of origin still matters.
3. **The prediction interval is correct for one cell and for a province, and wrong as shipped for the areas users will draw** (4–100 cells: 65–76 % coverage); the cell bins fix it (80–82 %).
4. **Ready to build the app on these data: yes, with the rules in §3** — in particular R2 (tiers), R3 (interval), R4 (baseline), R6 (static column) and R7 (Tierra del Fuego).
5. Before publishing: correct the 83 % / 81 % headline and the four other stale numbers, make the pre-2012 error claim conditional, and regenerate the two CSV headers.
