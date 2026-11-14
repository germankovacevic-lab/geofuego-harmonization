#!/usr/bin/env python3
# 03c_cloud_cells.py — Map ERA5 monthly cloud cover (by hour of day) onto the 0.25° fire grid: per cell × year × month,
# cloud fraction at the Terra (10:30 local ≈ 13–14 UTC), Aqua/VIIRS day (13:30 ≈ 16–17 UTC) and night (01:30 ≈ 04–05 UTC)
# overpasses, plus each cell-month's anomaly vs its 2000–2025 climatology.
# Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
# Output: data/agg/cloud_cells.json  { years, cells: { id: { y: [12][3] tcc at terra/day13/night } }, clim: { id: [12][3] } }
#         data/agg/cloud_country.csv  year, month, tcc_terra, tcc_day13, tcc_night (land-cell mean)
import json, pathlib, numpy as np, netCDF4
ROOT = pathlib.Path(__file__).resolve().parent.parent
nc = netCDF4.Dataset(ROOT / "data/external/era5/era5_tcc_monthly_by_hour_AR_2000_2025.nc")
idx = json.loads((ROOT / "data/grid/cells_index.json").read_text())
lat = nc["latitude"][:]; lon = nc["longitude"][:]
tname = [v for v in ("valid_time", "time") if v in nc.variables][0]
t = netCDF4.num2date(nc[tname][:], nc[tname].units) if "units" in nc[tname].ncattrs() else None
if t is None:  # new CDS netcdf: seconds since epoch
    import datetime; t = [datetime.datetime.utcfromtimestamp(int(s)) for s in nc[tname][:]]
tcc = nc["tcc"][:]  # (time, lat, lon)
H = {}
for i, d in enumerate(t): H.setdefault((d.year, d.month), {})[d.hour] = i
pass_hours = {"terra": (13, 14), "day13": (16, 17), "night": (4, 5)}
def li(x, arr): return int(np.argmin(np.abs(arr - x)))
cells = {}; clim = {}; years = sorted({y for (y, m) in H})
csum = {}  # (y,m,k) -> [sum, n] over land cells
for c in idx["cells"]:
    la, lo = c["lat0"] + 0.125, c["lon0"] + 0.125; i, j = li(la, lat), li(lo, lon)
    rec = {}; acc = np.zeros((13, 3)); cnt = np.zeros((13, 3))
    for (y, m), hrs in H.items():
        row = []
        for k, (h1, h2) in pass_hours.items():
            vals = [float(tcc[hrs[h], i, j]) for h in (h1, h2) if h in hrs]
            v = float(np.mean(vals)) if vals else float("nan"); row.append(round(v, 3))
            if not np.isnan(v): acc[m, list(pass_hours).index(k)] += v; cnt[m, list(pass_hours).index(k)] += 1; s = csum.setdefault((y, m, k), [0.0, 0]); s[0] += v; s[1] += 1
        rec.setdefault(y, [None] * 12)[m - 1] = row
    cells[c["id"]] = rec; clim[c["id"]] = [[round(acc[m, k] / max(1, cnt[m, k]), 3) for k in range(3)] for m in range(1, 13)]
(ROOT / "data/agg/cloud_cells.json").write_text(json.dumps({"source": "ERA5 monthly averaged reanalysis by hour of day, total_cloud_cover, 0.25deg (Copernicus CDS)", "passes": {"terra": "13-14 UTC (~10:30 local)", "day13": "16-17 UTC (~13:30 local, Aqua and VIIRS day)", "night": "04-05 UTC (~01:30 local, Aqua and VIIRS night)"}, "years": years, "cells": cells, "clim": clim}))
with open(ROOT / "data/agg/cloud_country.csv", "w") as f:
    f.write("year,month,tcc_terra,tcc_day13,tcc_night\n")
    for y in years:
        for m in range(1, 13):
            r = [csum.get((y, m, k), [0, 0]) for k in pass_hours]; f.write(f"{y},{m}," + ",".join(f"{s[0]/s[1]:.3f}" if s[1] else "" for s in r) + "\n")
print("cells", len(cells), "years", years[0], "-", years[-1], "| country Aug mean tcc terra/day13/night:", [round(np.mean([csum[(y, 8, k)][0] / csum[(y, 8, k)][1] for y in years if (y, 8, k) in csum]), 3) for k in pass_hours])
