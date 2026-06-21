"""Fetches parking data (lots + on-street parking) from the OpenStreetMap
Overpass API and normalizes it into ParkingSpot objects.

Uses a SINGLE combined query per request to avoid rate-limiting:
 - Parking lots / tagged street parking → converted to ParkingSpot directly
 - Residential/secondary/tertiary roads → used for slot estimation
"""

import logging
import math
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.models.parking import LotInfo, ParkingRules, ParkingSpot, ParkingTimeRule

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_HEADERS = {"User-Agent": "ParkSmart/1.0 (hackathon project)"}

# Simple in-memory cache: rounds coordinates to ~100m grid cells, TTL 5 minutes.
_CACHE_TTL_S = 300.0
_CACHE_GRID = 0.001  # ~111 m at equator
_cache: Dict[Tuple, Tuple[float, List, List]] = {}  # key → (ts, real, estimated)

def _cache_key(lat: float, lng: float, radius: int) -> Tuple:
    return (round(lat / _CACHE_GRID), round(lng / _CACHE_GRID), radius)

def _cache_get(lat: float, lng: float, radius: int) -> Optional[Tuple[List, List]]:
    key = _cache_key(lat, lng, radius)
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL_S:
        logger.debug("Overpass cache hit for %s", key)
        return entry[1], entry[2]
    return None

def _cache_set(lat: float, lng: float, radius: int, real: List, estimated: List) -> None:
    key = _cache_key(lat, lng, radius)
    _cache[key] = (time.monotonic(), real, estimated)
    # Evict entries older than TTL to keep memory bounded
    now = time.monotonic()
    stale = [k for k, v in _cache.items() if now - v[0] > _CACHE_TTL_S]
    for k in stale:
        del _cache[k]

STREET_PARKING_VALUES = {
    "street_side", "on_street", "lane", "marked", "lay_by", "layby",
}
LANE_SIDES = ("both", "left", "right")
NO_LANE_PARKING_VALUES = {"no", "separate"}

_AVG_CAR_LENGTH_M = 25.0
# Fraction of a way's length assumed usable for parking. Most driveways,
# hydrants, corners, and bus stops aren't individually tagged in OSM, so this
# is deliberately conservative (was 0.85, then 0.65) rather than a theoretical
# maximum -- users have found real spots estimated on blocks with no actual
# parking, and demo feedback found even 0.65 papered whole streets in markers.
_DRIVEWAY_REDUCTION = 0.55
_MAX_ESTIMATED_SPOTS = 15
_ESTIMATE_MIN_LENGTH_M = 100.0
# A way long enough to produce more than this many slots is almost always a
# multi-block arterial Overpass returned as one way — estimating along its
# full length floods the map with markers, so skip it entirely rather than
# truncating (truncating would still place markers, just fewer of them).
_MAX_SLOTS_PER_WAY = 8

_ESTIMATION_HIGHWAYS = {
    "residential", "secondary", "tertiary", "unclassified", "living_street",
}
_RESTRICTED_ACCESS = {
    "private", "no", "customers", "delivery", "permit", "military", "emergency",
}
_NO_PARKING_CONDITIONS = {"no_stopping", "no_parking"}


# ---------------------------------------------------------------------------
# Combined Overpass query (single HTTP request)
# ---------------------------------------------------------------------------


def _build_combined_query(lat: float, lng: float, radius: int) -> str:
    """One query that fetches both parking elements and road geometries."""
    return f"""
    [out:json][timeout:30];
    (
      nwr["amenity"="parking"](around:{radius},{lat},{lng});
      nwr["parking"~"^(street_side|on_street|lane|marked|lay_by|layby)$"](around:{radius},{lat},{lng});
      way[~"^parking:lane:(left|right|both)$"~"."](around:{radius},{lat},{lng});
      way["highway"~"^(residential|secondary|tertiary|unclassified|living_street)$"](around:{radius},{lat},{lng});
    );
    out geom tags;
    """


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2.0 * R * math.asin(math.sqrt(min(1.0, a)))


def _centroid(nodes: List[Dict]) -> Tuple[float, float]:
    lat = sum(n["lat"] for n in nodes) / len(nodes)
    lon = sum(n["lon"] for n in nodes) / len(nodes)
    return lat, lon


def _element_lat_lng(element: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """Extract position from any Overpass element (node, way with geom, or center)."""
    if element["type"] == "node":
        lat, lon = element.get("lat"), element.get("lon")
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    # Way with full geometry (out geom tags)
    geom = element.get("geometry")
    if geom:
        return _centroid(geom)
    # Way/relation with center (out center tags fallback)
    center = element.get("center")
    if center:
        return center["lat"], center["lon"]
    return None


def _way_total_length_m(nodes: List[Dict]) -> float:
    total = 0.0
    for i in range(1, len(nodes)):
        total += _haversine_m(
            nodes[i - 1]["lat"], nodes[i - 1]["lon"],
            nodes[i]["lat"], nodes[i]["lon"],
        )
    return total


def _interpolate_along_way(nodes: List[Dict], num_points: int) -> List[Tuple[float, float]]:
    if len(nodes) < 2 or num_points <= 0:
        return []

    cumulative = [0.0]
    for i in range(1, len(nodes)):
        d = _haversine_m(nodes[i - 1]["lat"], nodes[i - 1]["lon"],
                          nodes[i]["lat"], nodes[i]["lon"])
        cumulative.append(cumulative[-1] + d)

    total = cumulative[-1]
    if total <= 0:
        return []

    results: List[Tuple[float, float]] = []
    for k in range(num_points):
        target = (k + 0.5) / num_points * total
        lo, hi = 0, len(cumulative) - 1
        while lo + 1 < hi:
            mid = (lo + hi) // 2
            if cumulative[mid] <= target:
                lo = mid
            else:
                hi = mid
        seg_len = cumulative[hi] - cumulative[lo]
        t = ((target - cumulative[lo]) / seg_len) if seg_len > 0 else 0.0
        lat = nodes[lo]["lat"] + t * (nodes[hi]["lat"] - nodes[lo]["lat"])
        lon = nodes[lo]["lon"] + t * (nodes[hi]["lon"] - nodes[lo]["lon"])
        results.append((lat, lon))

    return results


# ---------------------------------------------------------------------------
# Tag-level helpers
# ---------------------------------------------------------------------------


def _lane_parking_values(tags: Dict[str, str]) -> List[str]:
    values: List[str] = []
    for side in LANE_SIDES:
        value = (tags.get(f"parking:lane:{side}") or "").lower()
        if value and value not in NO_LANE_PARKING_VALUES:
            values.append(value)
    return values


def _parking_spot_type(tags: Dict[str, str]) -> Optional[str]:
    parking_value = (tags.get("parking") or "").lower()
    if parking_value in STREET_PARKING_VALUES:
        return "street"
    if _lane_parking_values(tags):
        return "street"
    if tags.get("amenity") == "parking":
        return "lot"
    return None


def _is_estimation_road(tags: Dict[str, str]) -> bool:
    return (tags.get("highway") or "").lower() in _ESTIMATION_HIGHWAYS


def _has_explicit_parking_tags(tags: Dict[str, str]) -> bool:
    for side in ("left", "right", "both"):
        if f"parking:lane:{side}" in tags:
            return True
    parking_val = (tags.get("parking") or "").lower()
    if parking_val in STREET_PARKING_VALUES:
        return True
    return False


def _is_no_parking(tags: Dict[str, str]) -> bool:
    if (tags.get("parking:lane:both") or "").lower() == "no":
        return True
    left = (tags.get("parking:lane:left") or "").lower()
    right = (tags.get("parking:lane:right") or "").lower()
    return left == "no" and right == "no"


def _is_accessible(tags: Dict[str, str]) -> bool:
    return (tags.get("access") or "").lower() not in _RESTRICTED_ACCESS


def _has_no_parking_condition(tags: Dict[str, str]) -> bool:
    """parking:condition:{side}=no_stopping/no_parking — explicit posted
    restrictions, distinct from parking:lane:{side}=no (no lane at all)."""
    for side in LANE_SIDES:
        condition = (tags.get(f"parking:condition:{side}") or "").lower()
        if condition in _NO_PARKING_CONDITIONS:
            return True
    return False


def _is_driveway_service_road(tags: Dict[str, str]) -> bool:
    return (tags.get("service") or "").lower() == "driveway"


def _is_bus_lane(tags: Dict[str, str]) -> bool:
    if (tags.get("psv") or "").lower() == "yes":
        return True
    return any(key.startswith("busway") and value for key, value in tags.items())


def _parse_capacity(tags: Dict[str, str]) -> Optional[int]:
    try:
        return int(tags["capacity"])
    except (KeyError, ValueError):
        return None


def _parse_fee(tags: Dict[str, str]) -> Optional[bool]:
    fee = (tags.get("fee") or "").lower()
    if fee in ("yes", "true"):
        return True
    if fee in ("no", "false"):
        return False
    return None


def _extract_rules(tags: Dict[str, str]) -> ParkingRules:
    fee_tag = tags.get("fee")
    fee_text: Optional[str] = None
    if fee_tag:
        charge = tags.get("charge")
        fee_text = f"{fee_tag} - {charge}" if charge else fee_tag

    restriction_parts: List[str] = []
    lane_values = _lane_parking_values(tags)
    if lane_values:
        orientations = sorted({v.replace("_", " ") for v in lane_values})
        restriction_parts.append(
            f"{' / '.join(o.capitalize() for o in orientations)} parking"
        )
    access = tags.get("access")
    if access and access.lower() not in ("yes", "public"):
        restriction_parts.append(f"Access: {access}")
    conditions: set = set()
    for side in LANE_SIDES:
        cond = tags.get(f"parking:condition:{side}")
        if cond:
            conditions.add(cond.replace("_", " "))
    restriction_parts.extend(sorted(conditions))

    max_stay = tags.get("maxstay")
    if not max_stay:
        for side in LANE_SIDES:
            ms = tags.get(f"parking:condition:{side}:maxstay")
            if ms:
                max_stay = ms
                break

    return ParkingRules(
        max_stay=max_stay,
        fee=fee_text,
        restriction="; ".join(restriction_parts) or None,
        hours=tags.get("opening_hours"),
        street_cleaning=None,
        notes=tags.get("description"),
    )


# ---------------------------------------------------------------------------
# OSM-tag-derived time rules (Berkeley + any other city with no dedicated
# open-data parking API) — far less complete than SFMTA's dataset
# (sf_parking_db.py), since most OSM ways simply aren't tagged with posted
# restrictions, but it surfaces real signal where it exists instead of
# leaving every spot blank outside SF.
# ---------------------------------------------------------------------------

# Ordered longest-prefix-first so e.g. "hours" is consumed whole by "hours?"
# rather than stopping at "h" and failing the trailing \b boundary check.
_MAXSTAY_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b", re.IGNORECASE
)
_TIME_INTERVAL_RE = re.compile(r"^\s*([A-Za-z,\-]+)\s+(\d{1,2}:\d{2}-\d{1,2}:\d{2})\s*$")


def _parse_maxstay_minutes(value: Optional[str]) -> Optional[int]:
    """Parses OSM maxstay-style values ('2 hours', '1 hour', '30 minutes',
    '90 min', '2h') into whole minutes. Returns None if no number+unit is
    found (e.g. 'unlimited')."""
    if not value:
        return None
    match = _MAXSTAY_RE.search(value.strip())
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    return int(round(amount * 60)) if unit.startswith("h") else int(round(amount))


def _parse_time_interval(value: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Parses a simple opening_hours-style interval like 'Mo-Fr 09:00-18:00'
    (as used in parking:condition:*:time_interval) into (days, hours).
    Returns (None, None) for anything more complex than that single shape."""
    if not value:
        return None, None
    match = _TIME_INTERVAL_RE.match(value.strip())
    if not match:
        return None, None
    return match.group(1), match.group(2)


def parse_osm_time_rules(tags: Dict[str, str]) -> List[ParkingTimeRule]:
    """Best-effort posted-rule extraction from OSM tags for a single real
    (non-estimated) spot — maxstay/time-limit, no-parking conditions, paid
    parking, and street cleaning. Returns an empty list when nothing is
    tagged, which the frontend renders as "Check posted signs" — the
    correct fallback for untagged streets."""
    rules: List[ParkingTimeRule] = []

    # 1. Time limit — maxstay, or parking:condition:{side}:maxstay.
    maxstay_raw = tags.get("maxstay")
    maxstay_side: Optional[str] = None
    if not maxstay_raw:
        for side in LANE_SIDES:
            ms = tags.get(f"parking:condition:{side}:maxstay")
            if ms:
                maxstay_raw, maxstay_side = ms, side
                break

    if maxstay_raw:
        max_stay_minutes = _parse_maxstay_minutes(maxstay_raw)

        days, hours = None, None
        for side in ([maxstay_side] if maxstay_side else LANE_SIDES):
            interval = tags.get(f"parking:condition:{side}:time_interval")
            if interval:
                days, hours = _parse_time_interval(interval)
                if days:
                    break

        description = (
            f"Time limit: {maxstay_raw.strip()} · {days} {hours}"
            if days and hours
            else f"Time limit: {maxstay_raw.strip()} · Check posted signs"
        )
        rules.append(ParkingTimeRule(
            rule_type="time_limit",
            days=days or "Check posted signs",
            hours=hours or "Check posted signs",
            max_stay_minutes=max_stay_minutes,
            description=description,
        ))

    # 2. No parking / no stopping — parking:condition:{side} = no_parking|no_stopping.
    for side in LANE_SIDES:
        condition = (tags.get(f"parking:condition:{side}") or "").lower()
        if condition in _NO_PARKING_CONDITIONS:
            interval = tags.get(f"parking:condition:{side}:time_interval")
            days, hours = _parse_time_interval(interval) if interval else (None, None)
            label = "No stopping" if condition == "no_stopping" else "No parking"
            rules.append(ParkingTimeRule(
                rule_type="no_parking",
                days=days or "Check posted signs",
                hours=hours or "Check posted signs",
                description=(
                    f"{label} · {days} {hours}" if days and hours
                    else f"{label} · Check posted signs"
                ),
            ))
            break  # one no-parking card is enough signal; avoid duplicating per side

    # 3. Paid parking — parking:fee=yes, fee=yes, or amenity=parking_meter.
    fee = (tags.get("parking:fee") or tags.get("fee") or "").lower()
    is_meter = tags.get("amenity") == "parking_meter"
    if fee in ("yes", "true") or is_meter:
        charge = tags.get("charge") or tags.get("parking:fee:amount")
        label = "Metered parking" if is_meter else "Paid parking"
        rules.append(ParkingTimeRule(
            rule_type="paid",
            days="Every day",
            hours="Check posted signs",
            description=f"{label} — {charge}" if charge else label,
        ))

    # 4. Street cleaning — rare on OSM ways, but seen tagged on some streets.
    cleaning_day = tags.get("cleaning_day") or tags.get("street_cleaning")
    if cleaning_day:
        rules.append(ParkingTimeRule(
            rule_type="street_cleaning",
            days=cleaning_day,
            hours="Check posted signs",
            description=f"Street cleaning · {cleaning_day}",
            cleaning_day=cleaning_day,
        ))

    return rules


def _compute_lot_info(tags: Dict[str, str]) -> LotInfo:
    fee_tag = (tags.get("fee") or "").strip().lower()
    charge = (tags.get("charge") or tags.get("parking:fee") or "").strip()

    if fee_tag in ("no", "false", "0"):
        fee_display = "Free"
    elif charge:
        fee_display = charge
    elif fee_tag in ("yes", "true"):
        fee_display = "Paid"
    else:
        fee_display = "Fee unknown"

    raw_hours = (tags.get("opening_hours") or "").strip()
    hours_display = "24/7" if raw_hours == "24/7" else (raw_hours or "Hours unknown")
    return LotInfo(fee_display=fee_display, hours_display=hours_display)


def _default_name(tags: Dict[str, str], spot_type: str) -> str:
    name = tags.get("name")
    if name:
        return f"{name} — Street Parking" if (spot_type == "street" and tags.get("highway")) else name
    return "Street Parking" if spot_type == "street" else tags.get("operator", "Parking Lot")


# ---------------------------------------------------------------------------
# Element → ParkingSpot (real OSM-tagged spots)
# ---------------------------------------------------------------------------


def _element_to_spot(element: Dict[str, Any]) -> Optional[ParkingSpot]:
    tags = element.get("tags", {})
    spot_type = _parking_spot_type(tags)
    if spot_type is None:
        return None

    pos = _element_lat_lng(element)
    if pos is None:
        return None
    lat, lng = pos

    return ParkingSpot(
        id=f"osm_{element['type']}_{element['id']}",
        name=_default_name(tags, spot_type),
        type=spot_type,
        lat=lat,
        lng=lng,
        address=tags.get("addr:full") or tags.get("addr:street"),
        rules=_extract_rules(tags),
        capacity=_parse_capacity(tags),
        fee=_parse_fee(tags),
        source="overpass",
        lot_info=_compute_lot_info(tags) if spot_type == "lot" else None,
        estimated=False,
        time_rules=parse_osm_time_rules(tags),
    )


# ---------------------------------------------------------------------------
# Main fetch function
# ---------------------------------------------------------------------------


async def fetch_parking(
    lat: float, lng: float, radius: int
) -> Tuple[List[ParkingSpot], List[ParkingSpot]]:
    """Single Overpass request that returns:
      - real_spots: OSM-tagged parking lots and street spots
      - estimated_spots: slots estimated from road geometry

    Results are cached for 5 minutes to avoid Overpass rate limits.
    """

    cached = _cache_get(lat, lng, radius)
    if cached is not None:
        return cached

    query = _build_combined_query(lat, lng, radius)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                OVERPASS_URL, data={"data": query}, headers=REQUEST_HEADERS
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Overpass request failed: %s", exc)
        # Re-raise (rather than swallowing to an empty result) so the caller
        # can tell "Overpass is down" apart from "no parking here" — the two
        # look identical to a frontend that only sees an empty spots list.
        raise

    elements = data.get("elements", [])

    # --- Pass 1: real OSM parking spots ---
    real_spots: List[ParkingSpot] = []
    real_way_ids: set = set()  # way IDs already covered by real data

    for element in elements:
        tags = element.get("tags", {})
        spot_type = _parking_spot_type(tags)
        if spot_type is None:
            continue
        spot = _element_to_spot(element)
        if spot:
            real_spots.append(spot)
            if element["type"] == "way":
                real_way_ids.add(element["id"])

    # --- Pass 2: estimation roads (sorted closest first) ---
    def _midpoint_dist(el: Dict) -> float:
        geom = el.get("geometry", [])
        if not geom:
            return float("inf")
        mid = geom[len(geom) // 2]
        return _haversine_m(lat, lng, mid.get("lat", lat), mid.get("lon", lng))

    road_elements = sorted(
        [e for e in elements
         if e.get("type") == "way" and _is_estimation_road(e.get("tags", {}))],
        key=_midpoint_dist,
    )

    estimated_spots: List[ParkingSpot] = []
    uncapped_estimated_total = 0  # sum of per-way slots before the 150-spot cap truncates the list

    for element in road_elements:
        # Skip if already fully covered by real OSM parking tags
        if element["id"] in real_way_ids:
            continue

        tags = element.get("tags", {})
        nodes = element.get("geometry", [])

        if len(nodes) < 2:
            continue
        if _has_explicit_parking_tags(tags):
            continue
        if _is_no_parking(tags):
            continue
        if _has_no_parking_condition(tags):
            continue
        if _is_driveway_service_road(tags):
            continue
        if _is_bus_lane(tags):
            continue
        if not _is_accessible(tags):
            continue

        total_m = _way_total_length_m(nodes)
        if total_m < _ESTIMATE_MIN_LENGTH_M:
            continue

        usable_m = total_m * _DRIVEWAY_REDUCTION
        estimated_slots = int(usable_m / _AVG_CAR_LENGTH_M)
        if estimated_slots <= 0:
            continue

        # Keep tallying the true (uncapped) total even past the cap, purely
        # for visibility into how much the heuristic itself is filtering out.
        uncapped_estimated_total += estimated_slots
        if estimated_slots > _MAX_SLOTS_PER_WAY:
            continue
        if len(estimated_spots) >= _MAX_ESTIMATED_SPOTS:
            continue

        remaining = _MAX_ESTIMATED_SPOTS - len(estimated_spots)
        slots_to_create = min(estimated_slots, remaining)

        way_id = element["id"]
        raw_name = tags.get("name", "")
        street_name = raw_name if raw_name else tags.get("highway", "Street").replace("_", " ").title()
        spot_name = f"{street_name} — Street Parking"

        for idx, (pt_lat, pt_lon) in enumerate(_interpolate_along_way(nodes, slots_to_create)):
            estimated_spots.append(ParkingSpot(
                id=f"est_way_{way_id}_{idx}",
                name=spot_name,
                type="street",
                lat=pt_lat,
                lng=pt_lon,
                address=None,
                rules=ParkingRules(
                    restriction="Estimated — verify posted signs",
                    notes=f"~{estimated_slots} estimated spaces on this block",
                ),
                capacity=None,
                fee=None,
                source="estimated",
                estimated=True,
            ))

    logger.info(
        "Overpass fetch_parking(lat=%.4f, lng=%.4f, radius=%d): %d real, %d estimated "
        "returned (reduction=%.2f, uncapped_estimated_total=%d, capped=%s)",
        lat, lng, radius, len(real_spots), len(estimated_spots),
        _DRIVEWAY_REDUCTION, uncapped_estimated_total,
        len(estimated_spots) >= _MAX_ESTIMATED_SPOTS,
    )

    _cache_set(lat, lng, radius, real_spots, estimated_spots)
    return real_spots, estimated_spots
