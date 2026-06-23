#!/usr/bin/env python3
"""
Offline data-prep: aggregate real per-player NFL stats from nflverse into a
compact JSON keyed by ESPN player id, for the backend to merge onto the live
ESPN player pool.

Why offline: completed-season stats never change, and we don't want the free-tier
backend parsing a 33MB CSV on every cold start. Re-run this when a new season of
data becomes available; commit the regenerated src/data/playerStats.json.

Usage:  python3 scripts/build_player_stats.py
"""

import csv
import json
import os
import sys
import urllib.request

STATS_URL = "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv"
XWALK_URL = "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv"

CACHE_DIR = "/tmp"
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "playerStats.json")


def download(url, name):
    path = os.path.join(CACHE_DIR, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        print(f"  using cached {name}")
        return path
    print(f"  downloading {name} …")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def f(v):
    """Parse a CSV cell as float, treating blanks/NA as 0."""
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def main():
    print("Building player stats…")
    stats_path = download(STATS_URL, "player_stats.csv")
    xwalk_path = download(XWALK_URL, "db_playerids.csv")

    # gsis_id -> espn_id crosswalk
    gsis_to_espn = {}
    with open(xwalk_path, newline="") as fh:
        for row in csv.DictReader(fh):
            gsis, espn = row.get("gsis_id"), row.get("espn_id")
            if gsis and espn and espn != "NA":
                gsis_to_espn[gsis] = str(int(float(espn)))  # normalize "4430807.0" -> "4430807"

    print(f"  crosswalk: {len(gsis_to_espn)} gsis->espn ids")

    # Determine the most recent season present
    seasons = set()
    with open(stats_path, newline="") as fh:
        for row in csv.DictReader(fh):
            seasons.add(row["season"])
    latest = max(seasons)
    print(f"  latest season in data: {latest}")

    # Aggregate that season's regular-season rows per gsis player
    agg = {}
    with open(stats_path, newline="") as fh:
        for row in csv.DictReader(fh):
            if row["season"] != latest or row["season_type"] != "REG":
                continue
            pid = row["player_id"]
            a = agg.setdefault(pid, {"games": 0, "comp": 0, "att": 0, "passYds": 0, "passTd": 0,
                                     "int": 0, "car": 0, "rushYds": 0, "rushTd": 0, "rec": 0,
                                     "tgt": 0, "recYds": 0, "recTd": 0, "ppr": 0.0})
            a["games"] += 1
            a["comp"] += f(row["completions"]); a["att"] += f(row["attempts"])
            a["passYds"] += f(row["passing_yards"]); a["passTd"] += f(row["passing_tds"])
            a["int"] += f(row["interceptions"])
            a["car"] += f(row["carries"]); a["rushYds"] += f(row["rushing_yards"])
            a["rushTd"] += f(row["rushing_tds"])
            a["rec"] += f(row["receptions"]); a["tgt"] += f(row["targets"])
            a["recYds"] += f(row["receiving_yards"]); a["recTd"] += f(row["receiving_tds"])
            a["ppr"] += f(row["fantasy_points_ppr"])

    # Map to espn_id, round, drop empty stat lines
    players = {}
    for gsis, a in agg.items():
        espn = gsis_to_espn.get(gsis)
        if not espn:
            continue
        for k in ("comp", "att", "passYds", "passTd", "int", "car", "rushYds",
                  "rushTd", "rec", "tgt", "recYds", "recTd"):
            a[k] = int(round(a[k]))
        a["ppr"] = round(a["ppr"], 1)
        a["ppg"] = round(a["ppr"] / a["games"], 1) if a["games"] else 0
        players[espn] = a

    out = {"season": int(latest), "players": players}
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"  wrote {len(players)} players for {latest} -> {os.path.relpath(OUT_PATH)} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
