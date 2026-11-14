// regions.js — fire-regime regions used as an intermediate shrinkage level (cell → province → region → country) and as the
// calibration domain of the prediction interval (05_loyo, 06_harmonize).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
// The four regions are the ones used by the GeoFuego Index (GFI) for its regional climatologies and ENSO calibration
// (GFI method package v1.2, `territories/argentina/calibracion_3.0.json`, doi:10.5281/zenodo.23017739): NEA (7 provinces),
// NOA (5), Centro (7), Patagonia (5). Reused as-is so that the harmonized series and the GFI share one regional definition.
// Rationale for a region level at all: a province with few MODIS detections (Santa Cruz, Tierra del Fuego) should borrow its
// VIIRS/MODIS factor from neighbours with the same fire regime, not from the national mean dominated by the Chaco and the
// Litoral. Tierra del Fuego has no estimable factor of its own (180 MODIS detections in August over 12 years): its factor is
// the Patagonia value, assigned, not estimated — declared in the products.
export const REGION_OF = {
  'Chaco': 'NEA', 'Corrientes': 'NEA', 'Entre Ríos': 'NEA', 'Formosa': 'NEA', 'Misiones': 'NEA', 'Santa Fe': 'NEA', 'Santiago del Estero': 'NEA',
  'Catamarca': 'NOA', 'Jujuy': 'NOA', 'La Rioja': 'NOA', 'Salta': 'NOA', 'Tucumán': 'NOA',
  'Buenos Aires': 'Centro', 'Ciudad Autónoma de Buenos Aires': 'Centro', 'Córdoba': 'Centro', 'La Pampa': 'Centro', 'Mendoza': 'Centro', 'San Juan': 'Centro', 'San Luis': 'Centro',
  'Chubut': 'Patagonia', 'Neuquén': 'Patagonia', 'Río Negro': 'Patagonia', 'Santa Cruz': 'Patagonia', 'Tierra del Fuego, Antártida e Islas del Atlántico Sur': 'Patagonia',
};
export const REGIONS = [...new Set(Object.values(REGION_OF))];
