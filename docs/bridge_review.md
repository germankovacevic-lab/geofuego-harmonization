# S-NPP ↔ NOAA-20 / NOAA-21 bridge — results and audit (14 Nov 2026)

Why it exists: the harmonized series and the MODIS calibration are expressed in **S-NPP** hotspot counts; S-NPP stopped on 2026-11-01. The live series continues with NOAA-20 and NOAA-21 (same VIIRS instrument). GeoFuego's live ingestion sums the three satellites (dedup key lat/lon/date/**time**, so different overpasses never collapse) → a 3-satellite month is ≈ 2.9 × an S-NPP-only month. Any "this month vs history" comparison must convert each satellite to S-NPP-equivalent counts: `N_snpp_eq = N_sat / g_sat`.

Fit (`scripts/04b_bridge.mjs`): FIRMS Area API standard-processing archives (VIIRS_SNPP_SP, VIIRS_NOAA20_SP, VIIRS_NOAA21_SP), Argentina bbox, 2023–2025, 5-day windows (`01b_fetch_viirs_sp.mjs`, sha256 in MANIFEST). Same filters (type 0, confidence ≠ low) and same persistent-source mask as the MODIS fit. **Annual ratio of sums per province, shrunk to country (k = 20), on paired days only** (days on which all three satellites report ≥ 1 hotspot over Argentina: 1 006 of 1 096).

| | g = N_sat / N_snpp (country) | σ across months | provinces (w ≈ 1) |
|---|---|---|---|
| NOAA-20 | **0.980** | 0.053 | 0.94 (Formosa) – 1.03 (Misiones) |
| NOAA-21 | **0.951** | 0.054 | 0.92 (Córdoba, La Pampa) – 0.99 (Entre Ríos, Río Negro) |

Decisions taken while looking at the data:
- **Monthly factors rejected.** Monthly ratios were dominated by satellite outages (measured day by day: S-NPP no data 10–15 and 24–28 Jul 2024; NOAA-20 no data 19–22 Jul 2023; NOAA-21 no data until early Feb 2023). July NOAA-20/S-NPP read 1.17 with σ 0.41 before pairing; 1.02 after. Same instrument, same orbit plane → no physical reason for a seasonal cycle → annual factor, monthly ratios kept as diagnostic only.
- Missing days per satellite in 2023–2025: S-NPP 22, NOAA-20 7, NOAA-21 61 (mostly pre-operational Jan 2023).

Audit with data the fit never saw:
- S-NPP from the Area API vs the FIRMS country archive used by the engine: max monthly deviation **0.61 %** (data path consistent).
- GeoFuego production D1 (NRT feeds, different code, 18 Sep – 31 Oct 2026, static flag off): NOAA-20/S-NPP **0.982** (fit: 0.980); NOAA-21/S-NPP **0.93** (fit: 0.951, six-week window, provinces ± 10 %).
- NOAA-20 factor with and without NOAA-21 pairing (1 067 vs 1 006 paired days): 0.9795 vs 0.9798 → insensitive to the day set.

Use: for the current month, `H_live = Σ_sat N_sat / g_sat[prov]` (g = 1 for S-NPP while it existed). For the 2026 monthly series before 18 Sep (only 3-satellite totals available) use the country-level `1 + g20 + g21 = 2.931` as divisor and flag it.
