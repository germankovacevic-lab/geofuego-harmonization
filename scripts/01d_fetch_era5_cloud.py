#!/usr/bin/env python3
# 01d_fetch_era5_cloud.py — ERA5 total cloud cover, monthly means BY HOUR OF DAY, 0.25°, Argentina, 2000–2025 (Copernicus CDS).
# Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
# Why: MODIS/VIIRS detect fire in the mid/thermal infrared, which clouds block. Terra passes at ~10:30 local, Aqua and
# VIIRS at ~13:30: afternoon convection obscures the 13:30 sensors more. ERA5 "monthly averaged reanalysis by hour of day"
# gives the cloud fraction at each UTC hour for every month, so the cloudiness seen by each overpass can be separated.
# Argentina local time = UTC−3 → Terra 10:30 ≈ 13–14 UTC, Aqua/VIIRS 13:30 ≈ 16–17 UTC, night passes 01:30 ≈ 04–05 UTC.
# Needs ~/.cdsapirc (CDS API key). Output: data/external/era5/era5_tcc_monthly_by_hour_AR_2000_2025.nc (+ sha256 in MANIFEST_aux.json)
import cdsapi, hashlib, json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
out = ROOT / "data/external/era5/era5_tcc_monthly_by_hour_AR_2000_2025.nc"
out.parent.mkdir(parents=True, exist_ok=True)
c = cdsapi.Client()
c.retrieve("reanalysis-era5-single-levels-monthly-means", {
    "product_type": ["monthly_averaged_reanalysis_by_hour_of_day"],
    "variable": ["total_cloud_cover"],
    "year": [str(y) for y in range(2000, 2026)],
    "month": [f"{m:02d}" for m in range(1, 13)],
    "time": ["04:00", "05:00", "13:00", "14:00", "16:00", "17:00"],
    "area": [-21, -74, -55, -53],   # N, W, S, E
    "data_format": "netcdf",
    "download_format": "unarchived",
}, str(out))
sha = hashlib.sha256(out.read_bytes()).hexdigest()
mf = ROOT / "data/external/MANIFEST_aux.json"
m = json.loads(mf.read_text()) if mf.exists() else {}
m["era5_tcc_monthly_by_hour"] = {"dataset": "reanalysis-era5-single-levels-monthly-means", "product": "monthly_averaged_reanalysis_by_hour_of_day", "variable": "total_cloud_cover", "hours_utc": ["04", "05", "13", "14", "16", "17"], "area": [-21, -74, -55, -53], "bytes": out.stat().st_size, "sha256": sha}
mf.write_text(json.dumps(m, indent=2))
print(out, out.stat().st_size, "B", sha[:12])
