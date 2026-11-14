# Persistent thermal sources — classification rule and manual review (14 Nov 2026)

Rule (`scripts/03a_static_sources.mjs`): a 0.02° cell is a *persistent thermal source* when it satisfies **two independent signatures**:
1. **Persistence** — hotspots in ≥ 9 distinct calendar months within any 12-month window (VIIRS S-NPP 2012–2025 or MODIS 2000–2025).
2. **Night** — ≥ 50 % of its hotspots are night-time detections.

These hotspots are **kept in the dataset as a separate class** (`Vs/Ts/As` columns), not dropped. Harmonization factors are fitted on the remaining (vegetation) class only.

## Why two signatures
Persistence alone (the rule used in GeoFuego production) also flagged 78 cells of **highly recurrent but diurnal** burning in the Paraná floodplain (Santa Fe, Formosa, Entre Ríos Delta, Misiones): FRP 5–10 MW, night fraction 0–0.3, no FIRMS type-2 detections. Visual check in Google Earth: pure wetland, no infrastructure. Those are vegetation fires and were returned to the vegetation class.

## Independent audit of the final 204 cells (`scripts/audit_static_sources.mjs`)
| signature (never used by the rule) | static cells | vegetation |
|---|---|---|
| night fraction | 0.83 | 0.27 |
| FRP median (VIIRS) | 1.3 MW | 5.3 MW |
| seasonality (max/min monthly share) | 2.1 | 9.0 |
| share of all FIRMS `type=2` detections falling inside | 65 % (cells hold 1.35 % of hotspots) | 35 % |

Threshold sensitivity (share of Neuquén VIIRS hotspots flagged): 7/12 → 56 %, 8/12 → 52 %, **9/12 → 48 %**, 10/12 → 41 %, 11/12 → 30 %; cell 0.03° gives the same ± 5 points. No knee: the result does not hinge on the chosen threshold.

Non-stationarity (the reason this matters for harmonization): VIIRS/MODIS ratio of the static class is 3.6 (2012) → 13–26 in 2019–2025 (24.2, 20.9, 20.5, 18.5, 15.4, 12.8, 25.6), while the vegetation class stays at 2.9–3.8. A single national scale factor would silently absorb a source that grew ~7× over the period and would then be applied to 2000–2011, when it did not exist.

## Manual review (Google Earth, pin = hotspot centroid, box = cell)
| cell | what is there | verdict |
|---|---|---|
| Tierra del Fuego −52.39/−68.42 | oil installation on the beach, 96 % night | flare ✓ |
| Catamarca −28.47/−65.23 | cement plant, pin on the kiln, 100 % night | industrial ✓ |
| La Rioja −29.30/−66.73 | fenced open-air landfill, 52 % night | landfill ✓ |
| Corrientes −28.27/−58.14 (Santa Rosa) | sawmill cluster between pine plantations, 75 % night | biomass boilers ✓ |
| Corrientes −28.25/−58.67 (Saladas) | lumber yards on the highway, 59 % night | sawmill ✓ |
| Entre Ríos −30.81/−57.90 (Chajarí) | sawmill yard among citrus, 71 % night | sawmill ✓ |
| Santa Fe −29.17/−61.45 | closed dry forest, no visible infrastructure, 56 % night, FRP 2.2 MW | **ambiguous** (charcoal kilns under canopy likely) |
| Chaco −26.01/−61.21 (+5 nearby) | cleared fields with forest strips, 51–65 % night, FRP 3.4–4.8 MW, 11 months over 3 years | **ambiguous**: multi-month land-clearing pile burns |

Of 204 cells, 188 have VIIRS FRP median < 3 MW (flares, boilers, kilns, landfills). The 16 with FRP ≥ 3 MW are: Salta/Jujuy/Formosa oil and gas fields (Tartagal–Campo Durán, Caimancito, Palmar Largo: large flares), and 8 Chaco/Santiago del Estero cells at the edge of the night threshold, probably land-clearing burns. These 8 cells hold ≈ 0.2 % of their provinces' hotspots; their effect on the factors is nil (province factors unchanged to two decimals). An FRP criterion was **not** added because it would also drop real flares in large gas fields.

Known limitation, declared: the class is behavioural ("burns persistently and at night"), not a land-use classification. It captures gas flares, refineries, cement kilns, sawmill boilers, charcoal kilns and landfills, and may include a few multi-month land-clearing burns.

## Addendum (14:00) — intermittent flares (second rule)
Trigger: the two worst LOYO provinces were the two oil basins (Neuquén 25 %, Santa Cruz 24 % vs 3–17 % elsewhere) and the 80 % interval covered only 52 % of Neuquén months, while the persistent rule had flagged only 3 cells in Santa Cruz (hundreds of conventional pads at Las Heras, Pico Truncado, Cañadón Seco). Conventional pads vent intermittently (weeks on, months off) and never reach 9 months in 12.

Second rule (`03a_static_sources.mjs`): **≥ 4 months in any 12-month window AND ≥ 70 % night detections AND ≥ 10 hotspots AND median VIIRS FRP < 3 MW.** Vegetation fire is diurnal (night share 0.27) and hot (FRP median 5.3 MW); flares are nocturnal and cool. Without the FRP limit the rule also caught night-time sugar-cane burning (Jujuy, FRP 7 MW) and land-clearing pile burns (southern Salta, Chaco, FRP 3–5 MW), which are vegetation fire; with it they stay in the vegetation class.

Result: 469 intermittent cells added (Neuquén 109, Salta 63 — Tartagal/Campo Durán gas, Chaco 52, Buenos Aires 40, Santiago 25, Mendoza 19, Santa Cruz 19, Río Negro 15, Tierra del Fuego 8, Chubut 6). Static class = 673 cells, 1.38 % of hotspots. Audit signatures of the whole class remain separated from vegetation (see audit table regenerated in `data/agg/audit_static.json`).

Effect on the factors (August, Terra+Aqua): Neuquén 4.41 → **3.65**, Santa Cruz 6.91 → **5.32**, Chubut 4.34 (unchanged), Mendoza 2.87 (unchanged). LOYO: province 10.4 → **10.2 %**; interval coverage: Neuquén 52 → **74 %**, Santa Cruz 77 → **85 %**, province-level 80 → 81 %, country 88 → 90 %. Neuquén's season error (national season Jul–Nov) does not fall (25 → 27 %) because its vegetation fire burns in Dec–Mar: with its own season the error is reported separately (`loyo_by_province.csv`, `own_season_*`).

## Addendum (14/11 15:40) — rule 3: MODIS static false-alarm sites, and what it changes in this document
Peer review round 3 found that the FIRMS MODIS `type` flag is not homogeneous across archive versions (6.2 through 2017: type 2 = 0.4–1.8 % of detections; 6.03 / 61.03 from 2018: 2.3–4.9 %, same fixed sites). Verified on the raw files and fixed with a third rule: 0.02° cells with ≥ 3 MODIS type-2 detections in ≥ 2 years of 2018–2025 (955 new cells, mostly Buenos Aires, Mendoza, Santa Fe, Córdoba, Tucumán, San Juan), static for both sensors in all years, not dilated. Full evidence and before/after numbers: `audit_2026-11-14.md`, addendum 15:40.
Corrections to the text above: (1) the class is now 1 628 cells (204 persistent + 469 intermittent + 955 MODIS type-2 sites), 3.0 % of hotspots; (2) the "share of FIRMS type-2 inside" figure is computed on VIIRS detections only and, with rule 3, is partly by construction (97 % now; 65 % with the persistent rule alone, 95 % with the two physical rules); (3) the static-class VIIRS/MODIS ratio quoted as "3.6 (2012) → 13–26" referred to the 204-cell class; for the 673-cell class it read 5.7 → 10–20 and for the 1 628-cell class it is 1.3 → 2.0–2.3, because the class is now dominated by MODIS-only false alarms — the non-stationarity argument holds for the flare cells, not for the class as a whole; (4) night fraction and FRP are inputs of rules 1 and 2, so the audit table's "signatures never used by the rule" is true only for seasonality and type-2 co-location; (5) the intermittent rule was motivated by the two worst LOYO provinces and its FRP limit chosen after inspecting what it caught: a choice made on the validation target, declared as such (its LOYO gain, 10.4 → 10.2 %, is within fold noise; its physical basis and the type-2 co-location are the evidence).
