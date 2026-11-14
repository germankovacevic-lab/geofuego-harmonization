#!/usr/bin/env python3
# fig_external_validation.py — Figure: harmonized hotspots vs independent MODIS burned area (MCD64A1, GWIS/JRC), Argentina.
# Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
import csv, pathlib, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = pathlib.Path(__file__).resolve().parent.parent
region = sys.argv[1] if len(sys.argv) > 1 else "Argentina"
out = ROOT / "figures" / f"external_validation_{region.split(',')[0].replace(' ', '_')}.png"
out.parent.mkdir(exist_ok=True)
rows = [r for r in csv.DictReader(open(ROOT / "data/validation/external_mcd64a1_annual.csv")) if r["region"] == region]
Y = np.array([int(r["year"]) for r in rows]); BA = np.array([float(r["burned_area_ha"]) for r in rows])
H = np.array([float(r["H_harmonized"]) for r in rows]); N = np.array([float(r["naive_concat"]) for r in rows])
pre = Y <= 2011

fig, ax = plt.subplots(2, 1, figsize=(9, 7.5), dpi=150, gridspec_kw={"height_ratios": [1.2, 1]})
a = ax[0]
a.bar(Y, BA / 1e6, color="#bbbbbb", width=0.8, label="MODIS burned area, MCD64A1 (Mha) — independent product")
a.set_ylabel("burned area (Mha)")
b = a.twinx()
b.plot(Y[pre], H[pre] / 1e3, "o-", color="#d95f02", label="harmonized hotspots 2002–2011 (reconstructed from MODIS)")
b.plot(Y[~pre], H[~pre] / 1e3, "o-", color="#1b9e77", label="observed VIIRS S-NPP hotspots 2012–2025")
b.set_ylabel("VIIRS-equivalent hotspots (thousands)")
a.axvline(2011.5, color="k", lw=0.8, ls="--"); a.text(2011.6, a.get_ylim()[1] * 0.95, "VIIRS starts", fontsize=8, va="top")
h1, l1 = a.get_legend_handles_labels(); h2, l2 = b.get_legend_handles_labels(); a.legend(h1 + h2, l1 + l2, fontsize=7.5, loc="upper right")
a.set_title(f"{region}: harmonized hotspot series vs independent burned-area product", fontsize=10)

c = ax[1]
c.plot(Y, BA / N, "s-", color="#7570b3", label="ha per hotspot, naive series (raw MODIS until 2011, VIIRS from 2012)")
c.plot(Y, BA / H, "o-", color="#1b9e77", label="ha per HARMONIZED hotspot")
c.axvline(2011.5, color="k", lw=0.8, ls="--")
c.set_ylabel("burned hectares per hotspot"); c.set_xlabel("year"); c.set_ylim(0, None)
c.legend(fontsize=8, loc="upper right")
c.set_title("Continuity test across the sensor change: the naive series jumps ~3x, the harmonized series does not", fontsize=9)
fig.text(0.01, 0.005, "Hotspots: NASA FIRMS MODIS C6.1 + VIIRS S-NPP, GeoFuego Harmonization · Burned area: NASA MCD64A1 via GWIS/JRC country profile · NASA Space Apps 2026", fontsize=6, alpha=0.7)
fig.tight_layout(rect=(0, 0.02, 1, 1))
fig.savefig(out)
print(out)
