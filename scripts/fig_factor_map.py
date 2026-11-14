#!/usr/bin/env python3
# fig_factor_map.py — Map of the harmonization factor f (VIIRS/MODIS) per 0.25° cell for one month.
# Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
# Usage: python3 scripts/fig_factor_map.py [month=8] [set=TA] [out=figures/factor_map_aug_TA.png]
import json, sys, pathlib
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm
from matplotlib.collections import PolyCollection

ROOT = pathlib.Path(__file__).resolve().parent.parent
month = int(sys.argv[1]) if len(sys.argv) > 1 else 8
sset = sys.argv[2] if len(sys.argv) > 2 else "TA"
out = ROOT / (sys.argv[3] if len(sys.argv) > 3 else f"figures/factor_map_{month:02d}_{sset}.png")
out.parent.mkdir(parents=True, exist_ok=True)

F = json.loads((ROOT / "data/factors/factors.json").read_text())
idx = json.loads((ROOT / "data/grid/cells_index.json").read_text())
step = idx["grid"]["step"]
cells = F["cell"][sset]
polys, vals, alphas = [], [], []
for c in idx["cells"]:
    row = cells.get(str(c["id"]))
    if not row:
        continue
    f, sigma, neff, w = row[month - 1]
    la, lo = c["lat0"], c["lon0"]
    polys.append([(lo, la), (lo + step, la), (lo + step, la + step), (lo, la + step)])
    vals.append(f); alphas.append(0.35 + 0.65 * w)   # faint = inherited from province/country

fig, ax = plt.subplots(figsize=(6.5, 9), dpi=150)
pc = PolyCollection(polys, array=np.array(vals), cmap="viridis", norm=LogNorm(vmin=1.5, vmax=12), edgecolors="none")
pc.set_alpha(None)
colors = pc.cmap(pc.norm(np.array(vals))); colors[:, 3] = alphas
pc.set_facecolors(colors)
ax.add_collection(pc)
ax.set_xlim(-74, -53); ax.set_ylim(-55.2, -21); ax.set_aspect(1 / np.cos(np.deg2rad(38)))
ax.set_xlabel("lon"); ax.set_ylabel("lat")
names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
yrs = F.get("meta", {}).get("years", [])
win = f"{yrs[0]}–{yrs[-1]}" if yrs else "overlap"
ax.set_title(f"Harmonization factor f = VIIRS / MODIS({'Terra+Aqua' if sset=='TA' else 'Terra only'})\n{names[month-1]}, fitted on the {win} overlap (paired days) · 0.25° cells (faint = shrunk to province/region)", fontsize=9)
cb = fig.colorbar(plt.cm.ScalarMappable(norm=pc.norm, cmap="viridis"), ax=ax, shrink=0.6, ticks=[1.5, 2, 3, 4, 6, 8, 12])
cb.ax.set_yticklabels(["1.5", "2", "3", "4", "6", "8", "12"]); cb.set_label("f (log scale)")
fig.text(0.01, 0.01, "Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP) · GeoFuego Harmonization · NASA Space Apps 2026", fontsize=6, alpha=0.7)
fig.savefig(out, bbox_inches="tight")
print(out, f"cells={len(vals)} f range {min(vals):.2f}–{max(vals):.2f} median {np.median(vals):.2f}")
