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
