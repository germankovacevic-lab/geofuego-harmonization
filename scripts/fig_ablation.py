#!/usr/bin/env python3
# fig_ablation.py — Headline validation figure: LOYO ablation ladder (what each level of the hierarchy adds) + forward test.
# Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
import json, pathlib
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = pathlib.Path(__file__).resolve().parent.parent
A = json.loads((ROOT / "data/validation/loyo_summary_ablation.json").read_text())
B = json.loads((ROOT / "data/validation/loyo_summary.json").read_text())
order = [("scalar", None), ("country", "country × month"), ("region", "+ region"), ("prov", "+ province"), ("cell", "+ 0.25° cell")]
def val(set_, depth, level, key):
    rows = [r for r in A["summary"] if r["set"] == set_ and r["level"] == level and r["depth"] == depth]
    return rows[0][key] if rows else None
fig, ax = plt.subplots(1, 2, figsize=(11, 4.6), dpi=150)
for i, (set_, title) in enumerate([("TA", "Terra+Aqua → VIIRS (used 2002–2011)"), ("T", "Terra only → VIIRS (used 2000–mid 2002)")]):
    labels, prov, ctry, folds_p = [], [], [], []
    for depth, lab in order:
        if depth == "scalar":
            labels.append("single national\nscalar"); prov.append(100 * val(set_, "cell", "prov", "season_mape_scalar")); ctry.append(100 * val(set_, "cell", "country", "season_mape_scalar")); folds_p.append(None)
        else:
            labels.append(lab); prov.append(100 * val(set_, depth, "prov", "season_mape")); ctry.append(100 * val(set_, depth, "country", "season_mape"))
            fr = [r["season_mape"] for r in A["folds"] if r["set"] == set_ and r["level"] == "prov" and r["depth"] == depth]
            folds_p.append((100 * np.percentile(fr, 25), 100 * np.percentile(fr, 75)))
    x = np.arange(len(labels)); a = ax[i]
    a.bar(x - 0.18, prov, 0.36, color="#1b9e77", label="province, fire-season (Jul–Nov) MAPE")
    a.bar(x + 0.18, ctry, 0.36, color="#7570b3", label="country, fire-season MAPE")
    for xi, f in zip(x, folds_p):
        if f: a.plot([xi - 0.18, xi - 0.18], [f[0], f[1]], color="k", lw=1)
    for xi, (p, c) in enumerate(zip(prov, ctry)):
        a.text(xi - 0.18, p + 0.4, f"{p:.1f}", ha="center", fontsize=7); a.text(xi + 0.18, c + 0.4, f"{c:.1f}", ha="center", fontsize=7)
    a.set_xticks(x); a.set_xticklabels(labels, fontsize=8); a.set_ylabel("out-of-sample error (%)"); a.set_title(title, fontsize=10)
    a.set_ylim(0, max(prov) * 1.25)
    if i == 0: a.legend(fontsize=8, loc="upper right")
fw = B.get("forward_test", {})
txt = "Leave-one-year-out, 2012–2023 (12 folds, paired days). Whiskers: inter-quartile range across folds."
if fw: txt += "  Forward test on years never used (Terra+Aqua, country predicted/observed): " + ", ".join(f"{y}: {v['country_pred_over_obs']:.3f}" for y, v in fw.get("TA", {}).items())
fig.text(0.01, 0.01, txt, fontsize=7.5)
fig.text(0.99, 0.01, "NASA FIRMS MODIS C6.1 + VIIRS S-NPP · GeoFuego Harmonization · NASA Space Apps 2026", fontsize=6, alpha=0.7, ha="right")
fig.suptitle("What each level of the hierarchy adds: LOYO error of the MODIS→VIIRS-equivalent prediction", fontsize=11)
fig.tight_layout(rect=(0, 0.05, 1, 0.95))
out = ROOT / "figures" / "validation_ablation_ladder.png"; fig.savefig(out); print(out)
