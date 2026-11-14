#!/usr/bin/env python3
# 03d_precip_cells.py — Map ERA5 monthly total precipitation onto the 0.25° fire grid (per cell × year × month) + climatology.
# Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
# Output: data/agg/precip_cells.json { years, cells: { id: { y: [12] tp_mm_per_day } }, clim: { id: [12] } }
import json, pathlib, numpy as np, netCDF4, datetime
ROOT = pathlib.Path(__file__).resolve().parent.parent
nc = netCDF4.Dataset(ROOT / "data/external/era5/era5_tp_monthly_AR_2000_2025.nc")
idx = json.loads((ROOT / "data/grid/cells_index.json").read_text())
lat = nc["latitude"][:]; lon = nc["longitude"][:]
tname = [v for v in ("valid_time", "time") if v in nc.variables][0]
t = [datetime.datetime.utcfromtimestamp(int(s)) for s in nc[tname][:]]
tp = nc["tp"][:] * 1000.0  # m/day -> mm/day (monthly mean of daily totals)
H = {(d.year, d.month): i for i, d in enumerate(t)}
def li(x, arr): return int(np.argmin(np.abs(arr - x)))
cells = {}; clim = {}; years = sorted({y for (y, m) in H})
for c in idx["cells"]:
    i, j = li(c["lat0"] + 0.125, lat), li(c["lon0"] + 0.125, lon)
    rec = {}; acc = np.zeros(13); cnt = np.zeros(13)
    for (y, m), k in H.items():
        v = float(tp[k, i, j]); rec.setdefault(y, [None] * 12)[m - 1] = round(v, 3); acc[m] += v; cnt[m] += 1
    cells[c["id"]] = rec; clim[c["id"]] = [round(acc[m] / max(1, cnt[m]), 3) for m in range(1, 13)]
(ROOT / "data/agg/precip_cells.json").write_text(json.dumps({"source": "ERA5 monthly averaged reanalysis, total_precipitation (mm/day), 0.25deg (Copernicus CDS)", "years": years, "cells": cells, "clim": clim}))
print("cells", len(cells), "years", years[0], "-", years[-1], "| mean Aug tp mm/day over land cells:", round(float(np.mean([clim[c["id"]][7] for c in idx["cells"]])), 3))
