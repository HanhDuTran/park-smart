"""Real SF parking regulation + street sweeping data, downloaded once from
DataSF (data.sfgov.org) and cached locally in SQLite so every /api/parking
request can be enriched with what the posted sign actually says, instead of
guessing from OSM tags.

Dataset endpoints (verified directly against the DataSF Socrata API):
  - Parking regulations (per-blockface): https://data.sfgov.org/resource/hi6h-neyh.json
    ("Map of Parking Regulations", catalog id qbyz-te2i, is a map visualization
    built on top of this table — qbyz-te2i itself returns no queryable rows.)
  - Street sweeping schedule: https://data.sfgov.org/resource/yhqp-riqs.json

Both datasets describe each rule as a line geometry along a blockface, not a
point, so matching a parking spot to a rule means finding the nearest
polyline within a tolerance — not a simple lat/lng radius lookup.
"""

import datetime
import json
import logging
import math
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "sf_parking.db"
PARKING_REGULATIONS_URL = "https://data.sfgov.org/resource/hi6h-neyh.json"
STREET_SWEEPING_URL = "https://data.sfgov.org/resource/yhqp-riqs.json"
PAGE_SIZE = 5000
REQUEST_TIMEOUT_S = 30.0
DEFAULT_RADIUS_M = 30.0
# Wide arterials (e.g. Market St) can have several distinct, legitimately
# different curb schedules within one radius — cap and prioritize the
# closest ones rather than dumping every match into the BottomSheet.
MAX_REGULATION_RULES = 6
MAX_SWEEPING_RULES = 5

# (min_lat, max_lat, min_lng, max_lng) — used to skip enrichment lookups for
# spots well outside San Francisco.
SF_BOUNDS = (37.70, 37.84, -122.52, -122.35)


# ---------------------------------------------------------------------------
# DB connection / schema
# ---------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def is_db_populated() -> bool:
    if not DB_PATH.exists():
        return False
    try:
        conn = get_db()
        try:
            count = conn.execute("SELECT COUNT(*) FROM parking_regulations").fetchone()[0]
            return count > 100
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def _create_tables(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS parking_regulations")
    conn.execute("DROP TABLE IF EXISTS street_sweeping")
    conn.execute("""
        CREATE TABLE parking_regulations (
            id INTEGER PRIMARY KEY,
            regulation TEXT,
            days TEXT,
            from_time TEXT,
            to_time TEXT,
            hrs_begin REAL,
            hrs_end REAL,
            hrlimit REAL,
            rpp_area TEXT,
            exceptions TEXT,
            min_lat REAL, max_lat REAL, min_lng REAL, max_lng REAL,
            geometry TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE street_sweeping (
            id INTEGER PRIMARY KEY,
            corridor TEXT,
            limits TEXT,
            blockside TEXT,
            weekday TEXT,
            from_hour REAL,
            to_hour REAL,
            week1 INTEGER, week2 INTEGER, week3 INTEGER, week4 INTEGER, week5 INTEGER,
            min_lat REAL, max_lat REAL, min_lng REAL, max_lng REAL,
            geometry TEXT
        )
    """)
    conn.execute("CREATE INDEX idx_reg_bbox ON parking_regulations(min_lat, max_lat, min_lng, max_lng)")
    conn.execute("CREATE INDEX idx_sweep_bbox ON street_sweeping(min_lat, max_lat, min_lng, max_lng)")
    conn.commit()


# ---------------------------------------------------------------------------
# Geometry helpers — both datasets describe a rule as a line along a
# blockface (GeoJSON LineString or MultiLineString, [lng, lat] coordinate
# order), not a point.
# ---------------------------------------------------------------------------


def _to_sublines(geom: Optional[Dict[str, Any]]) -> List[List[List[float]]]:
    """Normalizes a LineString/MultiLineString into a list of sublines, each
    a list of [lng, lat] points — keeping sublines separate so distance
    isn't computed across the phantom gap between disconnected segments."""
    if not geom:
        return []
    coords = geom.get("coordinates") or []
    gtype = geom.get("type")
    if gtype == "LineString":
        return [coords] if coords else []
    if gtype == "MultiLineString":
        return [line for line in coords if line]
    return []


def _bbox_of_sublines(sublines: List[List[List[float]]]):
    points = [p for line in sublines for p in line]
    if not points:
        return None
    lngs = [p[0] for p in points]
    lats = [p[1] for p in points]
    return min(lats), max(lats), min(lngs), max(lngs)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2.0 * R * math.asin(math.sqrt(min(1.0, a)))


def _point_to_polyline_m(lat: float, lng: float, points: List[List[float]]) -> float:
    """Min distance (meters) from (lat,lng) to a polyline of [lng,lat] points,
    using a local flat-earth projection — accurate enough at <100m scale."""
    if not points:
        return float("inf")
    if len(points) == 1:
        return _haversine_m(lat, lng, points[0][1], points[0][0])

    mx_scale = 111_320.0 * math.cos(math.radians(lat)) or 1e-9
    my_scale = 110_540.0
    xy = [((p[0] - lng) * mx_scale, (p[1] - lat) * my_scale) for p in points]

    best = float("inf")
    for i in range(len(xy) - 1):
        ax, ay = xy[i]
        bx, by = xy[i + 1]
        dx, dy = bx - ax, by - ay
        seg_len_sq = dx * dx + dy * dy
        t = 0.0 if seg_len_sq == 0 else max(0.0, min(1.0, (-ax * dx - ay * dy) / seg_len_sq))
        cx, cy = ax + t * dx, ay + t * dy
        best = min(best, math.hypot(cx, cy))
    return best


def _min_distance_to_sublines(lat: float, lng: float, sublines: List[List[List[float]]]) -> float:
    if not sublines:
        return float("inf")
    return min(_point_to_polyline_m(lat, lng, line) for line in sublines)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


async def _download_paginated(client: httpx.AsyncClient, url: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        resp = await client.get(url, params={"$limit": PAGE_SIZE, "$offset": offset})
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        offset += PAGE_SIZE
        logger.info("Downloaded %d records from %s...", len(rows), url)
        if len(batch) < PAGE_SIZE:
            break
    return rows


def _to_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _hhmm_to_hour(value: Any) -> Optional[float]:
    """Converts an SFMTA HHMM-style value (e.g. '900' -> 9.0, '1830' -> 18.5)
    into a decimal hour."""
    n = _to_float(value)
    if n is None:
        return None
    n = int(n)
    return (n // 100) + (n % 100) / 60.0


async def download_and_build_db() -> None:
    """Downloads both DataSF datasets and rebuilds the local SQLite cache.
    Each dataset is fetched independently so a failure in one still leaves
    the other usable."""
    logger.info("Downloading SF parking regulations + street sweeping data from DataSF...")

    conn = get_db()
    _create_tables(conn)

    reg_rows: List[Dict[str, Any]] = []
    sweep_rows: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
        try:
            reg_rows = await _download_paginated(client, PARKING_REGULATIONS_URL)
        except httpx.HTTPError as exc:
            logger.warning("Failed to download parking regulations: %s", exc)

        try:
            sweep_rows = await _download_paginated(client, STREET_SWEEPING_URL)
        except httpx.HTTPError as exc:
            logger.warning("Failed to download street sweeping schedule: %s", exc)

    reg_inserts = []
    for r in reg_rows:
        sublines = _to_sublines(r.get("shape"))
        bbox = _bbox_of_sublines(sublines)
        if bbox is None or not r.get("regulation"):
            continue
        min_lat, max_lat, min_lng, max_lng = bbox
        reg_inserts.append((
            int(r["objectid"]),
            r.get("regulation"),
            r.get("days"),
            r.get("from_time"),
            r.get("to_time"),
            _hhmm_to_hour(r.get("hrs_begin")),
            _hhmm_to_hour(r.get("hrs_end")),
            _to_float(r.get("hrlimit")),
            r.get("rpparea1"),
            r.get("exceptions"),
            min_lat, max_lat, min_lng, max_lng,
            json.dumps(sublines),
        ))

    sweep_inserts = []
    for r in sweep_rows:
        sublines = _to_sublines(r.get("line"))
        bbox = _bbox_of_sublines(sublines)
        if bbox is None:
            continue
        min_lat, max_lat, min_lng, max_lng = bbox
        sweep_inserts.append((
            int(r["blocksweepid"]),
            r.get("corridor"),
            r.get("limits"),
            r.get("blockside"),
            r.get("weekday"),
            _to_float(r.get("fromhour")),
            _to_float(r.get("tohour")),
            int(_to_float(r.get("week1")) or 0),
            int(_to_float(r.get("week2")) or 0),
            int(_to_float(r.get("week3")) or 0),
            int(_to_float(r.get("week4")) or 0),
            int(_to_float(r.get("week5")) or 0),
            min_lat, max_lat, min_lng, max_lng,
            json.dumps(sublines),
        ))

    conn.executemany(
        "INSERT OR REPLACE INTO parking_regulations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        reg_inserts,
    )
    conn.executemany(
        "INSERT OR REPLACE INTO street_sweeping VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        sweep_inserts,
    )
    conn.commit()
    conn.close()

    logger.info(
        "SF parking DB ready: %d regulations, %d street-sweeping segments",
        len(reg_inserts), len(sweep_inserts),
    )


# ---------------------------------------------------------------------------
# Rule parsing
# ---------------------------------------------------------------------------


@dataclass
class SignRule:
    rule_type: str  # "time_limit" | "no_parking" | "permit" | "paid" | "paid_permit" | "oversized_vehicle" | "street_cleaning" | "other"
    days: str
    hours: str
    max_stay_minutes: Optional[int]
    description: str
    cleaning_day: Optional[str] = None
    is_active_now: bool = False


_DAY_TOKENS = {
    "M": 0, "MON": 0,
    "T": 1, "TU": 1, "TUE": 1, "TUES": 1,
    "W": 2, "WED": 2,
    "TH": 3, "THU": 3, "THUR": 3, "THURS": 3,
    "F": 4, "FRI": 4,
    "SA": 5, "SAT": 5,
    "SU": 6, "SUN": 6,
    "S": 5,  # ambiguous shorthand seen in the data ("M-S") — treat as Saturday
}

_SWEEP_WEEKDAY_TO_INT = {
    "Mon": 0, "Tue": 1, "Tues": 1, "Wed": 2, "Thu": 3, "Thur": 3, "Thurs": 3,
    "Fri": 4, "Sat": 5, "Sun": 6,
}

_WEEK_LABELS = ["1st", "2nd", "3rd", "4th", "5th"]


def _parse_day_range(days: Optional[str]) -> Optional[set]:
    """Returns the set of weekday ints (Mon=0..Sun=6) a rule applies on, or
    None when unparseable — callers should treat None as "don't gate on
    day", not "every day"."""
    if not days:
        return None
    s = days.strip().upper()
    if "," in s:
        result = {_DAY_TOKENS[p.strip()] for p in s.split(",") if p.strip() in _DAY_TOKENS}
        return result or None
    if "-" in s:
        start, _, end = s.partition("-")
        start, end = start.strip(), end.strip()
        if start in _DAY_TOKENS and end in _DAY_TOKENS:
            a, b = _DAY_TOKENS[start], _DAY_TOKENS[end]
            return set(range(a, b + 1)) if a <= b else set(range(a, 7)) | set(range(0, b + 1))
        return None
    if s in _DAY_TOKENS:
        return {_DAY_TOKENS[s]}
    return None


def _hours_to_str(h: float) -> str:
    hour = int(h)
    minute = round((h - hour) * 60)
    period = "AM" if hour % 24 < 12 else "PM"
    display_hour = hour % 12 or 12
    return f"{display_hour}:{minute:02d} {period}" if minute else f"{display_hour} {period}"


def _is_active_in_range(day_set: Optional[set], from_h: Optional[float], to_h: Optional[float]) -> bool:
    now = datetime.datetime.now()
    if day_set is not None and now.weekday() not in day_set:
        return False
    if from_h is None or to_h is None:
        return True
    current_h = now.hour + now.minute / 60.0
    if from_h <= to_h:
        return from_h <= current_h <= to_h
    return current_h >= from_h or current_h <= to_h  # overnight wraparound


def _classify_regulation(regulation: str) -> str:
    r = regulation.strip().lower()
    if "time limit" in r:
        return "time_limit"
    if "pay" in r and "permit" in r:
        return "paid_permit"
    if "oversized" in r:
        return "oversized_vehicle"
    if "permit" in r:
        return "permit"
    if "pay" in r:
        return "paid"
    if "no parking" in r or "no stopping" in r or "no overnight" in r or "limited no parking" in r:
        return "no_parking"
    return "other"


def _row_to_regulation_rule(row: sqlite3.Row) -> Optional[SignRule]:
    regulation = row["regulation"]
    if not regulation:
        return None

    rule_type = _classify_regulation(regulation)
    days_str = (row["days"] or "Every day").strip()
    from_h, to_h = row["hrs_begin"], row["hrs_end"]

    from_label = row["from_time"] or (_hours_to_str(from_h) if from_h is not None else None)
    to_label = row["to_time"] or (_hours_to_str(to_h) if to_h is not None else None)
    hours_str = f"{from_label} - {to_label}" if from_label and to_label else "All hours"

    max_stay_minutes = int(row["hrlimit"] * 60) if row["hrlimit"] else None

    description = f"{regulation.strip()} · {days_str} {hours_str}"
    rpp_area = (row["rpp_area"] or "").strip()
    if rpp_area and rpp_area.upper() not in ("0", "N", "NA", "NONE"):
        description += f" (RPP Area {rpp_area} exempt)"

    day_set = _parse_day_range(days_str)
    is_active = _is_active_in_range(day_set, from_h, to_h)

    return SignRule(
        rule_type=rule_type,
        days=days_str,
        hours=hours_str,
        max_stay_minutes=max_stay_minutes,
        description=description,
        is_active_now=is_active,
    )


def _row_to_sweeping_rule(row: sqlite3.Row) -> Optional[SignRule]:
    weekday_raw = (row["weekday"] or "").strip()
    if not weekday_raw or weekday_raw == "Holiday":
        return None
    weekday_int = _SWEEP_WEEKDAY_TO_INT.get(weekday_raw)
    from_h, to_h = row["from_hour"], row["to_hour"]

    weeks = [label for i, label in enumerate(_WEEK_LABELS, start=1) if row[f"week{i}"]]
    week_str = "/".join(weeks) if weeks and len(weeks) < 5 else "every"

    hours_str = f"{_hours_to_str(from_h)} - {_hours_to_str(to_h)}" if from_h is not None and to_h is not None else "Unknown hours"
    description = f"Street cleaning · {week_str} {weekday_raw} {hours_str}"

    now = datetime.datetime.now()
    is_today = weekday_int is not None and now.weekday() == weekday_int
    week_of_month = min((now.day - 1) // 7 + 1, 5)
    applies_this_week = not weeks or _WEEK_LABELS[week_of_month - 1] in weeks
    current_h = now.hour + now.minute / 60.0
    is_active = bool(
        is_today and applies_this_week and from_h is not None and to_h is not None
        and from_h <= current_h <= to_h
    )

    return SignRule(
        rule_type="street_cleaning",
        days=f"{week_str} {weekday_raw}",
        hours=hours_str,
        max_stay_minutes=None,
        description=description,
        cleaning_day=weekday_raw,
        is_active_now=is_active,
    )


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------


def _bbox_filter(lat: float, lng: float, radius_m: float):
    lat_delta = radius_m / 111_000.0
    lng_delta = radius_m / (111_000.0 * math.cos(math.radians(lat)) or 1e-9)
    return lat - lat_delta, lat + lat_delta, lng - lng_delta, lng + lng_delta


def get_signs_near(lat: float, lng: float, radius_m: float = DEFAULT_RADIUS_M) -> List[SignRule]:
    """Public entry point — opens its own connection. Prefer `enrich_spots`
    when enriching many spots in one request (shares a single connection)."""
    if not is_db_populated():
        return []
    conn = get_db()
    try:
        return _get_signs_near(conn, lat, lng, radius_m)
    finally:
        conn.close()


def _get_signs_near(conn: sqlite3.Connection, lat: float, lng: float, radius_m: float) -> List[SignRule]:
    """Adjacent short blockface segments (especially along wide arterials
    like Market St) often repeat the exact same posted rule, or carry several
    legitimately different ones (both curb sides, transit lanes, etc.) within
    one radius — dedupe on displayed content, then keep only the closest
    few so the BottomSheet isn't flooded."""
    min_lat, max_lat, min_lng, max_lng = _bbox_filter(lat, lng, radius_m)

    reg_candidates: List[Tuple[float, SignRule]] = []
    seen_reg: set = set()
    reg_rows = conn.execute(
        "SELECT * FROM parking_regulations WHERE max_lat >= ? AND min_lat <= ? AND max_lng >= ? AND min_lng <= ?",
        (min_lat, max_lat, min_lng, max_lng),
    ).fetchall()
    for row in reg_rows:
        sublines = json.loads(row["geometry"])
        dist = _min_distance_to_sublines(lat, lng, sublines)
        if dist > radius_m:
            continue
        rule = _row_to_regulation_rule(row)
        if not rule:
            continue
        key = (rule.rule_type, rule.days, rule.hours, rule.max_stay_minutes)
        if key in seen_reg:
            continue
        seen_reg.add(key)
        reg_candidates.append((dist, rule))

    sweep_candidates: List[Tuple[float, SignRule]] = []
    seen_sweep: set = set()
    sweep_rows = conn.execute(
        "SELECT * FROM street_sweeping WHERE max_lat >= ? AND min_lat <= ? AND max_lng >= ? AND min_lng <= ?",
        (min_lat, max_lat, min_lng, max_lng),
    ).fetchall()
    for row in sweep_rows:
        sublines = json.loads(row["geometry"])
        dist = _min_distance_to_sublines(lat, lng, sublines)
        if dist > radius_m:
            continue
        rule = _row_to_sweeping_rule(row)
        if not rule:
            continue
        key = (rule.rule_type, rule.days, rule.hours, rule.cleaning_day)
        if key in seen_sweep:
            continue
        seen_sweep.add(key)
        sweep_candidates.append((dist, rule))

    reg_candidates.sort(key=lambda t: t[0])
    sweep_candidates.sort(key=lambda t: t[0])

    return (
        [r for _, r in reg_candidates[:MAX_REGULATION_RULES]]
        + [r for _, r in sweep_candidates[:MAX_SWEEPING_RULES]]
    )


def _in_sf_bounds(lat: float, lng: float) -> bool:
    min_lat, max_lat, min_lng, max_lng = SF_BOUNDS
    return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng


def get_signs_near_batch(
    coords: List[Tuple[float, float]], radius_m: float = DEFAULT_RADIUS_M
) -> List[List[SignRule]]:
    """Batched version of get_signs_near sharing one DB connection — use this
    when enriching many spots in a single request instead of opening/closing
    a connection per spot. Each result list is empty for coords outside SF."""
    if not is_db_populated():
        return [[] for _ in coords]
    conn = get_db()
    try:
        return [
            _get_signs_near(conn, lat, lng, radius_m) if _in_sf_bounds(lat, lng) else []
            for lat, lng in coords
        ]
    finally:
        conn.close()
