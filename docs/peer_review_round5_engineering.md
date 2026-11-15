> Literal English translation of the original Spanish report (original text in git history, commit 2518c20). Translated with SI assistance (Claude, Anthropic); content unchanged.
# Peer review, round 5 — engineering and reproducibility

**This review was written by an SI system (Claude Fable 5.2, Anthropic) in the role of a NASA/CONAE data engineer who receives the repo and decides whether it is reproducible, reliable and publishable; it is not the opinion of a human expert.**

Audited commit: `71a9af8` (2026-11-14 18:08 −03). Environment: macOS arm64, Node 24.22.1, npm 11.19.1, Python 3.9.6 (numpy 2.0.2, matplotlib 3.9.4, netCDF4 present, cdsapi absent). Clean clone in `/tmp/r5-repro` and a second pristine clone in `/tmp/r5-clean`. The working copy was not touched except for this file.

## Verdict

The numerical core is deterministic and reproduces: with the raw FIRMS CSVs and the ERA5 NetCDFs present, `npm run build` finishes in 74 s and regenerates `cells.json`, `cells.json.gz`, `harmonized_cells.csv` and `harmonized_provinces.csv` **byte for byte** (same sha256 as what is versioned). That is better than the hackathon average by a lot.

It is not publishable yet for four reasons, none of them substantive: the DOI does not resolve, the GitHub repo is not public, a clean clone cannot regenerate the main product without downloading ~1 GB with two credentials, and four versioned validation files are out of date with respect to the current code. In addition there are five numbers in the README that no script emits or that no longer match the output.

---

## 1. Reproducibility

What I ran and what happened, in README order:

| step | clean clone, no network | with raw files + ERA5 linked |
|---|---|---|
| `npm install` | OK, 0 dependencies, 0 vulnerabilities; **creates an untracked `package-lock.json`** | — |
| `npm run fetch` | not run (network; ERA5 requires `~/.cdsapirc` and `cdsapi`, which was not installed) | — |
| `npm run build` | **fails at the 2nd step** (`03a`: `ENOENT data/raw/modis_2000_Argentina.csv`) | OK, 74 s |
| `02_grid`, `04_factors`, `05_loyo`, `05c`, `05g` on their own | OK (1 + 0.4 + 9 + 5 + 12 s); identical outputs except `generated` | same |
| `06_harmonize` | runs, **but the result differs** (see H1) | **identical, sha256 `bd5b76b2…` / `25232d32…` / `76c2aa09…` / `f294551a…`** |
| `npm run validate` | `05_loyo --ablation`, `05b`, `05d`, `05e` OK; `05f` and `audit_static_sources` fail without inputs | OK, ~40 s; **4 outputs differ from what is versioned** (H4) |
| `04b_bridge` | fails (`need S-NPP and at least one of NOAA20/NOAA21`) | OK, identical apart from timestamp |
| `audit_flare_start_year` | fails | OK, identical |
| `npm run figures` | — | OK, 2 s; `headline` and `ablation` identical, the other 3 PNGs change |
| `npm run live` | fails (`ENOENT ~/.config/nasa/firms-map-key`) | not run (network + key; depends on the date) |
| `npm run app` | **fails outside this machine** (H3) | — |
| `npm run app:serve` | serves the app, with two defects (H12) | — |

No script came close to 15 min. The slowest is `05_loyo --ablation` (15 s).

### H1 — BLOCKING. A clean clone cannot regenerate the main product, and the README says it can
- **Evidence.** `.gitignore:12-13` excludes `data/agg/cloud_cells.json` and `precip_cells.json`. `06_harmonize.mjs:96` reads them with `try/catch` and continues without them: it prints `cloud_cells.json not found: no obscuration flag` and exits with code 0. Result in a clean clone: `cells.json` loses the `cl` block, the CSVs lose `cloud_anom`/`cloud_underdetection`, the `.gz` goes from 1 148 341 to 537 890 bytes. `git diff --stat`: 298 479 lines changed. Copying that single file from the author's machine, the four hashes match.
- **Why it matters.** Silent failure: a third party obtains a different product, without an error, and has no way of knowing it. And the README (line 7) states "Every number below is reproduced by the scripts in this repository".
- **Fix.** (a) Version `cloud_cells.json` compressed (35 MB → 9.1 MB with gzip; less if rounded to 3 decimals) and `precip_cells.json` (12 MB), or upload them to Zenodo and have a `scripts/00_get_inputs.mjs` download them verifying sha256. (b) Make `06` fail with code ≠ 0 if the input is missing, unless `--no-cloud` is explicit. **Effort: 1 h.**

### H2 — BLOCKING. The DOI does not resolve and the repository is not public
- **Evidence.** `curl -sIL https://doi.org/10.5281/zenodo.24220107` → `404`; `https://zenodo.org/api/records/24220107` → `{"status": 404, "message": "The persistent identifier is not registered."}`. `https://github.com/germankovacevic-lab/geofuego-harmonization` → `404` unauthenticated (the remote exists and `origin/main` = `71a9af8`, i.e. it is private). The app does respond 200.
- **Why it matters.** README, `CITATION.cff:6`, `deploy/index.html:27-28` point to two dead links. The README also says "derived products are published in the Zenodo record" (line 90). A judge who clicks "Method & code" or "DOI" from the app is left with nothing.
- **Fix.** Publish the Zenodo deposit (with the inputs from H1 inside) and make the repo public before submitting. If the DOI stays reserved until the last moment, say so in the README ("DOI reserved, activated on publication"). **Effort: 1–2 h, depends on the manual upload.**

### H3 — HIGH. `npm run app` depends on a private path of the author
- **Evidence.** `scripts/08_app_payload.mjs:18`: `VENDOR = ~/.openclaw/data/spaceapps-vendor`. With another `HOME`: `ENOENT …/.openclaw/data/spaceapps-vendor/leaflet-1.9.4/leaflet.js`, code 1. The libraries are already versioned in `deploy/vendor/`, so the copy is redundant. Side effect: the script dies before stamping the version into `index.html`. In addition `deploy/vendor/SHA256SUMS.txt:7` lists a `./README.md` that does not exist (`shasum -c`: "1 listed file could not be read").
- **Fix.** Delete the vendor copy block (or make it optional with `--vendor=`), and have `08` verify `deploy/vendor` against `SHA256SUMS.txt`. Remove the line for the phantom README. **Effort: 20 min.**

### H4 — HIGH. Four versioned validation outputs are stale with respect to the current code and data
- **Evidence** (regenerated vs `HEAD`, ignoring `generated`):
  - `data/validation/external_mcd64a1_annual.csv`: `hotspots_H` 2002 = 231 805 versioned vs 231 720 regenerated; 298 lines change. `external_mcd64a1.json` generated 18:05Z; current `cells.json` is from 19:32Z.
  - `data/harmonized/ha_per_hotspot.{csv,json}`: 184 lines change (2nd decimal).
  - `data/validation/cloud_tests.json`: r 0.0223 → 0.0228; slope 0.241 → 0.247.
  - `data/validation/loyo_summary_ablation.json`: provincial coverage of the interval in 2024, 0.830 versioned vs 0.757 regenerated; 2025, 0.806 vs 0.728. It is the file from before the change to size bins.
  - `figures/external_validation_Argentina.png` changes for the same reason.
- **Why it matters.** The headlines (0.98 / 3.12; r = 0.02) survive rounding, but the repo publishes artefacts that the code no longer produces. The versioned `loyo_summary_ablation.json` contradicts the versioned `loyo_summary.json` on the same metric.
- **Fix.** Run `npm run build && npm run validate && npm run figures` once and commit. Afterwards, H15 so that it does not happen again. **Effort: 15 min.**

### H5 — HIGH. `audit_static_sources.mjs` is not deterministic
- **Evidence.** `scripts/audit_static_sources.mjs:47`: `if (st || Math.random() < 0.05)` — ×20 sampling of vegetation detections, without a seed. Four runs of `by_province_viirs_share_static` (Neuquén / Santa Cruz / Tierra del Fuego): versioned 0.571 / 0.292 / 0.210; runs 0.586 / 0.251 / 0.222; 0.583 / 0.258 / 0.250; 0.589 / 0.249 / 0.255. Santa Cruz oscillates 4 points, Tierra del Fuego 4.5.
- **Why it matters.** It is the only script with unseeded randomness (`05c` and `05g` use an LCG with seed 20261114, good). And those percentages are exactly the ones the README cites (see H7).
- **Fix.** Remove the sampling: the whole script takes seconds and `provinceOf` over all rows is cheap; or reuse the seeded LCG. **Effort: 15 min.**

### H6 — MEDIUM. The README is not enough for a stranger
What I had to deduce by reading code:
1. There is no installation section: `pip install -r requirements.txt` is missing. The README says "Python 3 (numpy, matplotlib)" (line 82), but `03c`/`03d` need `netCDF4` and `01d`/`01e` need `cdsapi`.
2. `npm run all` needs **two credentials** (FIRMS MAP_KEY and CDS key). The FIRMS one is named only for `01b`; `07_live` also uses it. The path `~/.config/nasa/firms-map-key` is hard-coded, without an alternative environment variable.
3. `npm run all` does not run `fetch:bridge` or `bridge`, but the README lists `04b_bridge` inside the pipeline. `07_live` depends on `bridge.json`.
4. The README's list of steps omits `01b`–`01e`, `03c`, `03d`, `05f` and the two `audit_*`.
5. It does not say how much the download weighs (README: "≈ 1 GB"; measured: 600 MB of CSV + 59 MB of ERA5), how long it takes, nor which steps can be run without network.
6. It does not say that `npm run app` rewrites `deploy/index.html` (the tree is left dirty on every run) nor that all JSON outputs carry a `generated` that changes.
7. `npm install` does nothing (zero dependencies) and leaves an untracked `package-lock.json`.
- **Fix.** "Reproduce" section with three levels: (A) without network, from the versioned intermediates: which commands and which hashes to expect; (B) with raw files from Zenodo; (C) from FIRMS/CDS with keys. Table step → inputs → outputs → time. **Effort: 1 h.**

---

## 2. Consistency README ↔ code ↔ data

I traced 16 numbers. Source = output file regenerated in the clone.

| # | README | source | regenerated | status |
|---|---|---|---|---|
| 1 | season error 3.2 / 9.8 / 30 % (scalar 8.9 / 15.0 / 34) | `loyo_summary.json` → `summary[TA]` | 0.0319 / 0.0977 / 0.2956 (0.0887 / 0.1502 / 0.3421) | ✔ |
| 2 | split windows 0.965 and 0.992 (Terra 0.93 / 1.01) | `loyo_summary.json` → `split_window` | 0.965 / 0.992 (0.925 / 1.006) | ✔ |
| 3 | 2024 / 2025 predicted/observed 1.044 / 1.024 (Terra 0.88 / 0.75) | `forward_test` | 1.044 / 1.024 (0.88 / 0.754) | ✔ |
| 4 | interval in 2024/2025: cells 80 / 77, provinces 76 / 73, country 10 and 11 of 12 | `forward_test.*.interval_coverage`, `size_bins_test.json` | 80.5 / 76.9; 76.2 / 73.3 (n 206); 0.833 / 0.917 | ✔ |
| 5 | areas of 2–9 / 10–49 / 50–199: 81 / 80 / 77 and 77 / 74 / 73 | `size_bins_test.json` → `forward_coverage` | 81.2 / 79.8 / 77.1 and 76.6 / 73.6 / 73.2 | ✔ |
| 6 | 0.98 harmonized vs 3.12 naive | `external_mcd64a1.json` → Argentina | 0.975 / 3.118 (raw MODIS 0.984) | ✔ |
| 7 | 1 628 cells (204 + 469 + 955) | `static_cells.json` → `n`, `by_rule` | 1 628; 204 / 469 / 955 | ✔ |
| 8 | bridge g = 0.979 / 0.951 | `bridge.json` | 0.979 / 0.951 | ✔ |
| 9 | backward test 0.94–1.04; q80 0.21 | `backward_test_2003_2011.summary` | 0.943–1.038; 0.215 | ✔ (0.215 rounds to 0.22) |
| 10 | coverage country 89 · province 79 · cell 81; Neuquén 77, Chubut 71 (n 35) | only in the `05_loyo` log ("regional band test", `region×class`) | 88.9 / 79.3 / —; 77.3 / 71.4 | ✔ but **it is not in any JSON under that name**; `band_coverage.by_level` of the same file says 0.91 / 0.809 / 0.80 |
| 11 | 1.48 raw MODIS, 1.41 harmonized | output of `fig_headline_series.py` | 1.48 / 1.41 | ✔ (only on stdout) |
| 12 | 3.0 % of hotspots in the static class | — | derivable from `country_year.csv`: (Vs+Ts+As)/total = 2.99 % | ⚠ no script emits it |
| 13 | **44.5 %** of VIIRS cell-months without MODIS detection, 7 % of hotspots; 67 % and 20 % Terra only; and the curve 45 / 37 / 23 / 10 % for 1 / 4 / 25 / 100 cells | — | I recomputed it by hand from `counts.json`: 44.9 % / 7.2 % / 67.1 % / 20.3 % | ✘ **no script emits it**; I could not reproduce the curve by size |
| 14 | ENSO **r = −0.37** monthly | `enso_tests.json`, TEST 1 | Argentina monthly **−0.303**, annual −0.354 | ✘ number from `docs/audit_2026-11-14.md:45`, prior to the change of regions |
| 15 | Neuquén 56 %, Santa Cruz 28 %, **Tierra del Fuego 24 %** in the static class | `audit_static.json` (noisy, H5) or `harmonized_provinces.csv` | CSV: 56.3 / 28.3 / **18.1 %**; audit: 57–59 / 25–29 / 21–25 % | ✘ TdF does not come out of any source; the two definitions do not agree with each other |
| 16 | cell level estimated in "30 % of cell-months" | `factors.json` → `level` | TA: 14 261 / 50 316 = **28.3 %**; T: 17.6 % | ⚠ generous rounding |

### H7 — HIGH. Five numbers in the README do not come out of the pipeline
Rows 13, 14 and 15 (✘) and 12 and 16 (⚠) of the table. The 44.5 % is in the title of "Known limits" and in "Read first"; it is one of the numbers a judge is going to want to verify.
- **Fix.** (a) Emit the structural zeros from `05c_aoi_error.mjs` (it already draws blocks by size) to `aoi_error_curve.json`. (b) Correct ENSO to −0.30 or explain the definition. (c) Choose one definition of "static share per province", compute it exactly in `03_aggregate` and cite that one. (d) 30 % → 28 %. **Effort: 1.5 h.**

### H8 — MEDIUM. An unfavourable result measured and not reported
- **Evidence.** `size_bins_test.json` → forward, class 200+: 2024 **75.8 %**, 2025 **63.7 %** with size bins (82.6 / 68.2 % with the `agg` bins that the README says are used for 200+). The README reports 2–199 cells and provinces, and skips the 200+ class.
- **Fix.** One sentence in the interval row: "200+ cells: 83 % / 68 % (n 528)". It is consistent with the 2025 orbital drift they already declare. **Effort: 5 min.**

### H9 — MEDIUM. Code comments that contradict the code or the README
- `06_harmonize.mjs:18` says coverage "country 90 %, province 82 %, cell 80 %; Neuquén 82 %, Chubut 80 %"; the README says 89 / 79 / 81; 77; 71.
- `06_harmonize.mjs:86`: "added in quadrature"; lines 135 and 159 add it linearly (`b10 -= es; b90 += es`), which is what the README says.
- `06_harmonize.mjs:6`: cites `METHOD_DESIGN §2.3`; that document is not in the repo.
- README line 16: "false 3× jump in 2012"; `fig_headline_series.py` prints `naive splice step 2011→2012 = 2.33`.
- README line 47: "no external services beyond the basemap tiles"; `deploy/_headers:7` enables `static.cloudflareinsights.com` and the app in production loads the Cloudflare Web Analytics beacon.
- README: Tierra del Fuego "assigned"; in `harmonized_provinces.csv` it alternates `assigned`/`estimated` month by month (2000-11 assigned, 2000-12 estimated). It is correct because of the `ASSIGNED_W = 0.5` threshold, but the text says something else.
- **Fix.** A 30 min pass over headers and README.

---

## 3. Code quality

The good things first: zero npm dependencies, all ESM with native `node:`; paths relative to `ROOT`; manifest with sha256 per raw file; seeded LCG in the two sampling scripts that feed the product; rules and thresholds of the static class stored inside `static_cells.json`; the FIRMS key is masked in the manifest (`<MAP_KEY>`) and in error messages (`07_live_2026.mjs:67`).

### H10 — MEDIUM. Constants duplicated across scripts
- `BINS = [1, 5, 15, 40, 100, 300, 1000, 3000, 1e12]`: `05_loyo.mjs:124` and `05g_size_bins.mjs:37`. `MIN_BIN = 30`: `05_loyo:148` and `05g:36`.
- `SEASON = [7,8,9,10,11]`: `05_loyo:44`, `05c:26`, `05e:26`.
- `Z = 1.2816`: `05_loyo:44` and `06:47`.
- ONI `SEAS` table and its parser: `05e:29`, `06:88`, `08:25`.
- Identical LCG: `05c:27` and `05g:42`.
- FIRMS CSV parser by column position (`f[5]`, `f[12]`, `f[13]`, `f[14]`): repeated in `03_aggregate`, `03a`, `03b`, `04b`, `07`, and the two `audit_*`. If FIRMS changes the column order, it fails silently in seven places.
- Years `2012..2023` hand-written in `05c:25`, `05e:25`, `05f:23`, `05g:34` (in `04`/`05` they are an argument).
- Size classes: `06` and `deploy/app.js:112` (`SIZE`), without a common source.
- **Fix.** `lib/constants.js` (bins, season, years, size classes, Z), `lib/firms_csv.js` (parser by column name with a header check), `lib/oni.js`, `lib/rng.js`. **Effort: 2 h.** I would not do it before submitting: risk of breaking hashes without tests (H15).

### H11 — MEDIUM. Magic numbers without a source
- `06_harmonize.mjs:95`: `CLOUD_SLOPE = 3.0` (measured −3.11 VIIRS / −2.92 MODIS in `cloud_tests.json`), `CLOUD_FLAG = 0.05` without justification.
- `06_harmonize.mjs:86`: `ENSO_SIGMA_BETA = 0.025`, "measured in 05e", copied by hand.
- `07_live_2026.mjs:35`: `OPERATING_MIN = 5`.
- `04b_bridge.mjs:29`: `K = 20` (the engine uses `K = 10`), without explaining the difference.
- `deploy/app.js:150`: level thresholds 100 / 25 / 4; `app.js:296`: `gap > 0.10`.
- `lib/factors.js:34`: `CAP = 200`, `K_MIN = 5`, `K_ADD = 3`; the README says "CAP is inert", so it is superfluous.
- **Fix.** Have `06` read β and the cloud slope from `enso_tests.json`/`cloud_tests.json`, or a comment with the source file and field. **Effort: 45 min.**

### H12 — MEDIUM. `app:serve` has path traversal and listens on all interfaces
- **Evidence.** `package.json:20`: `p.join('deploy', u)` without normalizing and `.listen(8080)` without host. `curl --path-as-is http://127.0.0.1:8080/../package.json` → `200`. Anyone on the same network (the hackathon's) can read files outside `deploy/`. Separately: `.svg` is served as `application/octet-stream` (missing from the type map), and the README promises `http://127.0.0.1:8080/` but it binds to `0.0.0.0`.
- **Fix.** `.listen(8080, '127.0.0.1')`, reject if `path.resolve(x)` does not start with `path.resolve('deploy')`, add `.svg`. Or replace it with `npx wrangler pages dev deploy`, which also applies `_headers`. **Effort: 10 min.**

### H13 — MEDIUM. Uneven network error handling
- `01_fetch.mjs:38-39`: one attempt, no retry or timeout; if it fails it continues with the rest and leaves `exitCode = 1`. It does not verify the sha256 against the versioned manifest: if FIRMS reprocesses a file, the hash is overwritten and nobody finds out.
- `01c_fetch_aux.mjs:21,26`: `try/catch` that swallows the error.
- `07_live_2026.mjs:57-67`: 4 retries with increasing wait and header validation. It is the only one done well.
- `07_live_2026.mjs:70`: the availability `fetch` has no retry.
- `deploy/app.js:115`: `fetch('data/cells.json')` without `catch`; if it fails, the app stays blank with no message. The other three do degrade.
- **Fix.** Move `get()` from `07` to `lib/` and use it in `01`, `01b`, `01c`; in `01`, compare sha256 against the manifest and abort if it differs unless `--force`; visible error message in the app. **Effort: 1 h.**

### H14 — LOW. Dependencies, lock and version
- `requirements.txt`: four packages with `>=`, not pinned. `fig_factor_map` changes PNG bytes between runs/versions.
- There is no versioned `package-lock.json`. With zero dependencies it is harmless, but `npm audit` fails in a clean clone (`loadVirtual requires existing shrinkwrap file`). After `npm install`: `found 0 vulnerabilities`.
- `engines: node >= 20` ✔. There is no `.nvmrc`/`.python-version`.
- `version: 0.1.0` in `package.json` and `CITATION.cff` ✔ consistent; **there is no git tag** nor CHANGELOG.
- **Fix.** Pin Python versions (`==`), commit the lock, `git tag v0.1.0` on the commit deposited in Zenodo. **Effort: 15 min.**

### Authorship / SI headers
- 35 of 36 code files carry `Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.` It is missing in `lib/provincias.js` (reused IGN data, declared; it is not generated code, but a line is advisable so that the README sentence "Each script carries the header" is literally true).
- Published CSVs and `cells.json`: they carry the mark ✔. Intermediates: no, and the README declares it ✔.
- PNG figures: no mark; they are data plots, not generative images. Acceptable; a line in the caption costs nothing.
- The reviews in `docs/` say so in the first line ✔.

---

## 4. Data

- **Minimum inputs without network.** Versioned: `counts.json`, `coverage.json`, `static_cells.json`, grid, ONI, GWIS tables for Argentina. Enough for `04` → `05*` (identical). **Not enough for `06`** (H1) nor for `03*`, `04b`, `05f`, audits.
- **Sizes.** 78 MB tracked; the largest is `harmonized_cells.csv` (21 MB), under GitHub's limits. `.git` weighs 97 MiB because there are 8+ versions of that CSV in the history. `cells.json` (9.7 MB) and `cells.json.gz` are both versioned: redundant. `data/validation/v1_before_audit/` and `factors_noregions/` add up to ~18 MB of discarded experiments.
- **Manifests.** `data/raw/MANIFEST.json` with url, bytes, sha256, rows and date per file ✔. `MANIFEST_aux.json` for ERA5 ✔. `data/external/gwis/SOURCE.md` with sha256 of the zips ✔. Missing the sha256 of `oni.ascii.txt` and the download date.
- **Schema.** The columns of the two CSVs are described in prose in the README and in `#` lines. There is no formal data dictionary nor JSON Schema for `cells.json` (keys `h`, `cl`, `p`, value `-1` = no data: you have to read `app.js` to know it).

### H16 — HIGH. `CITATION.cff` does not validate
- **Evidence.** `cffconvert --validate -i CITATION.cff` → `ValidationError: Additional properties are not allowed ('notes' was unexpected)`. `notes` (`CITATION.cff:17`) only exists inside `references` in CFF 1.2.0. GitHub is not going to show the "Cite this repository" button and Zenodo may ignore the file.
- **Fix.** Rename `notes` → `abstract`. Add `type: dataset` or `software` and, if desired, `identifiers`. **Effort: 5 min.**

### H17 — HIGH. Product citations incomplete relative to what the guide requires
- DOI `10.5281/zenodo.24220107`: identical in README:7, `CITATION.cff:6`, `deploy/index.html:28` ✔ consistent (but it does not resolve, H2). It does not appear in the app footer (`foot`); it is a chip in the header.
- **The product names do not appear anywhere**: `MCD14ML`, `VNP14IMGTDL`/`VNP14IMG`, `VJ114IMG`, `VJ214IMG` (`grep` in README: zero results). It says "MODIS C6/6.1" and "VIIRS S-NPP/NOAA-20/NOAA-21".
- The product DOIs are not cited: MCD14ML `10.5067/FIRMS/MODIS/MCD14ML`, VIIRS S-NPP `10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002` (and NOAA-20/21 equivalents), MCD64A1 `10.5067/MODIS/MCD64A1.061`. Verify the exact identifiers on each product's page before pasting them.
- FIRMS: acknowledgement sentence ✔, Giglio 2016 and Schroeder 2014 ✔ (README). ERA5: article + dataset DOI + Copernicus sentence ✔. MCD64A1: Giglio 2018 ✔. ONI: named, without URL or access date. IGN: named, without the WFS URL or date.
- `CITATION.cff` → `references` has FIRMS, ERA5 ×2 and GFI; **missing** Giglio 2016, Schroeder 2014, Giglio 2018, ONI, GWIS, IGN.
- The app footer names FIRMS, ERA5, ONI, IGN; **missing MCD64A1/GWIS** and the FIRMS acknowledgement sentence.
- `MVP64` is downloaded and versioned but neither used nor cited.
- **Fix.** "Data sources" table with a product + DOI + access date column; mirror it in `CITATION.cff` and in the footer. **Effort: 45 min.**

---

## 5. Deploy and security

- **`deploy/_headers`** ✔ solid: CSP with `default-src 'self'`, `script-src 'self'` + Cloudflare Insights, `object-src 'none'`, `frame-ancestors 'none'`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. Verified in production with `curl -I`. Only weak point: `style-src 'unsafe-inline'` (Leaflet requires it; acceptable).
- **`noindex` + `robots.txt Disallow: /`** ✔ consistent. Note: with `Disallow` search engines never get to read the `noindex`; for a hackathon deliverable it makes no difference. If after the evaluation they want it to be findable, both have to be removed.
- **Secrets in the history** ✔ clean. `git log -p --all -G'(MAP_KEY|token|secret|api_key|password|Bearer|PRIVATE KEY)'` over 68 commits: only the `<MAP_KEY>` placeholder and mentions of the path. No 32-character hexadecimal string in scripts, deploy, docs. Commit author: GitHub `noreply` address ✔.
- **`npm audit`** ✔ 0 vulnerabilities (0 dependencies). Fails without lockfile (H14).
- **Vendored libraries** ✔ Leaflet 1.9.4 (BSD-2), Leaflet.draw 1.0.4 (MIT), uPlot 1.6.31 (MIT), each with its `LICENSE` and sha256 that verify. Repo `LICENSE`: MIT + CC BY 4.0 for data ✔.
- **XSS** ✔ the area title uses `textContent`; the URL hash is parsed with `URLSearchParams` and `Number`. There are several `innerHTML` with own i18n strings; the CSP covers them.
- **H12** (development server) is the only real security finding, and it is local.
- **H18 — LOW.** Esri World Imagery tiles: attribution present ✔; it is advisable to cite Esri's terms of use in the licence table (today they only appear in the app's `attrib`). And declare Cloudflare Web Analytics in the README (H9). **Effort: 10 min.**

---

## 6. What is missing for "Best Use of Data" / "Best Use of Science"

### H15 — HIGH. There is no automated test nor CI
- **Evidence.** No `tests/`, no `.github/`, no `Makefile`, no `Dockerfile`, no `npm test`. H4 (stale outputs) and H7 (README numbers drifting) are the direct consequence: nothing warns when the code and the artefacts diverge.
- **Minimum fix, 2 h:**
  1. `scripts/check_reproduce.mjs`: runs `04 → 05 → 05c → 05g → 06` in a temporary directory and compares against what is versioned, removing `generated`. Exits ≠ 0 if it differs. It is exactly what I did by hand in §1.
  2. `scripts/check_readme_numbers.mjs`: a table `{README number → file, field, tolerance}` with the 16 rows of §2. Exits ≠ 0 if any does not match.
  3. `tests/` with `node --test`: `cellOf`/`cellBounds` round trip, `provinceOf` at 5 known points, `fitFactors` on a 3-cell toy (the shrinkage tends to the provincial value when M → 0), product invariants (`H_lo ≤ H ≤ H_hi`, sum of provinces = country, no negatives, 4 193 cells, 290 923 data rows).
  4. `.github/workflows/ci.yml`: `npm test` + the two checks on every push. Runs in under a minute because it does not need the raw files (once H1 is resolved).

### The rest, by value
- **`make reproduce` / Dockerfile** (high, 1 h). `FROM node:22-slim` + `python3-numpy python3-matplotlib python3-netcdf4`; `make reproduce` = download inputs from Zenodo → `build` → `validate` → `check_reproduce`. With that the sentence "every number is reproduced" becomes a command.
- **Remove the timestamp from the outputs** (medium, 30 min). 20 scripts write `generated: new Date()`; that is why every run dirties the tree and you have to compare with a filter. Use `SOURCE_DATE_EPOCH` or move the date to a single `RUN_MANIFEST.json` with commit, Node version and sha256 of inputs and outputs.
- **Data dictionary** (medium, 45 min). `docs/data_dictionary.md`: every column of the two CSVs with type, unit, range and meaning of empty; structure of `cells.json` and `band_calibration.json`. Ideal: `datapackage.json` (Frictionless) or JSON Schema.
- **Example notebook** (medium, 45 min). `examples/aoi_quickstart.ipynb`: read `harmonized_cells.csv` with `comment='#'`, sum an area, attach the interval from `band_calibration.json`, plot. Today the recipe for the interval of an aggregate is a README paragraph that nobody is going to implement correctly on the first try.
- **CHANGELOG + tag** (low, 15 min). `v0.1.0` on the deposited commit; the changelog can come from the "response" sections of rounds 1–4.
- **Zenodo metadata** (medium, 20 min). `.zenodo.json` with `related_identifiers` (`isDerivedFrom` → DOI of the FIRMS, ERA5, MCD64A1 products; `isSupplementTo` → repo; `isNewVersionOf`/`references` → GFI), `communities`, dual licence (MIT code, CC-BY-4.0 data), keywords.
- **Cleanup** (low, 20 min). Move `data/validation/v1_before_audit/` and `factors_noregions/` to Zenodo or to a branch; remove the uncompressed `cells.json` or the `.gz` (only one); decide whether `MVP64` is used or goes.
- **Open format for the grid** (low). A 21 MB long-format `harmonized_cells.csv` is awkward for a remote sensing user; a CF NetCDF/Zarr (time × lat × lon, with `H`, `H_lo`, `H_hi`, flags) or GeoParquet makes it usable in xarray/QGIS straight away. It is what adds the most for "Best Use of Data" after reproducibility.

---

## Summary of findings

| # | severity | finding | effort |
|---|---|---|---|
| H1 | blocking | clean clone does not regenerate the product; `06` silently degrades without `cloud_cells.json` | 1 h |
| H2 | blocking | DOI 404, GitHub repo 404 | 1–2 h |
| H3 | high | `08_app_payload` depends on `~/.openclaw/data/spaceapps-vendor` | 20 min |
| H4 | high | 4 stale versioned validation outputs | 15 min |
| H5 | high | `audit_static_sources` with unseeded `Math.random()` | 15 min |
| H7 | high | 5 README numbers with no source in the pipeline (44.5 %; −0.37; TdF 24 %; 3.0 %; 30 %) | 1.5 h |
| H15 | high | no tests or CI | 2 h |
| H16 | high | `CITATION.cff` does not validate (`notes`) | 5 min |
| H17 | high | product names and DOIs missing (MCD14ML, VNP14IMG, VJ114IMG, MCD64A1) | 45 min |
| H6 | medium | README insufficient for a stranger | 1 h |
| H8 | medium | 200+ cell coverage in 2025 (64–68 %) not reported | 5 min |
| H9 | medium | comments and sentences that contradict the code | 30 min |
| H10 | medium | duplicated constants and parser | 2 h |
| H11 | medium | magic numbers without a source | 45 min |
| H12 | medium | `app:serve`: path traversal + `0.0.0.0` | 10 min |
| H13 | medium | uneven network error handling | 1 h |
| H14 | low | unpinned versions, no lock, no tag | 15 min |
| H18 | low | Esri terms and Cloudflare Analytics not declared | 10 min |

## The 10 highest-value actions for the next 24 h

1. **Publish Zenodo and open the repo** (H2). Without this, nothing else can be evaluated. Verify afterwards with `curl -sIL https://doi.org/10.5281/zenodo.24220107` and by opening GitHub in a private window.
2. **Version `cloud_cells.json.gz` (or download it from Zenodo with sha256) and make `06` fail if it is missing** (H1). Verification: clean clone → `node scripts/06_harmonize.mjs` → `shasum -a 256 data/harmonized/cells.json` = `bd5b76b2…`.
3. **Regenerate and commit validation and figures** (H4): `npm run build && npm run validate && npm run figures`, after (4).
4. **Remove the `Math.random()` from `audit_static_sources.mjs`** (H5).
5. **Fix the five README numbers** (H7) and add the 200+ class (H8): emit the structural zeros from `05c`, ENSO −0.30, Tierra del Fuego with a single definition, 28 %.
6. **`CITATION.cff`: `notes` → `abstract`, and add the missing references** (H16, H17). Verification: `cffconvert --validate`.
7. **Product names and DOIs in README, CITATION and app footer** (H17): MCD14ML, VNP14IMG, VJ114IMG/VJ214IMG, MCD64A1, ONI and IGN with URL and access date.
8. **Remove the private path from `08_app_payload.mjs` and fix `app:serve`** (H3, H12).
9. **`check_reproduce.mjs` + `check_readme_numbers.mjs` + a CI workflow** (H15). It is what turns the sentence "every number is reproduced" into something a judge can see in green.
10. **"Reproduce" section in the README with the three levels, `pip install -r requirements.txt`, the two credentials, expected times and hashes** (H6); `git tag v0.1.0` and `.zenodo.json` (H14).

If there is time left: example notebook, data dictionary and NetCDF of the grid, in that order.
