// regions.js — fire-regime regions used as an intermediate shrinkage level (cell → province → region → country).
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
// Rationale: a province with few MODIS detections (Santa Cruz, Tierra del Fuego) should borrow its VIIRS/MODIS factor from
// neighbours with the same fire regime (Patagonian steppe: small, fast grass fires that a 1 km pixel misses → high factor),
// not from the national mean dominated by the Chaco and the Litoral (large fires → low factor). Grouping by dominant
// vegetation / fire regime; provinces are IGN names.
export const REGION_OF = {
  'Formosa': 'litoral-nea', 'Chaco': 'litoral-nea', 'Corrientes': 'litoral-nea', 'Misiones': 'litoral-nea', 'Santa Fe': 'litoral-nea', 'Entre Ríos': 'litoral-nea',
  'Santiago del Estero': 'noa-chaco-seco', 'Salta': 'noa-chaco-seco', 'Jujuy': 'noa-chaco-seco', 'Tucumán': 'noa-chaco-seco',
  'Catamarca': 'monte-cuyo', 'La Rioja': 'monte-cuyo', 'San Juan': 'monte-cuyo', 'Mendoza': 'monte-cuyo',
  'Córdoba': 'pampa', 'San Luis': 'pampa', 'Buenos Aires': 'pampa', 'La Pampa': 'pampa', 'Ciudad Autónoma de Buenos Aires': 'pampa',
  'Neuquén': 'patagonia', 'Río Negro': 'patagonia', 'Chubut': 'patagonia', 'Santa Cruz': 'patagonia', 'Tierra del Fuego, Antártida e Islas del Atlántico Sur': 'patagonia',
};
export const REGIONS = [...new Set(Object.values(REGION_OF))];
