# GWIS / JRC country-profile burned-area datasets (external; NOTE: MCD64A1 is not independent of MODIS active fires — the C6 burned-area algorithm uses them in its training, Giglio et al. 2018 — so these tables are used as a consistency check across the 2012 splice, not as an independent validation of the factor)
Downloaded 2026-11-14 from https://gwis.jrc.ec.europa.eu/apps/country.profile/downloads (redirects to data.effis.emergency.copernicus.eu).
- MCD64A1_burned_area_full_dataset_2002_2025.zip — sha256 279a356d9ef925de9d3225081012cbcc2d98e515988ead438b3294d5bdd6349f — monthly burned area (ha) by GADM level-1 unit and land cover, derived from NASA MCD64A1.
- MVP64_burned_area_full_dataset_2013_2025.zip — sha256 423e8551aa0285d6eee4e3930fc5440f832dcf46514b4012dea75fd7fab72ebe — same, VIIRS-based burned area.
Only the Argentina rows are kept in this repository (`*_ARG_*.csv`); the full global files (~62 MB each) are not committed.
Citation: Global Wildfire Information System (GWIS), Copernicus EMS / JRC; Giglio, L. et al. (2018) The Collection 6 MODIS burned area mapping algorithm and product, RSE 217, 72–85, https://doi.org/10.1016/j.rse.2018.08.005
