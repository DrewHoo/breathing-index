#!/usr/bin/env python3
"""Cross-station sweep: same candidates, every station that releases values."""
import importlib.util, json, glob, os, math
spec = importlib.util.spec_from_file_location("se", "spore_eval.py")
se = importlib.util.module_from_spec(spec); spec.loader.exec_module(se)

STATIONS = ["Toledo, OH", "Olean, NY", "London, ON",
            "Melrose Park, IL", "Springfield, NJ", "Silver Spring, MD"]
TARGET, SEASON = "alternaria", (7, 10)

def prep(name):
    st = se.resolve(name); key = se.slug(st)
    counts = se.cached(f"counts_{key}.json", lambda: None)
    wx = se.cached(f"wx_{key}.json", lambda: None)
    feats = se.with_lags(se.daily_features(wx), se.LAG_KEYS)
    rows = [(d, feats[d], counts[d][TARGET]) for d in sorted(counts)
            if d in feats and SEASON[0] <= int(d[5:7]) <= SEASON[1]
            and counts[d].get(TARGET) is not None]
    return st, rows

data = {}
for nm in STATIONS:
    try:
        st, rows = prep(nm)
        if len(rows) >= 200:
            data[nm] = rows
        else:
            print(f"skip {nm}: only {len(rows)} in-season days")
    except SystemExit as e:
        print(f"skip {nm}: {e}")

CANDS = [c for c in se.CANDIDATES if c not in ("shipped_dayext",)]

print("\n" + "=" * 96)
print("IN-SAMPLE Spearman rho vs Alternaria, July-October, all years pooled per station")
print("=" * 96)
hdr = f"{'candidate':<16}" + "".join(f"{nm.split(',')[0][:11]:>13}" for nm in data)
print(hdr); print("-" * len(hdr))
sig = {}
for cand in CANDS:
    fn = se.CANDIDATES[cand][1]
    cells = []
    for nm, rows in data.items():
        xs, ys = [], []
        for _, f, t in rows:
            try: v = fn(f)
            except Exception: v = None
            if v is not None:
                xs.append(float(v)); ys.append(float(t))
        if len(xs) < 100:
            cells.append("     --"); continue
        rho, lo, hi = se.spearman_ci(xs, ys)
        star = "*" if (lo > 0 or hi < 0) else " "
        sig.setdefault(cand, []).append(rho)
        cells.append(f"{rho:+.3f}{star}")
    print(f"{cand:<16}" + "".join(f"{c:>13}" for c in cells))
print("\n* = 95% CI excludes zero")

print("\n" + "=" * 96)
print("HELD-OUT AUC, exceedance of each station's OWN 75th percentile")
print("train = first 70% of years, test = remainder")
print("=" * 96)
hdr = f"{'model':<20}" + "".join(f"{nm.split(',')[0][:11]:>13}" for nm in data)
print(hdr); print("-" * len(hdr))

aucs = {}
meta = {}
for nm, rows in data.items():
    vals = sorted(r[2] for r in rows)
    thr = vals[int(0.75 * (len(vals) - 1))]
    years = sorted({d[:4] for d, _, _ in rows})
    cut = years[int(len(years) * 0.7)]
    tr = [r for r in rows if r[0][:4] <= cut]
    te = [r for r in rows if r[0][:4] > cut]
    meta[nm] = (thr, len(tr), len(te), cut, years[-1])
    if not te:
        continue
    ytr = [1 if r[2] > thr else 0 for r in tr]
    yte = [1 if r[2] > thr else 0 for r in te]
    for cand in CANDS:
        fn = se.CANDIDATES[cand][1]
        vtr = [(fn(f) if f else None) for _, f, _ in tr]
        vte = [(fn(f) if f else None) for _, f, _ in te]
        ok = [i for i, v in enumerate(vtr) if v is not None]
        if len(ok) < 100 or sum(ytr) < 10:
            continue
        beta = se.logistic_fit([[1.0, float(vtr[i])] for i in ok], [ytr[i] for i in ok])
        keep = [i for i, v in enumerate(vte) if v is not None]
        if len(keep) < 40 or not (0 < sum(yte[i] for i in keep) < len(keep)):
            continue
        sc = [se.predict([[1.0, float(vte[i])]], beta)[0] for i in keep]
        yy = [yte[i] for i in keep]
        a = se.auc(sc, yy)
        lo, hi = se.auc_ci(a, sum(yy), len(yy) - sum(yy))
        aucs.setdefault(cand, {})[nm] = (a, lo, hi)

for cand in CANDS:
    if cand not in aucs: continue
    cells = []
    for nm in data:
        if nm not in aucs[cand]:
            cells.append("     --"); continue
        a, lo, hi = aucs[cand][nm]
        cells.append(f"{a:.3f}{'*' if lo > 0.5 else ' '}")
    print(f"{cand:<20}" + "".join(f"{c:>13}" for c in cells))
print("\n* = 95% CI excludes 0.50 (above chance)")
print("\nper-station setup:")
for nm, (thr, ntr, nte, cut, last) in meta.items():
    print(f"  {nm:<20} p75 threshold {thr:>6.0f}/m3   train n={ntr:<5} (..{cut})   test n={nte:<5} ({cut}..{last})")
