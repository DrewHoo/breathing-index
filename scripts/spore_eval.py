#!/usr/bin/env python3
"""
spore_eval.py — deterministic test harness for weather-based spore proxies.

Joins National Allergy Bureau volumetric counts to ERA5 hourly weather at each
station's own coordinates, computes candidate proxy formulations, and ranks them
by rank correlation against the measured counts.

Everything is cached to disk, so a run is reproducible: same station + same
candidate set = same leaderboard, no network.

    ./spore_eval.py stations --near 41.31,-72.93 --limit 15
    ./spore_eval.py pull 'Toledo'
    ./spore_eval.py eval --station 'Toledo' --target alternaria
    ./spore_eval.py eval --station 'Toledo' --target alternaria --holdout

NAB data licensing: the AAAAI's terms prohibit use without written consent and
they do not release data for commercial or for-profit use. This is a personal
validation tool. Do not ship its inputs or redistribute the cached counts.
"""

import argparse, json, math, os, statistics, subprocess, sys
from collections import defaultdict

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spore_cache")
NAB = "https://pollen.aaaai.org/graphql/public"
ERA5 = "https://archive-api.open-meteo.com/v1/archive"
WX_VARS = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,dew_point_2m"


# ---------------------------------------------------------------- transport

def curl(url, payload=None, timeout=120):
    """urllib trips on this machine's cert store; curl does not."""
    cmd = ["curl", "-sS", "--compressed", "--max-time", str(timeout), url]
    if payload is not None:
        cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(payload)]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def gql(query, partial_ok=False):
    """The NAB schema declares some fields non-null that are null in the data
    (station.website, among others), so GraphQL returns partial data alongside
    an error. Partial data is still usable; only a total failure is fatal."""
    import time
    # Under sustained load the server returns {"data":{"<field>":null}} with a
    # WIN32 error. It is rate limiting, not a bad query: the identical request
    # succeeds after ~15s. So back off generously and retry on a null FIELD,
    # not just on null data. Be a good citizen — this is someone else's server
    # and the whole point of the cache is to hit it once.
    for delay in (0, 5, 15, 30, 45, 60):
        if delay:
            time.sleep(delay)
        r = curl(NAB, {"query": query})
        data = r.get("data")
        ok = data is not None and (
            any(v is not None for v in data.values()) if partial_ok
            else all(v is not None for v in data.values()))
        if ok:
            time.sleep(1.0)  # courtesy pause between successful calls
            return data
    raise SystemExit("NAB API error after 6 tries: "
                     + (r.get("errors") or [{}])[0].get("message", "?"))


def cached(name, build):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    data = build()
    with open(path, "w") as f:
        json.dump(data, f)
    return data


# ---------------------------------------------------------------- stations

def all_stations():
    return cached("stations.json", lambda: gql(
        "query { stations(limit:1000) { id displayCity city state latitude longitude "
        "phoneNumber headName } }")["stations"])


def miles(lat1, lon1, lat2, lon2):
    R, rad = 3958.8, math.radians
    dlat, dlon = rad(lat2 - lat1), rad(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def resolve(name):
    """Match a station by city name, optionally 'City, ST'. Unique or bust.

    Several NAB cities repeat across states (Springfield MA/NJ/MO), so the
    state qualifier is how you disambiguate rather than guessing."""
    state = None
    if "," in name:
        name, state = (p.strip() for p in name.rsplit(",", 1))
    hits = [s for s in all_stations()
            if s["latitude"] is not None
            and name.lower() in (s["displayCity"] or "").lower()
            and (state is None or (s["state"] or "").upper() == state.upper())]
    if not hits:
        raise SystemExit(f"no station matching {name!r}" + (f" in {state}" if state else ""))
    if len(hits) > 1:
        exact = [h for h in hits if (h["displayCity"] or "").lower() == name.lower()]
        if len(exact) == 1:
            return exact[0]
        raise SystemExit("ambiguous, qualify with a state: "
                         + " | ".join(f'{h["displayCity"]}, {h["state"]}' for h in hits))
    return hits[0]


def cmd_stations(args):
    lat, lon = (float(x) for x in args.near.split(",")) if args.near else (None, None)
    rows = []
    for s in all_stations():
        if s["latitude"] is None:
            continue
        d = miles(lat, lon, s["latitude"], s["longitude"]) if lat is not None else 0.0
        rows.append((d, s))
    rows.sort(key=lambda r: r[0])
    print(f"{'mi':>5}  {'station':<34} {'last count':<12} {'n':>6}  mold?  contact")
    for d, s in rows[: args.limit]:
        meta = gql(f'query {{ station(id:"{s["id"]}") {{ allergenCollectionSets {{ date }} '
                   f"stationAllergens {{ allergen {{ category }} }} }} }}")["station"]
        dates = sorted(x["date"] for x in meta["allergenCollectionSets"])
        cats = {x["allergen"]["category"] for x in meta["stationAllergens"]}
        where = f'{s["displayCity"]}, {s["state"]}'
        print(f"{d:5.0f}  {where:<34} {(dates[-1] if dates else 'NEVER'):<12} {len(dates):>6}"
              f"  {'yes' if 'MOLD' in cats else '  -':<5}  {s.get('headName') or ''} {s.get('phoneNumber') or ''}")


# ---------------------------------------------------------------- pull

TAXA = {
    "alternaria": r"^Alternaria",
    "cladosporium": r"^Cladosporium",
    "epicoccum": r"^Epicoccum",
    "basidiospores": r"^Basidiospores",
    "ascospores": r"^Ascospores|^Ascomycete",
}


def summarise(cs):
    """One day's collection rows -> the record we cache."""
    import re
    rec = {"mold_total": None, "weed": 0, "grass": 0, "tree": 0}
    mold_rows = [c for c in cs if c["allergen"]["category"] == "MOLD"]
    if mold_rows:
        rec["mold_total"] = sum(max(0, c["value"] or 0) for c in mold_rows)
    for k in ("weed", "grass", "tree"):
        rec[k] = sum(max(0, c["value"] or 0) for c in cs
                     if c["allergen"]["category"] == k.upper())
    for taxon, pat in TAXA.items():
        m = next((c for c in cs if re.search(pat, c["allergen"]["commonName"] or "", re.I)), None)
        rec[taxon] = max(0, m["value"] or 0) if m else None
    return rec


def pull_counts(station):
    """Paginate by DATE RANGE, not offset.

    The API's offset pagination is not stable — successive pages overlap, so a
    naive offset walk silently drops roughly half the record. Year ranges are
    disjoint by construction, and we assert the recovered dates against the
    station's own date list before returning.
    """
    import re
    # Filter on the station's own `city` + `state`, NOT `displayCity`. They
    # differ for several stations ("Washington, DC - Silver Spring" displays
    # one way and files under "Silver Spring"), and city alone is ambiguous
    # across states.
    sid, city, state = station["id"], station["city"], station["state"]
    expected = sorted(x["date"] for x in gql(
        f'query {{ station(id:"{sid}") {{ allergenCollectionSets {{ date }} }} }}'
    )["station"]["allergenCollectionSets"])
    if not expected:
        raise SystemExit(f"{city}, {state} has no collection sets")
    years = range(int(expected[0][:4]), int(expected[-1][:4]) + 1)

    out = {}
    for y in years:
        filt = (f'station.city==\\"{city}\\" and station.state==\\"{state}\\" '
                f'and date>=\\"{y}-01-01\\" and date<=\\"{y}-12-31\\"')
        page = gql(f'query {{ allergenCollectionSets(limit:500, order:"date", '
                   f'filter:"{filt}") {{ date allergenCollections '
                   f"{{ value allergen {{ category commonName }} }} }} }}")["allergenCollectionSets"]
        for s in page:
            out[s["date"]] = summarise(s["allergenCollections"])

    # Many NAB stations LIST their collection dates but do not release the
    # values through the public API: station(id:){...} returns 2,248 dates for
    # Waterbury CT, while allergenCollectionSet(id:) returns null for every one
    # of them and every root-level filter misses them entirely. That is a
    # per-station data-release setting, not a query bug, and no amount of
    # retrying or re-phrasing gets past it. Fail with the reason.
    if not out:
        raise SystemExit(
            f"{city}, {state}: the API lists {len(expected):,} collection dates but "
            f"releases no values for this station. Counts are withheld at source; "
            f"they would have to come from the station operator or an AAAAI data request.")

    missing = set(expected) - set(out)
    if missing:
        raise SystemExit(f"{city}, {state}: recovered {len(out)} of {len(expected)} days; "
                         f"{len(missing)} missing, e.g. {sorted(missing)[:5]}")
    return out


def pull_weather(station, start, end):
    lat, lon = station["latitude"], station["longitude"]
    url = (f"{ERA5}?latitude={lat}&longitude={lon}&start_date={start}&end_date={end}"
           f"&hourly={WX_VARS}&timezone=auto")
    return curl(url)["hourly"]


def slug(station):
    return f'{station["displayCity"]}_{station["state"]}'.replace(" ", "-").replace("/", "-")


def cmd_pull(args):
    st = resolve(args.station)
    key = slug(st)
    counts = cached(f"counts_{key}.json", lambda: pull_counts(st))
    days = sorted(counts)
    # 14-day lookback so the longest antecedent window is complete on day one
    start = (iso_shift(days[0], -14))
    wx = cached(f"wx_{key}.json", lambda: pull_weather(st, start, days[-1]))
    print(f'{st["displayCity"]}, {st["state"]}  ({st["latitude"]:.3f}, {st["longitude"]:.3f})')
    print(f"  count days : {len(counts):,}   {days[0]} -> {days[-1]}")
    print(f"  with mold  : {sum(1 for d in counts.values() if d['mold_total'] is not None):,}")
    print(f"  with Alt   : {sum(1 for d in counts.values() if d.get('alternaria') is not None):,}")
    print(f"  wx hours   : {len(wx['time']):,}")
    print(f"  cache      : {CACHE}")


def iso_shift(d, n):
    import datetime
    return (datetime.date.fromisoformat(d) + datetime.timedelta(days=n)).isoformat()


# ---------------------------------------------------------------- features

def daily_features(wx):
    """One feature dict per local calendar day, from hourly ERA5."""
    t = wx["time"]
    pr = wx["precipitation"]
    cum = [0.0]
    for v in pr:
        cum.append(cum[-1] + (v or 0.0))
    by_day = defaultdict(list)
    for i, ts in enumerate(t):
        by_day[ts[:10]].append(i)

    def safe(seq, fn, default=None):
        vals = [v for v in seq if v is not None]
        return fn(vals) if vals else default

    feats = {}
    for day, idx in by_day.items():
        last = idx[-1]
        T = [wx["temperature_2m"][i] for i in idx]
        RH = [wx["relative_humidity_2m"][i] for i in idx]
        WS = [wx["wind_speed_10m"][i] / 3.6 if wx["wind_speed_10m"][i] is not None else None for i in idx]
        DP = [wx["dew_point_2m"][i] for i in idx]
        aft = [i for i in idx if 12 <= int(t[i][11:13]) <= 18]
        f = {
            "t_max": safe(T, max), "t_min": safe(T, min), "t_mean": safe(T, statistics.mean),
            "t_aft": safe([wx["temperature_2m"][i] for i in aft], statistics.mean),
            "rh_min": safe(RH, min), "rh_max": safe(RH, max), "rh_mean": safe(RH, statistics.mean),
            "rh_aft": safe([wx["relative_humidity_2m"][i] for i in aft], statistics.mean),
            "wind_max": safe(WS, max), "wind_mean": safe(WS, statistics.mean),
            "dp_mean": safe(DP, statistics.mean),
            "rain_day": cum[last + 1] - cum[max(0, last - 23)],
            "rain_48h": cum[last + 1] - cum[max(0, last - 47)],
            "rain_7d": cum[last + 1] - cum[max(0, last - 167)],
            "rain_14d": cum[last + 1] - cum[max(0, last - 335)],
        }
        if f["t_max"] is not None and f["rh_min"] is not None:
            es = 0.6108 * math.exp(17.27 * f["t_max"] / (f["t_max"] + 237.3))
            f["vpd_max"] = es * (1 - f["rh_min"] / 100.0)

        # The shipped index is defined per HOUR and the app logs the current hour,
        # so the honest daily summaries are the peak and the afternoon mean of the
        # hourly score — not a score built from each variable's own daily extreme,
        # which would be the best hour for every condition at once.
        hourly = []
        for i in idx:
            T_i, RH_i, W_i = (wx["temperature_2m"][i], wx["relative_humidity_2m"][i],
                              wx["wind_speed_10m"][i])
            if T_i is None or RH_i is None or W_i is None:
                continue
            r48 = cum[i + 1] - cum[max(0, i - 47)]
            r7 = cum[i + 1] - cum[max(0, i - 167)]
            hourly.append((i, int(T_i > 20) + int(RH_i < 60) + int(W_i / 3.6 > 2)
                           + int(r48 < 0.5) + int(r7 >= 5)))
        scores = [s for _, s in hourly]
        f["dsi_peak"] = max(scores) if scores else None
        f["dsi_mean"] = statistics.mean(scores) if scores else None
        aft_h = [s for i, s in hourly if 12 <= int(t[i][11:13]) <= 18]
        f["dsi_aft"] = statistics.mean(aft_h) if aft_h else None
        feats[day] = f
    # days since >=1mm rain
    days = sorted(feats)
    since = 99
    for d in days:
        since = 0 if feats[d]["rain_day"] >= 1.0 else since + 1
        feats[d]["dry_run"] = since
    return feats


def with_lags(feats, keys, lags=(1, 2, 3)):
    days = sorted(feats)
    for n, d in enumerate(days):
        for lag in lags:
            src = feats[days[n - lag]] if n - lag >= 0 else None
            for k in keys:
                feats[d][f"{k}_lag{lag}"] = src.get(k) if src else None
    return feats


# ---------------------------------------------------------------- candidates
# Each candidate: name -> (human spec, fn(features_for_day) -> float or None)
# Add new ones here. Nothing else needs to change.

def _c(f, cond):
    try:
        return 1 if cond else 0
    except TypeError:
        return 0


CANDIDATES = {
    "shipped_v1": (
        "AS SHIPPED. Per-hour count of 5 (t>20C, RH<60%, wind>2m/s, rain48h<0.5mm, rain7d>=5mm), daily PEAK",
        lambda f: f.get("dsi_peak")),
    "shipped_aft": (
        "shipped index, mean over 12:00-18:00 local (matches a 24h count better than an instant)",
        lambda f: f.get("dsi_aft")),
    "shipped_dayext": (
        "same 5 conditions but each read off its own daily extreme — looser than shipped, kept as a control",
        lambda f: (_c(f, f["t_max"] > 20) + _c(f, f["rh_min"] < 60) + _c(f, f["wind_max"] > 2)
                   + _c(f, f["rain_48h"] < 0.5) + _c(f, f["rain_7d"] >= 5))),
    "tightened_v2": (
        "count of 5 with raised thresholds: t>22, RH<50, wind>3, rain48h<1.0, rain7d>=15",
        lambda f: (_c(f, f["t_max"] > 22) + _c(f, f["rh_min"] < 50) + _c(f, f["wind_max"] > 3)
                   + _c(f, f["rain_48h"] < 1.0) + _c(f, f["rain_7d"] >= 15))),
    "gated_release": (
        "gate on (rain7d>=15 AND wind_max>3); score = warm + dry + no-recent-rain (0-3), else 0",
        lambda f: 0 if not (f["rain_7d"] >= 15 and f["wind_max"] > 3) else
                  (_c(f, f["t_max"] > 22) + _c(f, f["rh_min"] < 50) + _c(f, f["rain_48h"] < 1.0))),
    "vpd_max": ("vapour pressure deficit at t_max/rh_min (kPa), continuous", lambda f: f.get("vpd_max")),
    "t_max": ("daily max temperature, continuous", lambda f: f["t_max"]),
    "rh_min_inv": ("100 - daily min RH, continuous", lambda f: 100 - f["rh_min"] if f["rh_min"] is not None else None),
    "dry_run": ("consecutive days since >=1mm rain", lambda f: f["dry_run"]),
    "wet_then_dry": ("rain_7d lagged 3d, times dryness today: rain_7d_lag3 * (100-rh_min)/100",
                     lambda f: None if f.get("rain_7d_lag3") is None or f["rh_min"] is None
                     else f["rain_7d_lag3"] * (100 - f["rh_min"]) / 100.0),
    "shipped_lag1": ("shipped index on YESTERDAY's weather (spec 28 puts Alternaria at 0-2d lag)",
                     lambda f: f.get("dsi_peak_lag1")),
    "shipped_lag2": ("shipped index two days back", lambda f: f.get("dsi_peak_lag2")),
    "vpd_lag1": ("yesterday's max VPD", lambda f: f.get("vpd_max_lag1")),
}

LAG_KEYS = ["t_max", "t_min", "rh_min", "rh_mean", "wind_max", "rain_day", "rain_48h",
            "rain_7d", "vpd_max", "dry_run", "dsi_peak"]


# ---------------------------------------------------------------- stats

def rankdata(v):
    n = len(v)
    order = sorted(range(n), key=lambda i: v[i])
    r = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and v[order[j + 1]] == v[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[order[k]] = avg
        i = j + 1
    return r


def pearson(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    sa = sb = sab = 0.0
    for x, y in zip(a, b):
        da, db = x - ma, y - mb
        sa += da * da
        sb += db * db
        sab += da * db
    return sab / math.sqrt(sa * sb) if sa and sb else float("nan")


def spearman_ci(x, y):
    n = len(x)
    rho = pearson(rankdata(x), rankdata(y))
    if n < 4 or not (-1 < rho < 1):
        return rho, None, None
    z = 0.5 * math.log((1 + rho) / (1 - rho))
    se = 1 / math.sqrt(n - 3)
    return rho, math.tanh(z - 1.96 * se), math.tanh(z + 1.96 * se)


# ---------------------------------------------------------------- eval

def cmd_eval(args):
    st = resolve(args.station)
    key = slug(st)
    counts = cached(f"counts_{key}.json", lambda: pull_counts(st))
    days = sorted(counts)
    wx = cached(f"wx_{key}.json", lambda: pull_weather(st, iso_shift(days[0], -14), days[-1]))
    feats = with_lags(daily_features(wx), LAG_KEYS)

    lo, hi = (int(x) for x in args.season.split("-"))
    rows = []
    for d in days:
        if d not in feats:
            continue
        mo = int(d[5:7])
        if not (lo <= mo <= hi):
            continue
        tgt = counts[d].get(args.target)
        if tgt is None:
            continue
        rows.append((d, feats[d], float(tgt)))

    print(f'\n{st["displayCity"]}, {st["state"]}   target={args.target}   '
          f"season=months {lo}-{hi}   n={len(rows)} days")
    if len(rows) < 30:
        raise SystemExit("too few paired days to evaluate")
    years = sorted({d[:4] for d, _, _ in rows})
    print(f"years: {years[0]}-{years[-1]}   |   {len(years)} distinct\n")

    # The baseline this whole literature forgets to run. For each day, predict
    # the median count on that day-of-year in every OTHER year. Leave-one-year-out,
    # so it never sees the day it is predicting. Any weather proxy that cannot
    # beat this is not reading the weather — it is reading the calendar.
    by_doy = defaultdict(lambda: defaultdict(list))
    for d, _f, t in rows:
        by_doy[d[5:10]][d[:4]].append(t)
    climo = {}
    for d, _f, _t in rows:
        others = [v for yr, vs in by_doy[d[5:10]].items() if yr != d[:4] for v in vs]
        # widen to a +/-3 day window so early years are not empty
        if len(others) < 2:
            import datetime
            base = datetime.date.fromisoformat(d)
            others = [v for off in range(-3, 4)
                      for yr, vs in by_doy[(base + datetime.timedelta(days=off)).isoformat()[5:10]].items()
                      if yr != d[:4] for v in vs]
        climo[d] = statistics.median(others) if others else None

    results = []
    for name, (spec, fn) in list(CANDIDATES.items()) + [
            ("doy_climatology", ("BASELINE: leave-one-year-out median count for this day-of-year", None))]:
        pairs = []
        for d, f, t in rows:
            try:
                v = climo[d] if fn is None else fn(f)
            except (TypeError, KeyError):
                v = None
            if v is not None and isinstance(v, (int, float)) and not math.isnan(v):
                pairs.append((float(v), t))
        if len(pairs) < 30:
            results.append((name, spec, None, None, None, len(pairs)))
            continue
        rho, cl, ch = spearman_ci([p[0] for p in pairs], [p[1] for p in pairs])
        results.append((name, spec, rho, cl, ch, len(pairs)))

    results.sort(key=lambda r: (r[2] is None, -(r[2] or -9)))
    print(f"{'candidate':<16} {'rho':>7} {'95% CI':>18} {'n':>6}  verdict")
    print("-" * 78)
    for name, spec, rho, cl, ch, n in results:
        if rho is None:
            print(f"{name:<16} {'--':>7} {'insufficient data':>18} {n:>6}")
            continue
        ci = f"[{cl:+.3f},{ch:+.3f}]"
        verdict = "crosses zero" if cl <= 0 <= ch else ("USABLE" if abs(rho) >= 0.5 else "weak")
        print(f"{name:<16} {rho:>+8.4f} {ci:>18} {n:>6}  {verdict}")
    print()
    for name, spec, *_ in results:
        print(f"  {name:<16} {spec}")

    if args.holdout:
        print("\nyear-holdout (fit-free candidates, so this only shows year-to-year stability)")
        print(f"{'candidate':<16} " + " ".join(f"{y[2:]:>6}" for y in years))
        for name, (spec, fn) in CANDIDATES.items():
            cells = []
            for y in years:
                sub = [(fn(f), t) for d, f, t in rows if d[:4] == y]
                sub = [(v, t) for v, t in sub if v is not None]
                cells.append(f"{spearman_ci([s[0] for s in sub], [s[1] for s in sub])[0]:+.2f}"
                             if len(sub) >= 20 else "   --")
            print(f"{name:<16} " + " ".join(f"{c:>6}" for c in cells))


# ---------------------------------------------------------------- main

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("stations", help="list NAB stations, nearest first")
    s.add_argument("--near", help="LAT,LON")
    s.add_argument("--limit", type=int, default=12)
    s.set_defaults(func=cmd_stations)

    s = sub.add_parser("pull", help="cache counts + weather for a station")
    s.add_argument("station", help="city name, e.g. Toledo")
    s.set_defaults(func=cmd_pull)

    s = sub.add_parser("eval", help="rank candidate proxies against measured counts")
    s.add_argument("--station", required=True)
    s.add_argument("--target", default="alternaria",
                   choices=["alternaria", "cladosporium", "epicoccum", "basidiospores",
                            "ascospores", "mold_total", "weed", "grass", "tree"])
    s.add_argument("--season", default="7-10", help="month range, e.g. 7-10 or 1-12")
    s.add_argument("--holdout", action="store_true", help="per-year breakdown")
    s.set_defaults(func=cmd_eval)

    s = sub.add_parser("classify", help="threshold-exceedance models, held-out years")
    s.add_argument("--station", required=True)
    s.add_argument("--target", default="alternaria")
    s.add_argument("--threshold", type=float, default=100.0, help="spores/m3")
    s.add_argument("--season", default="7-10")
    s.add_argument("--train-through", dest="train_through",
                   help="last training year, e.g. 2020; default is a 70/30 split by year")
    s.set_defaults(func=cmd_classify)

    args = p.parse_args()
    args.func(args)




# ---------------------------------------------------------------- classify
# Threshold exceedance, which is what this literature actually predicts. The
# field abandoned daily concentration regression years ago; our own Toledo
# leaderboard says why.

def solve(A, b):
    """Gaussian elimination with partial pivoting. n is single digits here."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[p][c]) < 1e-12:
            raise ValueError("singular")
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r == c:
                continue
            f = M[r][c] / M[c][c]
            for k in range(c, n + 1):
                M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def logistic_fit(X, y, ridge=1e-3, iters=40):
    """IRLS (Newton-Raphson) with a small ridge. X includes the intercept column.

    The ridge is there because threshold models on skewed count data separate
    easily, and a separated column sends its coefficient to infinity and the
    Hessian to singular. A tiny penalty keeps it finite without moving the fit.
    """
    n, p = len(X), len(X[0])
    beta = [0.0] * p
    for _ in range(iters):
        eta = [sum(X[i][j] * beta[j] for j in range(p)) for i in range(n)]
        mu = [1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, e)))) for e in eta]
        w = [max(m * (1 - m), 1e-6) for m in mu]
        z = [eta[i] + (y[i] - mu[i]) / w[i] for i in range(n)]
        XtWX = [[sum(w[i] * X[i][a] * X[i][b] for i in range(n)) + (ridge if a == b else 0.0)
                 for b in range(p)] for a in range(p)]
        XtWz = [sum(w[i] * X[i][a] * z[i] for i in range(n)) for a in range(p)]
        try:
            new = solve(XtWX, XtWz)
        except ValueError:
            break
        if max(abs(new[j] - beta[j]) for j in range(p)) < 1e-8:
            beta = new
            break
        beta = new
    return beta


def predict(X, beta):
    return [1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, sum(x[j] * beta[j] for j in range(len(beta)))))))
            for x in X]


def auc(scores, y):
    """Rank-based AUC — equal to the Mann-Whitney U statistic, normalised."""
    pos = sum(y)
    neg = len(y) - pos
    if pos == 0 or neg == 0:
        return float("nan")
    r = rankdata(scores)
    return (sum(r[i] for i in range(len(y)) if y[i]) - pos * (pos + 1) / 2) / (pos * neg)


def auc_ci(a, npos, nneg):
    """Hanley & McNeil (1982) standard error. Without this an AUC of 0.58 on
    72 positives reads as a finding when it is indistinguishable from 0.5."""
    if npos == 0 or nneg == 0 or a != a:
        return (float("nan"), float("nan"))
    q1 = a / (2 - a)
    q2 = 2 * a * a / (1 + a)
    var = (a * (1 - a) + (npos - 1) * (q1 - a * a) + (nneg - 1) * (q2 - a * a)) / (npos * nneg)
    se = math.sqrt(max(var, 0.0))
    return (max(0.0, a - 1.96 * se), min(1.0, a + 1.96 * se))


def best_cutoff(scores, y):
    """Cutoff maximising F1, chosen on TRAINING data only."""
    best, bc = -1.0, 0.5
    for c in sorted(set(scores)):
        tp = sum(1 for s, t in zip(scores, y) if s >= c and t)
        fp = sum(1 for s, t in zip(scores, y) if s >= c and not t)
        fn = sum(1 for s, t in zip(scores, y) if s < c and t)
        f1 = 2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) else 0.0
        if f1 > best:
            best, bc = f1, c
    return bc


# Published Catalonia coefficients (Velez-Pereira et al., one Alternaria station,
# recovered from the UAB thesis). Order: intercept, Tmax, Tmax^2, Tmin, Tmin^2,
# Prec, Prec_1, Prec_2, Prec_3, RH. Four threshold bands: low/med/high/very high.
CATALONIA_ALTERNARIA = {
    "low":       [1.50, 0.19, -0.01, -0.13, 0.02, -0.02, 0.00, 0.01, 0.00, -0.03],
    "medium":    [-1.75, 0.28, -0.01, -0.10, 0.01, -0.02, 0.00, 0.02, 0.01, -0.02],
    "high":      [-5.93, 0.44, -0.01, 0.02, 0.00, -0.04, 0.01, 0.01, 0.01, -0.01],
    "very_high": [-7.52, 0.46, -0.01, 0.12, 0.00, -0.03, 0.01, 0.02, 0.02, -0.02],
}


def catalonia_row(f):
    """The 9-term Catalonia design row, plus intercept. None if incomplete."""
    need = ["t_max", "t_min", "rain_day", "rain_day_lag1", "rain_day_lag2",
            "rain_day_lag3", "rh_mean"]
    if any(f.get(k) is None for k in need):
        return None
    return [1.0, f["t_max"], f["t_max"] ** 2, f["t_min"], f["t_min"] ** 2,
            f["rain_day"], f["rain_day_lag1"], f["rain_day_lag2"], f["rain_day_lag3"],
            f["rh_mean"]]


# Single-variable designs to refit, so the comparison is like-for-like: every
# row here is a logistic model fitted on the same training years.
SINGLE = {
    "vpd_lag1":   lambda f: f.get("vpd_max_lag1"),
    "vpd_max":    lambda f: f.get("vpd_max"),
    "t_max":      lambda f: f.get("t_max"),
    "shipped_v1": lambda f: f.get("dsi_peak"),
    "shipped_lag1": lambda f: f.get("dsi_peak_lag1"),
}


def cmd_classify(args):
    st = resolve(args.station)
    key = slug(st)
    counts = cached(f"counts_{key}.json", lambda: pull_counts(st))
    days = sorted(counts)
    wx = cached(f"wx_{key}.json", lambda: pull_weather(st, iso_shift(days[0], -14), days[-1]))
    feats = with_lags(daily_features(wx), LAG_KEYS)

    lo, hi = (int(x) for x in args.season.split("-"))
    rows = [(d, feats[d], counts[d][args.target]) for d in days
            if d in feats and lo <= int(d[5:7]) <= hi
            and counts[d].get(args.target) is not None]
    years = sorted({d[:4] for d, _, _ in rows})
    if len(years) < 4:
        raise SystemExit("need at least 4 distinct years to hold any out")
    cut = args.train_through or years[int(len(years) * 0.7)]
    train = [r for r in rows if r[0][:4] <= cut]
    test = [r for r in rows if r[0][:4] > cut]
    if not test:
        raise SystemExit(f"no test years after {cut}")

    ytr = [1 if r[2] >= args.threshold else 0 for r in train]
    yte = [1 if r[2] >= args.threshold else 0 for r in test]
    base = sum(yte) / len(yte)

    print(f'\n{st["displayCity"]}, {st["state"]}   {args.target} >= {args.threshold}   '
          f"months {lo}-{hi}")
    print(f"train {years[0]}-{cut} (n={len(train)}, {sum(ytr)/len(ytr):.1%} positive)   "
          f"TEST {years[years.index(cut)+1]}-{years[-1]} (n={len(test)}, {base:.1%} positive)")
    print(f"majority-class baseline accuracy on test: {max(base, 1-base):.1%}\n")

    results = []

    def score_model(name, tr_scores, te_scores):
        keep = [i for i, s in enumerate(te_scores) if s is not None]
        if len(keep) < 20:
            return
        ss = [te_scores[i] for i in keep]
        yy = [yte[i] for i in keep]
        a = auc(ss, yy)
        lo_a, hi_a = auc_ci(a, sum(yy), len(yy) - sum(yy))
        ktr = [i for i, s in enumerate(tr_scores) if s is not None]
        c = best_cutoff([tr_scores[i] for i in ktr], [ytr[i] for i in ktr])
        tp = sum(1 for s, t in zip(ss, yy) if s >= c and t)
        tn = sum(1 for s, t in zip(ss, yy) if s < c and not t)
        fp = sum(1 for s, t in zip(ss, yy) if s >= c and not t)
        fn = sum(1 for s, t in zip(ss, yy) if s < c and t)
        sens = tp / (tp + fn) if tp + fn else float("nan")
        spec = tn / (tn + fp) if tn + fp else float("nan")
        acc = (tp + tn) / len(yy)
        f1 = 2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) else 0.0
        results.append((name, a, lo_a, hi_a, sens, spec, acc, f1, len(yy)))

    # 1. Catalonia form, coefficients as published in Spain — pure transfer test
    Xtr = [catalonia_row(f) for _, f, _ in train]
    Xte = [catalonia_row(f) for _, f, _ in test]
    for band, beta in CATALONIA_ALTERNARIA.items():
        score_model(f"catalonia_{band}(ES)",
                    [None if x is None else predict([x], beta)[0] for x in Xtr],
                    [None if x is None else predict([x], beta)[0] for x in Xte])

    # 2. Catalonia FORM, refit on this station's training years
    ok_tr = [i for i, x in enumerate(Xtr) if x is not None]
    if len(ok_tr) > 50:
        beta = logistic_fit([Xtr[i] for i in ok_tr], [ytr[i] for i in ok_tr])
        score_model("catalonia_refit",
                    [None if x is None else predict([x], beta)[0] for x in Xtr],
                    [None if x is None else predict([x], beta)[0] for x in Xte])

    # 3. Single-variable logistic models, refit the same way
    for name, get in SINGLE.items():
        vtr = [get(f) for _, f, _ in train]
        vte = [get(f) for _, f, _ in test]
        ok = [i for i, v in enumerate(vtr) if v is not None]
        if len(ok) < 50:
            continue
        beta = logistic_fit([[1.0, float(vtr[i])] for i in ok], [ytr[i] for i in ok])
        score_model(f"{name}_logit",
                    [None if v is None else predict([[1.0, float(v)]], beta)[0] for v in vtr],
                    [None if v is None else predict([[1.0, float(v)]], beta)[0] for v in vte])

    # 4. Baselines
    doy = defaultdict(list)
    for d, _, t in train:
        doy[d[5:10]].append(1 if t >= args.threshold else 0)
    def climo(d):
        import datetime
        b = datetime.date.fromisoformat(d)
        pool = [v for off in range(-3, 4)
                for v in doy.get((b + datetime.timedelta(days=off)).isoformat()[5:10], [])]
        return sum(pool) / len(pool) if pool else None
    score_model("doy_climatology", [climo(d) for d, _, _ in train], [climo(d) for d, _, _ in test])

    results.sort(key=lambda r: -(r[1] if r[1] == r[1] else -9))
    print(f"{'model':<24} {'AUC':>6} {'95% CI':>16} {'sens':>7} {'spec':>7} {'acc':>7} {'F1':>6}")
    print("-" * 80)
    for name, a, lo_a, hi_a, sens, spec, acc, f1, n in results:
        note = "chance" if lo_a <= 0.5 else "ABOVE CHANCE"
        if acc <= max(base, 1 - base):
            note += ", <= majority"
        print(f"{name:<24} {a:>6.3f} {f'[{lo_a:.3f},{hi_a:.3f}]':>16} "
              f"{sens:>7.1%} {spec:>7.1%} {acc:>7.1%} {f1:>6.3f}  {note}")
    print("\nAUC 0.5 = chance. Cutoff for sens/spec/acc/F1 was tuned on TRAIN only.")

if __name__ == "__main__":
    main()
