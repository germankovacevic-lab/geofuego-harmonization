# GeoFuego Harmonization

**MODIS → VIIRS-equivalent harmonized fire-hotspot calendar for Argentina, 2000 → today.**

NASA Space Apps Challenge 2026 · Challenge: *Harmonization of MODIS and VIIRS Hot Spots* (CONAE) · Local event: Buenos Aires · Team: **GeoFuego.com.ar**

DOI (this work): https://doi.org/10.5281/zenodo.24220107
App: https://spaceapps.geofuego.com.ar/

## What this is

MODIS (2000→, 1 km) and VIIRS (2012→, 375 m) count fire differently, and the ratio between them is not a constant: it depends on region, calendar month and satellite overpass time. This repository contains:

1. A **harmonization engine** that fits a VIIRS/MODIS factor per 0.25° cell × calendar month × satellite set on the 2012–2025 overlap, with hierarchical shrinkage (cell → province → country) and leave-one-year-out validation.
2. A **harmonized monthly series** 2000 → 2025 in VIIRS-equivalent hotspot counts, with an uncertainty band and a sensor-of-origin flag per value.
3. A small **web app** where the user draws any area of interest, picks a date range, and gets the 26-year calendar, the current month vs the historical median, and downloadable CSV/PNG.

All code in this repository was written during the hackathon window (14–15 Nov 2026, Buenos Aires time). Git timestamps are the record.

## Pre-existing work (declared, cited)

- **GeoFuego** (https://geofuego.com.ar): live national fire-monitoring platform (NASA FIRMS ingestion every 3 h, provincial calendar, GeoFuego Index). Method package: concept DOI https://doi.org/10.5281/zenodo.23017739 (current version v1.2.0: https://doi.org/10.5281/zenodo.24164911).
- Preliminary feasibility check of the MODIS/VIIRS ratio (Sept–Nov 2026) informed the method design; its numbers are reproduced here by the scripts, not copied.

## Data

- NASA FIRMS, active fire archive by country: MODIS C6.1 (2000–2025) and VIIRS S-NPP (2012–2025). Downloaded by `scripts/01_fetch.mjs`, which logs URL, bytes and sha256 of every file.
- NOAA CPC Oceanic Niño Index (ENSO overlay).
- IGN Argentina provincial boundaries.

Raw CSVs are not committed (≈400 MB); derived products are published in the Zenodo record.

## Super Intelligence (SI) acknowledgment

This project was built with SI coding assistance: **Claude (Anthropic)**, via Claude Code / OpenClaw. SI was used for code generation, review, debugging and English editing. The problem framing, the harmonization approach (region × calendar-month × satellite factors fitted on the 2012–2025 overlap) and all validation decisions were made by the team; every number reported is produced by the scripts in this repository from NASA FIRMS data. Each script carries the header `Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.` Datasets carry the same acknowledgment in their metadata. No SI-generated imagery, video or audio is used. No NASA branding is used in any generated content.

## License

- Code: MIT (see `LICENSE`).
- Data products and figures: CC BY 4.0.

## Citation

See `CITATION.cff`.
