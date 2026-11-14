# Peer review, round 3 — judge view: Space Apps compliance + scientific review

Reviewer role: independent reviewer acting as a NASA Space Apps 2026 judge, no prior context. Repository state: commit `8407c3e` (14 Nov 2026, 14:27 ART). **This review was written by an SI system (Claude Fable 5.2, Anthropic)**; it is not a human expert opinion.

Method of review: all challenge/judging/legal texts, the team's plan, every script, doc and data product were read. Checks were read-only scripts under `/tmp/review3/` that (i) re-fit the factors with `lib/factors.js`, (ii) re-implement the LOYO metrics independently of `05_loyo.mjs`, (iii) read the committed JSON/CSV, and (iv) scan the raw FIRMS CSVs in `data/raw/`. Nothing in the repository was modified. "Verified" = I re-computed it; "inferred" = my reading.

---

## 1. Compliance with the challenge

Verdict up front: **the harmonization half is done and goes beyond what the statement asks; the web-application half does not exist yet.** The statement's first sentence is "build a web application". Today the entry answers half of the challenge.

| Statement item | Status | Evidence |
|---|---|---|
| Harmonize MODIS + VIIRS "so that the sensor of origin no longer matters" | **Met at province/country scale; partially met for small areas** | `data/harmonized/harmonized_provinces.csv` (7 550 rows, 24 provinces + country), LOYO province error 10.2 %, country 3.3 % (verified). Small AOIs: 44.5 % of VIIRS-active cell-months (7.2 % of VIIRS hotspots) have zero Terra+Aqua detections, so before 2012 they read as zero (verified, §4.3) |
| Consistent time series "from the early 2000s to the present" | **Partially met** | Series runs Nov 2000 → Dec 2025 (`cells.json` years 2000–2025). No 2026 month exists in any product; README title says "2000 → today". The S-NPP→NOAA-20/21 bridge that would carry it to today is fitted (`data/factors/bridge.json`) but applied to nothing |
| Web application taking the harmonized data as input | **Not met** | `https://spaceapps.geofuego.com.ar/` returns a placeholder page ("Build starts Nov 14, 09:00 ART", `noindex`) — checked 14 Nov ~15:00 ART. No app code in the repository |
| User selects a region and a date range | **Not met** (data ready: `cells.json.gz` 1.1 MB, 0.25° cells, band bins included) | — |
| Download analytics and visualizations | **Not met** | — |
| Burning-activity calendar (month × year) | **Not met** as a visual; the table behind it exists | — |
| Which periods/years burn more; current fire vs previous ones | **Not met** (needs the 2026 live month + bridge) | — |
| Color ramps, accessible | **Not met** (viridis used in the static figures only) | `figures/*.png` |
| Downloadable CSV of hotspots detected during a search | **Not met** (planned Worker + R2; nothing built) | — |
| Interactive map / draw AOI / enter lat-lon | **Not met** | — |
| Historical comparisons, anomalies vs multi-year averages | **Not met** in a tool; computable from the CSVs | — |
| "Number of fires detected" | **Partially met** | Unit is VIIRS-equivalent 375 m pixel counts, declared in README "Known limits"; no fire-event unit |
| Target audience (responders, scientists, land managers) | **Partially met** | Scientists can use the CSVs today; responders cannot use anything yet |
| Use NASA FIRMS (the only listed resource) | **Exceeds** | 26 MODIS + 14 VIIRS country archives + 9 SP archives, sha256 in `data/raw/MANIFEST.json` |

Where it goes beyond the statement (verified to exist): hierarchical factor per cell × month × satellite set; separate Terra-only era; thermal-source class kept as its own column; outage-aware pairing and gap filling; calibrated asymmetric 80 % interval with measured coverage; S-NPP end-of-mission bridge; negative results reported (ENSO, day/night, additive term); cloud flag from ERA5.

---

## 2. Judging rubric (as it stands today: repository + docs, no app, no demo)

| Criterion | Score today | With a working app + demo + the must-fix list of §5 |
|---|---|---|
| Impact | 3 | 4 |
| Creativity | 4 | 4 |
| Validity | 3 | 4.5 |
| Relevance | 3 | 4.5 |
| Presentation | 2 | 4 |
| **Total** | **15 / 25** | **21 / 25** |

**Impact — 3.** The problem is real and the product (a 25-year consistent series with a stated error, plus continuity after S-NPP) is what a fire agency needs. Today nobody outside a data scientist can use it: CSVs in a private repository. One country. Capped at 3 until a responder can open a page and read the calendar for their area.

**Creativity — 4.** Not "multiply by 3.5": the thermal-source class, the Terra-only set, paired-day calibration, the bridge and the measured interval are uncommon at hackathon level. Not 5: the estimator is standard shrinkage on ratios, the unit is still raw pixel counts, and the levels are administrative.

**Validity — 3.** The rubric joins scientific soundness with completeness and usability. Science alone is 4: headline numbers reproduce exactly and the validation is unusually self-critical. It is not higher because of the input inhomogeneity in §4.2 (new, verified), stale and mislabelled numbers in README/audit (§4.1), and an interval that fails for low-count aggregates (§4.4). "Fully developed, usable, user-friendly" is zero today, which caps the criterion.

**Relevance — 3.** NASA data is the core, not decoration (5 on that half). But the project must "fully and directly address the challenge", and the challenge is a web application with AOI selection, calendar and CSV. None of that exists. With the app: 4.5.

**Presentation — 2.** Judges evaluate "the demo and full project". There is no demo. README is accurate in spirit but reads as an audit log: 13 table rows of validation before a reader learns what the product looks like; no calendar image; one headline figure contradicts the README row that describes it (§4.1). The 30-second video and the form text will set this score.

**What a winning global entry needs** (my inference from the rubric and the award list): a polished public app a judge understands in 20 seconds (draw area → calendar → "this month vs history" → CSV); one image that shows the splice problem and its removal (the lower panel of `figures/external_validation_Argentina.png` is nearly that image); one honest accuracy sentence ("±10 % per province-season, ±3 % national, tested on years never used"); a 30-second demo with a user story, not a methods story; evidence that it runs elsewhere (one neighbouring country) for the global awards. The scientific depth already present is enough for "Best Use of Science" contention only if the app exists and §4.2 is fixed or declared.

---

## 3. Rules compliance

| Item | Status | Detail |
|---|---|---|
| Open-source licence for original content | OK | `LICENSE`: MIT for code; CC BY 4.0 for data/figures. CC BY is not an OSI licence, but OSI licences are for software and the T&C alternative is "freely available"; low risk. `CITATION.cff` states both |
| Public, no-login links | **Blocking today** | Checked 14 Nov ~15:00 ART: `doi.org/10.5281/zenodo.24220107` → 404 (reserved, unpublished); GitHub repo → 404 (private); app → placeholder with `noindex`. "If judges can't access your project, it can't be evaluated." All three are in the README. Planned for Sunday 13:30; test in a private window after |
| Demo ≤ 30 s or ≤ 7 slides | Not produced | Exceeding either limit removes Global Judging eligibility |
| English everywhere | OK in the repository | The 3-minute Spanish video is for the local instance only; the global demo needs English subtitles if spoken in Spanish |
| NASA data used | OK | FIRMS is integral |
| Space Agency Partner data | Not used | CONAE authored the challenge; "highly encouraged", not required. A CONAE cross-check would add to Relevance |
| All sources cited, licences identified (T&C "Use of third-party materials") | **Partial** | README lists FIRMS, ONI, GWIS/JRC, ERA5, IGN. Missing: the licence/terms of each source in one table (T&C: "Any licenses applicable to your Solution Materials must be identified in the documentation"); ERA5 absent from `CITATION.cff` notes and from the README reference list (it needs the Copernicus attribution line and Hersbach et al. 2020); FIRMS's own citation text; app libraries, map tiles and fonts when the app exists. NASA "reserves the right to remove nominations" for missing citations |
| SI acknowledgment: code | OK | Header in every script and `lib/*.js` except `lib/provincias.js` (data, pre-existing; has its source line) |
| SI acknowledgment: data ("descriptive text and metadata") | **Partial; README overstates** | README l.63: "Datasets carry the same acknowledgment in their metadata". Verified: only `harmonized_cells.csv`, `harmonized_provinces.csv` and `cells.json` carry it. `factors.csv/json`, `bridge.csv/json`, `counts.json`, `coverage.json`, `static_cells.json`, `grid.geojson`, all `data/validation/*`, `ha_per_hotspot.*` do not |
| SI acknowledgment: documents | **Gap** | `docs/peer_review_round2.md` does not say how it was produced; the audit calls it "independent reviewer, no prior context". If it is SI-written (as round 1 and this file are), say so in the file and in README, otherwise a judge reads it as a human expert endorsement |
| SI not used "to come up with your idea" | Cannot verify | README states the approach is the team's. The 13 Nov design document (outside the repository) supports that the design predates the code |
| Work before the hackathon (FAQ: "Teams are not allowed to begin working on the challenges prior to the hackathon") | **Risk — disclose precisely** | Git history is inside the window (first commit 09:04 ART 14 Nov; verified). But `METHOD_DESIGN.md`, dated 13 Nov, records a feasibility run with "LOYO 14 folds, province season error 9.9 % (cell×month) vs 17.0 % (scalar)", a placeholder site created 13 Nov and a Leaflet.draw test. README declares "Preliminary feasibility check … (Sept–Nov 2026)", which is true but vague. Recommendation: in the form, state exactly what existed before 09:00 (design document, feasibility numbers, placeholder page, the production platform) and that all repository code was written inside the window. Precise disclosure is the defensible position; whether a pre-hackathon LOYO run is acceptable is the organisers' call, not mine |
| NASA branding in generated content | OK | Figures carry text credits only ("NASA FIRMS", "NASA Space Apps 2026"); no logos. Keep it that way in the video and PNG export |
| Commercial promotion (T&C: no "material that promotes commercial services or products") | Low–moderate risk | Team name is a domain; `CITATION.cff` affiliation lists two projects; the plan links the app from the platform's home page. Keep mentions factual ("pre-existing work"), no calls to action in the app |
| Persons under 18, PII | OK | None found. ORCID and name in `CITATION.cff` are the author's own choice |
| Team eligibility | OK per the kit | One member, Local Event (minimum 1) |

---

## 4. Scientific peer review

### 4.1 Numbers re-computed

| # | Claim (source) | My result | Status |
|---|---|---|---|
| 1 | LOYO season error TA 3.3 / 10.2 / 30 % (README) | 3.26 / 10.18 / 29.69 % with my own metric code | agrees |
| 2 | Naive scalar 8.7 / 15.7 / 34 % (README row 1) | 8.69 / 15.70 / 33.84 % | agrees |
| 3 | Ablation "scalar 17.1 → 15.7 → 14.8 → 13.7 → 10.4 %" (README row 3, audit l.55) | `loyo_summary_ablation.csv` and the figure: **15.7 → 14.3 → 13.8 → 13.7 → 10.2** | **stale**; README contradicts row 1 and its own figure. The province step now adds 0.1 point over region |
| 4 | Terra-only 5.8 / 17.5 %, worst year 0.79 | 5.78 / 17.55 %, 0.786 (2022) | agrees |
| 5 | Split-window country 0.94 / 1.03, province 12.5 / 14.0 % | 0.937 / 1.032; file says 12.1 / 13.9 % | agrees (province figures slightly stale) |
| 6 | Forward TA 1.035 / 1.02; T 0.87 / 0.75 | 1.038 / 1.015; 0.873 / 0.741 | agrees (stale third decimal) |
| 7 | Backward 2003–2011 0.94–1.04, q80 0.20 | 0.940–1.037, 0.206 | agrees |
| 8 | Interval coverage country 90 / province 82 / cell 80 %; Neuquén 82, Chubut 80, TdF 33 % | file: 89.6 / 81.8 / 79.8; 81.8 / 80.0 / 33.3. My recomputation with the committed bins: 89.6 / 82.4 / 79.8 | agrees |
| 9 | Committed factors reproducible | re-fit from `counts.json`: max difference 0 over 100 632 cell-month factors; country Aug 3.02, Neuquén 3.65, Santa Cruz 5.32 | agrees |
| 10 | "30 % of cell-months" have a cell-level estimate | TA 14 696 / 50 316 = 29.2 %; Terra-only set 18.4 % | agrees for TA; Terra-only not stated |
| 11 | 673 cells, 1.4 % of hotspots; Neuquén 56 %, Santa Cruz 25 %, TdF 26 % | 673; 1.38 %; 57.0 / 27.0 / **18.8 %** (land cells of the grid) | agrees except TdF (different denominator; state which) |
| 12 | Bridge 0.980 / 0.951, 1 006 of 1 096 days, spread 0.93–1.16 and 0.89–0.99 | 0.9798 / 0.9508; 1 006 / 1 096; 0.931–1.163, 0.889–0.989 | agrees. `docs/bridge_review.md` table still shows 0.94–1.03 / 0.92–0.99 (**stale**) |
| 13 | MCD64A1 consistency 0.97 vs 3.10 | 0.978 vs 3.094 | agrees |
| 14 | Argentina 2001 = 268 128; 2012 = 184 148; 2022 = 274 472; Jan 2012 = 20 400 [18 674–22 598] (audit) | CSV: 266 360; 182 150; 273 034; 20 162 [18 423–22 320] | **stale** (≤ 1 %; changed by the flare rule, audit not updated) |
| 15 | Static-class V/M "3.6 (2012) → 13–26 (2019–2025)" (`static_sources_review.md`) | `country_year.csv`: 5.7 (2012) → 19.5, 16.2, 15.0, 13.0, 14.9, 9.6, 16.2 | **stale** |
| 16 | "Patagonia annual V/M = 4.03" (audit l.36) | 3.77 | **stale** |
| 17 | MODIS `version`: "6.2 up to 2018, 6.03 for 2019–2022" (README l.47) | raw files: 6.2 through **2017**, 6.03 **2018**–2022, 61.03 2023–2025 | **wrong by one year**, and the boundary matters (§4.2) |
| 18 | "where MODIS saw nothing the model returns zero (23 % of Terra-only cell-months with predicted 5–15)" (README row 6) | `share_V_zero` in `05_loyo.mjs` l.136 is the share of months where the model predicted 5–15 and **VIIRS observed zero** | **mislabelled**: it measures over-prediction, the opposite case (§4.3) |
| 19 | Examples Neuquén Jan 2008 [34–171], Chubut Feb 2008 [204–522], Chaco Sep 2008 [4 571–5 916] | CSV: [33.7–170.7], [203.5–522.1], [4 571–5 915.8] | agrees |

Thirteen of nineteen agree; six are stale, wrong or mislabelled. No fabricated result found. The failures are stale text after the 13:03 flare-rule commit and one mislabelled statistic.

### 4.2 New finding: the FIRMS `type` flag is not homogeneous across MODIS archive versions (verified on raw files)

`03_aggregate.mjs` keeps `type == 0`. In the MODIS country files the share of `type = 2` (static land source), confidence ≥ 30:

| years | `version` | type-2 share of MODIS detections |
|---|---|---|
| 2003–2017 | 6.2 | 0.4–1.8 % (found almost only in Buenos Aires) |
| 2018–2025 | 6.03 / 61.03 | 2.3–4.9 % |

The same fixed sites flip label at the version boundary. Example near −34.87, −61.53: 11–66 detections per year, all `type 0`, every year 2001–2017; 20–57 per year, all `type 2`, every year 2018–2025. VIIRS reports almost nothing there (0–2 per year). After 2018 the type-2 detections are 90–95 % daytime and 55–68 % fall in Nov–Feb. The team's thermal-source mask does not replace the flag: only 5–12 % of the 2018+ MODIS type-2 detections fall inside the 673 cells (the rules need night or 9-of-12-month persistence). By province, 2018–2025: Buenos Aires 33.9 % of MODIS detections are type 2 (11.6 % in 2012–2017), Mendoza 16.8 %, San Juan 12.2 %, Córdoba 8.0 %, Tucumán 6.1 %, Neuquén 5.4 % (all ≈ 0 % before 2018).

Consequences:
1. **The "MODIS vegetation" population changes in the middle of the calibration window** (6 years each side), and the whole reconstructed period 2000–2011 is the pre-2018 population.
2. **Part of the "drift" is this artefact.** National V/M, ratio of sums, late (2018–23) over early (2012–17): 1.095 with the team's definition, 1.066 when MODIS type 0 + 2 is used on both sides. About 3 of the 9.5 points are the flag. README attributes the drift to an unknown cause and uses it to state the extrapolation error.
3. **Reconstructed years are biased high where these sites are.** Full-window factor over early-window factor: country 1.044, Buenos Aires 1.20, Mendoza 1.11 (upper bounds for the artefact: real change between the halves is mixed in). And in 2000–2011 those static detections are multiplied by f ≈ 3 as if they were fire. 110 cells have their own factor below 1.0 (down to 0.03, w ≥ 0.5): the cell level learned to cancel them, but in those cell-months MODIS reports 420–970 detections per year in 2001–2017 and about 100 per year from 2018.
4. The dark "salt-and-pepper" cells of the Pampas in `figures/factor_map_08_TA.png` are this effect, not noise.
5. README claim "95 % of NASA FIRMS's own type = 2 detections fall inside" the class is computed on **VIIRS only** (`audit_static_sources.mjs` l.28 skips MODIS). For MODIS it is 5–12 % after 2018.

Not verified: why FIRMS changed the labelling (needs the FIRMS documentation; the README lists this check as pending).

Fix (2–3 h): build a MODIS static mask from the locations of 2018–2025 type-2 MODIS detections (0.02° cells, dilated by one cell), apply it to MODIS in all years, re-run 03 → 06 and the validation. Fallback (20 min): declare it in README "Known limits" with the table above and correct the version years.

### 4.3 The structural zero is larger than stated, and is mis-described

Verified on paired days 2012–2023: 44.5 % of VIIRS-active cell-months, holding 7.2 % of VIIRS hotspots, have no Terra+Aqua detection; for Terra alone 66.7 % and 20.3 %. The ratio of sums absorbs this in aggregates (f is inflated to compensate), so provinces are unbiased, but single cells are wrong in both directions: over-predicted where MODIS saw fire (median residual −0.39 in log for predicted 5–15), zero elsewhere.

Visible in the product: non-zero cell-months per year are 9 719 in 2003–2011 and 12 060 in 2012–2020, although the harmonized national total is about 40 % *higher* in the first period. A user who draws a small area gets a calendar whose share of months with fire steps up at 2012, and a "historical median" pulled toward zero by the reconstructed years. For small areas the sensor of origin still matters. Rows with H = 0 carry no interval, and 31.5 % of reconstructed non-zero cell-months have H < 5, where the interval is borrowed from the 5–15 bin and was never calibrated (`bandLog` in `06_harmonize.mjs` l.51; residuals are recorded only for P ≥ 5).

The additive term was tested and rightly rejected for the values. The consequence for the app is still open: enforce a minimum AOI (my reading of `aoi_error_curve.json`: about 9–25 cells), or show small-AOI pre-2012 months as "≥" values with a visible warning.

### 4.4 The prediction interval

Holds: (a) cell and province coverage per region reproduce; (b) a test the team has not reported and should — **2024 and 2025, used neither for factors nor for the bins**: province-months inside the interval 81 % and 81 % (n 204, 206), cell-months 80 % and 76 %, country 10/12 and 11/12 months (TA set). This is cleaner evidence than the leave-one-year-out on residuals, which is not fully nested (the residuals of the other 11 years come from factors fitted with the test year).

Does not hold:
- **Low-count aggregates.** Province-months with predicted count below 30: coverage 65 % (TA, n 494) and 60 % (Terra-only, n 422), with 34 % and 40 % of observations *above* the upper bound and about 1 % below. The published per-province table uses P ≥ 30 and hides it. Cause: the bins pool cell and province residuals, cells dominate (61 748 vs 3 021), and a cell with P ≥ 5 is a selected over-prediction, while a province with a small total is under-predicted (structural zeros of its other cells). The "level-agnostic" design fails exactly for the user-drawn AOI with little fire.
- **Terra-only era, province level:** 78 % coverage with 19 % above and 3 % below (Misiones 62 %, 37 % above). The interval is shifted low for 2000–mid 2002.
- Terra-only split-window is not reported: 0.892 and 1.058 (`band_calibration.json`). README's "≈ 5–8 %" is the Terra+Aqua figure; for 2000–mid 2002 it is ≈ 6–11 %.
- Country coverage 90 % for a nominal 80 %: conservative, harmless, but say so.
- Observed months have no interval; the annual interval is the sum of monthly bounds (declared).

### 4.5 Thermal-source class: sound idea, overstated independence, tuned on the test

- The audit's "signatures never used by the rule" (`static_sources_review.md` table; header of `audit_static_sources.mjs`) include night fraction and FRP. Night fraction is an input of both rules (≥ 50 %, ≥ 70 %); FRP < 3 MW is an input of the second. Night 0.835 vs 0.263 and FRP 1.35 vs 5.36 MW are therefore partly true by construction. Independent evidence left: seasonality (1.9 vs 9.1) and VIIRS type-2 co-location.
- The second rule was introduced because the two worst LOYO provinces were the oil basins, its FRP limit was chosen after seeing what it caught, and it is justified by LOYO and coverage on the same years. LOYO 10.4 → 10.2 % is inside fold noise. It is physically reasonable; it is also a choice made on the validation target and should be declared as such.
- The mask is time-invariant and built mostly from VIIRS: 57 % of Neuquén's VIIRS hotspots but 13.8 % of its MODIS hotspots are in the class. Vegetation fire in those cells before the wells existed is removed from the 2000–2011 series. Declared in review 1, still unquantified.
- The calendar excludes this class by default. For Neuquén that is more than half of what FIRMS shows. The app must say so and offer the column.

### 4.6 Method: remaining points

- **Estimator, pairing, drift window, Terra-only set, gap filling:** correct in design; code matches the description (`lib/factors.js` shared by fit and validation; verified by exact re-fit).
- **Shrinkage** is a count rule with one K, not an estimated variance ratio; K = 10 was the grid edge (already conceded as "within noise").
- **Regions:** the Patagonia August regional factor is 3.19, set by Neuquén and Río Negro; Santa Cruz's own ratio is 6.5 and Chubut's 4.7; Tierra del Fuego (no MODIS in August in 12 years, raw V = 11, M = 0) is assigned 3.19. Round 2 raised this; the audit's answer (interval not verifiable) is honest but the factor itself for TdF is a guess. The map shows Patagonia as flat blocks.
- **ENSO:** conclusion (not adopted) is right. The three La Niña years are consecutive at the end of the window and overlap the type-flag change of §4.2, so the r = −0.37 and the 0.025·ONI widening are confounded twice.
- **Cloud:** test A (r = 0.02) is sound. The "−26 % per +0.10 cloud" slope is observational and confounded (declared as an upper bound); using it to widen the upper bound is a judgement, not a calibration.
- **Level shift at the splice:** the harmonized annual mean is 255 541 in 2003–2011 and 180 685 in 2012–2025. A hostile reader will call it an artefact. It is not: raw Terra+Aqua counts give 81 358 vs 54 972 (ratio 1.48) on the same split. Show the MODIS-only series, which runs through 2025, next to the harmonized one.
- **Bridge:** sound; `bridge.json` (14:05 UTC) was fitted with the 204-cell mask, before the 673-cell mask (16:01 UTC): re-run. The static-class NOAA-21/S-NPP ratio of 0.75 is still unexplained. No product uses the bridge yet.
- **Leakage (minor, declared in part):** mask, outage list, region table, K and bin edges use all years.

### 4.7 Stale or inconsistent artefacts (verified by timestamps and content)

Flare-rule mask is from 16:01 UTC. Older and not regenerated: `bridge.json` (14:05), `enso_tests.json` (14:58), `ha_per_hotspot.*` (14:51, also before the January 2012 fix), `factor_map_08_T.png` (15:25), `loyo_*_regions/_noregions` (14:46, comparison only). Stale comments: `06_harmonize.mjs` l.7 ("band = H·exp(±1.28·σ_TA) (≈ IC 80 %)") and unused `EMP`, `N_CELLS_PROV`; `05c` header (medians "used by 06"); `05d` and `fig_external_validation.py` headers ("independent" MCD64A1); `audit_static_sources.mjs` header. Data notes say "MODIS C6.1" for files whose `version` reads 6.2 / 6.03 / 61.03. `harmonized_provinces.csv` names its province column `region`, which elsewhere means fire-regime region. The audit's claims "headers rewritten" and "stale text fixed" hold for README and partly for the scripts.

### 4.8 Do the team's answers to rounds 1 and 2 hold?

Hold (verified): January 2012 fix; split-window and backward tests; count-binned asymmetric interval; Terra-only validation and own bins; forward test; MCD64A1 reframed; K = 10 and CAP stated honestly; clean-clone fetch scripts; `package.json`; regional interval. Partly hold: "truth in labelling" (new stale numbers appeared after the flare rule; item 18 above); "95 % type 2" (VIIRS only). Open by the team's own list: second country, spatial pooling, event/FRP unit, outage list vs official records, land-cover covariate, independent truth.

---

## 5. What we have / what is missing / how to improve

Effort is for one person with SI assistance. Impact names the judging criteria.

### 5.1 What we have (verified)
1. A reproducible harmonization engine whose committed factors re-fit exactly and whose headline errors reproduce (3.3 % country, 10.2 % province, out-of-sample).
2. Harmonized monthly series Nov 2000 – Dec 2025 for 4 193 cells, 24 provinces and the country, with sensor flag, gap-fill flag and an 80 % interval that holds at 81 % on two years never used.
3. An app-ready payload (`cells.json.gz`, 1.1 MB) with band bins and region table.
4. A thermal-source class and an S-NPP→NOAA bridge, both fitted and documented.
5. Provenance: sha256 manifests, MIT + CC BY, CITATION, SI headers in all code.
6. A record of tested-and-rejected ideas, which is rare and credible.

### 5.2 What is missing

**Must fix before publishing / submitting**

| # | Item | Effort | Criteria |
|---|---|---|---|
| M1 | The web app: AOI (province picker + rectangle is enough; polygon if time), date range, month × year calendar with viridis/cividis, anomaly vs median, calendar CSV download | 6–10 h | Relevance +1.5, Validity +1, Impact +1, Presentation +1 |
| M2 | Demo ≤ 30 s (or ≤ 7 slides), English subtitles, public link tested in a private window | 2 h | Presentation +2; eligibility |
| M3 | Publish: repository public, Zenodo record published, `noindex` removed; re-test the three README links | 30 min | eligibility (judges cannot open any of them today) |
| M4 | README stale/mislabelled numbers: ablation row (→ 15.7 / 14.3 / 13.8 / 13.7 / 10.2), version years (6.2 to 2017), the "23 %" sentence, "→ today" vs Dec 2025, forward 1.038 / 1.015, "95 % type 2 (VIIRS)", "datasets carry the acknowledgment" | 30 min | Validity, Presentation |
| M5 | Type-flag inhomogeneity (§4.2): minimum = declare it with the table; better = MODIS mask from 2018+ type-2 locations and full re-run | 20 min / 2–3 h | Validity +0.5; removes the strongest expert attack |
| M6 | Small-AOI guard in the app (§4.3): minimum AOI or explicit "lower bound before 2012" marking; thermal-source class toggle with a note for Neuquén | 1 h (inside M1) | Validity, Impact |
| M7 | Sources-and-licences table in README (FIRMS, ERA5 with Copernicus attribution, GWIS/JRC, NOAA ONI, IGN, later tiles/libraries/fonts); ERA5 in `CITATION.cff` | 30 min | rules (nomination can be removed for missing citations) |
| M8 | Label every SI-written document (round 2 review, this file) and add the SI line to the remaining data files, or narrow the README sentence | 20 min | rules |
| M9 | Precise pre-hackathon disclosure in the form (design doc, feasibility numbers of 13 Nov, placeholder site, production platform) | 15 min | rules |
| M10 | Re-run stale outputs: `04b_bridge`, `05d`, `05e`, `fig_factor_map 8 T`; update audit numbers of item 14, `bridge_review.md` table, `static_sources_review.md` ratio line | 30 min | Validity |

**Missing, not blocking**

| # | Item | Effort | Criteria |
|---|---|---|---|
| N1 | "This month vs history": 2026 live months through the bridge, percentile vs 2000–2025 | 2–3 h | Relevance +0.5, Impact +0.5 (the statement's own example) |
| N2 | Raw hotspot CSV for the searched AOI | 2–4 h (2026-only fallback 1 h) | Relevance |
| N3 | PNG export of the calendar with text credit | 1 h | Presentation |

### 5.3 How to improve the Argentina product (after the must-fix list)

| Priority | Item | Effort | Expected effect |
|---|---|---|---|
| 1 | Report the 2024–2025 interval coverage (81 % / 81 % province, 80 % / 76 % cell) in README | 15 min | Strongest single validity sentence available; free |
| 2 | One headline image: MODIS-only, VIIRS-only and harmonized national series on one axis with the interval, 2000–2025 | 45 min | Presentation; answers "is the drop at 2012 real?" |
| 3 | Low-count aggregate interval: fit bins on province/block residuals separately below P = 100, or include P < 5 and block residuals from `05c`; publish coverage for P < 30 | 1.5 h | Fixes 65 % / 60 % coverage; matters for every small AOI |
| 4 | Terra-only province interval recentred (19 % above vs 3 % below); report Terra-only split-window 0.89 / 1.06 | 45 min | Honest 2000–mid 2002 |
| 5 | README restructured for a judge: what it is, one image, five numbers, how to use the app, then the validation table | 1 h | Presentation +0.5 |
| 6 | Quantify vegetation fire lost under the time-invariant thermal mask before 2012 (MODIS counts inside the 673 cells by year, Neuquén) | 30 min | Closes a three-round-old open point |
| 7 | Patagonia: fit Santa Cruz + Chubut + Tierra del Fuego as a southern sub-region, or state that TdF's factor is assigned | 1 h | Validity for the weakest region |
| 8 | CONAE cross-check on one season, if their hotspot catalogue is reachable | 1–2 h | Relevance (partner data) |
| 9 | Outage list against official mission records | 1 h | Robustness |
| 10 | Fire-event unit (cluster within 1 km / 1 day) as a second column | 4 h+ | Creativity; answers "number of fires" |
| later | Second country, spatial pooling instead of provinces, independent truth (Landsat/Sentinel-2) | days | Global awards |

Advice on order with roughly 30 hours left: M1 → M5 (declare) → M4 → M2 → M3 → M7–M10 → items 1, 2, 5 → N1. Do not add method features before the app exists.

---

## 6. Verdict

1. The harmonization is real, reproducible and better validated than the statement requires; 13 of 19 re-computed numbers agree, the other six are stale or mislabelled text, and none is invented.
2. The entry does not yet meet the challenge: there is no web application, no demo, and none of the three public links works. Score today 15/25; about 21/25 if the app, the demo and the must-fix list land.
3. One new input defect was found and measured: the FIRMS MODIS `type` flag changes at the 2017/2018 archive-version boundary, inside the calibration window; it explains about a third of the reported drift and inflates Buenos Aires and Mendoza before 2012. Declare it at minimum.
4. For small areas before 2012 the sensor of origin still matters (44.5 % of VIIRS-active cell-months invisible to MODIS) and the interval fails for low-count aggregates (60–65 % coverage); the app must guard against both.
5. Publish only after the stale README numbers, the source/licence table and the SI labels are fixed; they are cheap and each is a way to lose a nomination.
