# Changelog

## v1.1.0 — 2026-11-16 · Coverage correction: Islas Malvinas

**Finding.** The NASA FIRMS country archive for Argentina (`modis_<year>_Argentina.csv`, `viirs-snpp_<year>_Argentina.csv`), used for the 2000–2025 record, does not include the Islas Malvinas, which are part of the province of Tierra del Fuego, Antártida e Islas del Atlántico Sur (Ley 23.775; Instituto Geográfico Nacional, IGN: 50°59′–52°57′ S, 57°42′–61°28′ W). FIRMS distributes their detections in a separate country archive (identifier `Falkland_Islands`; file names kept as published so URLs and SHA-256 can be verified). In v1.0.0 the grid, built from the IGN province polygons, already assigned 43 cells of the islands to the province, but they carried no data; the preliminary 2026 layer, fetched by bounding box, already included them.

**What changes.**
- `scripts/01g_fetch_malvinas.mjs` downloads the separate archive (MODIS 2001–2023 and VIIRS S-NPP 2012–2025; years without detections have no file) into `data/raw/` with `data/raw/MANIFEST_malvinas.json`.
- `scripts/03_aggregate.mjs --tag=_malvinas` aggregates it with exactly the same filters into `data/agg/counts_malvinas.json` (1 732 detections kept in 38 cells; 71 offshore `type 3` and 129 low-confidence detections dropped; 28 on islets the simplified IGN polygon does not cover, the same rule as on the mainland coast; no fixed heat source under the v1.0.0 rules).
- `scripts/06_harmonize.mjs` merges those cells **after** every quantity derived from the v1.0.0 record. They take the frozen Tierra del Fuego province factor with own weight 0 — the v1.0.0 rule for any cell without own paired data. They add to Tierra del Fuego like any other area of the province; there is no separate unit.
- `scripts/08_app_payload.mjs` includes them in the raw series of the app.

**What does not change.** No factor, interval band or validation figure is refitted (`data/factors/`, `data/validation/` untouched). Every value outside the islands is identical to v1.0.0 (verified row by row). National totals change by at most 0.31 % in a year (2001, 2012). Tierra del Fuego now counts 69 cells instead of 31, so its province interval uses the next size class.

**Not covered.** FIRMS publishes no archive for the Islas Georgias del Sur and Sandwich del Sur (only volcanic anomalies would be expected there, and the method excludes them); the Antártida Argentina lies outside the grid and has no vegetation fires.

**Version submitted to the NASA Space Apps Challenge 2026 for judging:** v1.0.0 — git tag `v1.0.0`, DOI 10.5281/zenodo.24220107 (unchanged).

## v1.0.0 — 2026-11-15
Submitted to the NASA Space Apps Challenge 2026 (Harmonization of MODIS and VIIRS Hot Spots).
