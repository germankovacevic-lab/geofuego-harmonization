# GeoFuego Harmonization

**MODIS → VIIRS-equivalent harmonized fire-hotspot calendar for Argentina, 2000 → today, with a calibrated uncertainty band.**

NASA Space Apps Challenge 2026 · Challenge: *Harmonization of MODIS and VIIRS Hot Spots* (CONAE) · Local event: Buenos Aires · Team: **GeoFuego.com.ar**

DOI (this work): https://doi.org/10.5281/zenodo.24220107 · App: https://spaceapps.geofuego.com.ar/

## What this is

MODIS (2000→, 1 km) and VIIRS (2012→, 375 m) count fire differently, and the ratio between them is not a constant: it depends on region, calendar month and satellite overpass time, and it is a different ratio altogether for persistent thermal sources (gas flares, industry). This repository contains:

1. A **harmonization engine**: a VIIRS/MODIS factor per 0.25° cell × calendar month × satellite set (Terra+Aqua; Terra only), fitted as a ratio of sums on **paired days** of the **2012–2023** overlap (orbit-drift years 2024–2025 excluded), with hierarchical shrinkage cell → province → fire-regime region → country (K = 10, chosen by leave-one-year-out).
2. A **persistent-thermal-source class** (gas flares, refineries, kilns, sawmill boilers, landfills) detected by two physical signatures (persistence ≥ 9 months in 12 **and** ≥ 50 % night detections), kept as a separate column, never dropped.
3. A **harmonized monthly series 2000 → 2025** per cell, province and country in VIIRS-equivalent counts, with sensor-of-origin flag, satellite-outage gap filling across sensors, and an **IC80 band calibrated on out-of-sample residuals** (by number of cells and satellite set).
4. A **bridge S-NPP ↔ NOAA-20 / NOAA-21** (g = 0.980 / 0.951, fitted on 2023–2025 standard-processing archives on paired days) so that the series continues after S-NPP's end of mission (2026-11-01) and the 3-satellite live series can be expressed in S-NPP-equivalent units.
5. A web app (in progress) where the user draws any area of interest, picks a date range, and gets the 26-year calendar, the current month vs the historical median, and downloadable CSV/PNG.

All code in this repository was written during the hackathon window (14–15 Nov 2026, Buenos Aires time); git timestamps are the record.

## Validation at a glance (`docs/audit_2026-11-14.md`, `docs/peer_review_fable52.md`)

| test | result |
|---|---|
| Leave-one-year-out 2012–2023, fire-season error (Terra+Aqua set) | country **3.3 %** · province **10.4 %** · single cell 30 % (naive national scalar: 8.6 / 17.1 / 34 %) |
| Ablation ladder (province error) | scalar 17.1 → country×month 15.7 → +region 14.8 → +province 13.7 → +cell **10.4 %** |
| Forward test on years never used (Terra+Aqua) | 2024: predicted/observed **1.035** · 2025: **1.02** |
| Terra-only set (used 2000 – mid 2002) | country 5.8 % · province 17.5 % · worst year 0.79: wider band by construction |
| Band calibration | IC80 = 80th percentile of out-of-sample \|log(V/P)\| by n cells and set (the earlier median-based band covered ≈ 60–65 %, see `band_calibration.json`) |
| Consistency across the 2012 splice vs MODIS burned area (MCD64A1) | burned ha per hotspot pre/post 2012: **0.97** harmonized vs **3.10** naive concatenation (not an independent validation: MCD64A1 is trained with MODIS active fires) |
| S-NPP/NOAA bridge vs production NRT data (different pipeline) | 0.982 vs 0.980 (NOAA-20) |
| ENSO dependence of the ratio (team hypothesis) | real (r = −0.37 monthly) but small; conditioning did not improve out-of-sample skill → carried as extra band width in strong-phase months |

## Pre-existing work (declared, cited)

- **GeoFuego** (https://geofuego.com.ar): live national fire-monitoring platform (NASA FIRMS ingestion every 3 h, provincial calendar, GeoFuego Index). Method package: concept DOI https://doi.org/10.5281/zenodo.23017739 (current version v1.2.0: https://doi.org/10.5281/zenodo.24164911).
- Preliminary feasibility check of the MODIS/VIIRS ratio (Sept–Nov 2026) informed the method design; its numbers are reproduced here by the scripts, not copied.
- Province polygons (IGN Argentina, simplified) reused from GeoFuego (`lib/provincias.js`).

## Data

- **NASA FIRMS** active fire archive by country: MODIS C6.1 (2000–2025) and VIIRS S-NPP (2012–2025) — `scripts/01_fetch.mjs`, sha256 of every file in `data/raw/MANIFEST.json`.
- **NASA FIRMS Area API**, standard processing: VIIRS S-NPP, NOAA-20, NOAA-21 2023–2025 over Argentina (bridge only) — `scripts/01b_fetch_viirs_sp.mjs` (needs a free FIRMS MAP_KEY in `~/.config/nasa/firms-map-key`).
- **NOAA CPC Oceanic Niño Index** and **GWIS/JRC burned-area tables (MCD64A1, MVP64)** — `scripts/01c_fetch_aux.mjs`; Argentina rows committed in `data/external/`.
- Raw hotspot CSVs are not committed (≈ 1 GB); derived products are published in the Zenodo record.

## Pipeline

`01_fetch` → `02_grid` → `03a_static_sources` → `03b_coverage` → `03_aggregate` → `04_factors` → `05_loyo` (+ `05b` consistency, `05c` AOI curve, `05d` ha-per-hotspot, `05e` ENSO) → `06_harmonize` → `04b_bridge`. Figures: `fig_*.py`. Everything runs with Node ≥ 20 and Python 3 (numpy, matplotlib).

## Super Intelligence (SI) acknowledgment

This project was built with SI coding assistance: **Claude (Anthropic)**, via Claude Code / OpenClaw; an independent peer review of the method was also produced with Claude (`docs/peer_review_fable52.md`). SI was used for code generation, review, debugging and English editing. The problem framing, the harmonization approach, the hypotheses tested and all validation decisions were made by the team; every number reported is produced by the scripts in this repository from NASA FIRMS data. Each script carries the header `Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.` Datasets carry the same acknowledgment in their metadata. No SI-generated imagery, video or audio is used. No NASA branding is used in any generated content.

## License

- Code: MIT (see `LICENSE`). Data products and figures: CC BY 4.0.

## Citation

See `CITATION.cff`. References: Giglio, Schroeder & Justice (2016) RSE 178; Schroeder et al. (2014) RSE 143; Giglio et al. (2018) RSE 217 (MCD64A1); NOAA CPC ONI; GWIS/JRC country profiles; IGN Argentina.
