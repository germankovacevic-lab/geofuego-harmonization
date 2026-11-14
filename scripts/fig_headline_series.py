#!/usr/bin/env python3
# fig_headline_series.py — Headline figure: Argentina 2000–2025 on one axis — raw MODIS (Terra+Aqua) hotspots, raw VIIRS S-NPP
# hotspots, the naive concatenation (MODIS until 2011, VIIRS from 2012) and the harmonized VIIRS-equivalent series with its
# 80 % prediction interval. Answers "is the drop at 2012 real?": raw MODIS runs through 2025 and falls too (vegetation class,
# annual, Terra+Aqua); the naive splice jumps ≈ 3× at 2012; the harmonized series does not.
# Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
import csv, pathlib
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = pathlib.Path(__file__).resolve().parent.parent
out = ROOT / "figures" / "headline_series_Argentina.png"
out.parent.mkdir(exist_ok=True)

cy = {int(r["year"]): r for r in csv.DictReader(open(ROOT / "data/agg/country_year.csv"))}
prov = [r for r in csv.DictReader(l for l in open(ROOT / "data/harmonized/harmonized_provinces.csv") if not l.startswith("#")) if r["unit"] == "Argentina"]
years = sorted({int(r["year"]) for r in prov})
H = {y: 0.0 for y in years}; LO = {y: 0.0 for y in years}; HI = {y: 0.0 for y in years}
for r in prov:
    y, h = int(r["year"]), float(r["H"])
    H[y] += h
    LO[y] += float(r["H_lo"]) if r["H_lo"] else h
    HI[y] += float(r["H_hi"]) if r["H_hi"] else h
Y = np.array(years)
M = np.array([int(cy[y]["T"]) + int(cy[y]["A"]) if y in cy else np.nan for y in years], dtype=float)
V = np.array([int(cy[y]["V"]) if y in cy else 0 for y in years], dtype=float); V[Y < 2012] = np.nan
Hh = np.array([H[y] for y in years]); Lo = np.array([LO[y] for y in years]); Hi = np.array([HI[y] for y in years])
naive = np.where(Y < 2012, M, V)
# 2000 is Nov–Dec only; 2002 mixes Terra-only and Terra+Aqua
k = 1e3
fig, ax = plt.subplots(figsize=(10, 6.6), dpi=150)
ax.fill_between(Y[Y <= 2011], Lo[Y <= 2011] / k, Hi[Y <= 2011] / k, color="#d95f02", alpha=0.18, lw=0, label="80 % prediction interval of the reconstruction")
ax.plot(Y, Hh / k, "o-", color="#d95f02", lw=2, ms=4, label="harmonized series, VIIRS-equivalent (reconstructed from MODIS until 2011, observed VIIRS from 2012)")
ax.plot(Y, naive / k, "s--", color="#7570b3", lw=1.2, ms=3.5, alpha=0.9, label="naive concatenation: raw MODIS until 2011, raw VIIRS from 2012 (the VIIRS/MODIS ratio is ≈ 3: the splice is a step, not a fire year)")
ax.plot(Y, M / k, "^-", color="#555555", lw=1.2, ms=3.5, label="raw MODIS Terra+Aqua hotspots, 2000–2025 (1 km; Terra only until mid-2002)")
ax.plot(Y, V / k, "v-", color="#1b9e77", lw=1.2, ms=3.5, label="raw VIIRS S-NPP hotspots, 2012–2025 (375 m)")
ax.axvline(2011.5, color="k", lw=0.8, ls="--"); ax.text(2011.65, 4, "VIIRS S-NPP starts →", fontsize=8, va="bottom")
ax.axvspan(1999.5, 2002.5, color="#999999", alpha=0.08, lw=0); ax.text(2000.0, ax.get_ylim()[1] * 0.97, "Terra only\n(Nov 2000 → Jun 2002)", fontsize=7, va="top", alpha=0.8)
ax.set_xlim(1999.5, 2025.5); ax.set_ylim(0, None)
ax.set_ylabel("hotspots per year (thousands) — vegetation class, static sources excluded")
ax.set_xlabel("year")
ax.set_title("Argentina 2000–2025: MODIS and VIIRS count fire differently; the harmonized series removes the step, not the fire", fontsize=10.5)
ax.legend(fontsize=7.5, loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=1, frameon=False)
ax.grid(axis="y", alpha=0.25)
fig.text(0.01, 0.005, "Data: NASA FIRMS MODIS Collection 6/6.1 country archives (2000–2025) and VIIRS S-NPP (2012–2025) · GeoFuego Harmonization, NASA Space Apps 2026 · annual totals; interval = sum of monthly 80 % bounds (conservative)", fontsize=6, alpha=0.7)
fig.tight_layout(rect=(0, 0.03, 1, 1))
fig.savefig(out)
print(out, "| ratio harmonized 2003-2011 mean / 2012-2025 mean = %.2f ; raw MODIS same ratio = %.2f ; naive splice step 2011→2012 = %.2f" % (Hh[(Y >= 2003) & (Y <= 2011)].mean() / Hh[Y >= 2012].mean(), np.nanmean(M[(Y >= 2003) & (Y <= 2011)]) / np.nanmean(M[Y >= 2012]), naive[Y == 2012][0] / naive[Y == 2011][0]))
