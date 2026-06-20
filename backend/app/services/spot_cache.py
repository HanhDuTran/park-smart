"""In-memory cache mapping parking spot ids to coordinates.

Parking spots are fetched fresh per request (Overpass/Google aren't a stable
list), so a spot_id handed to Claude in one tool call can't be looked back up
on a later call without remembering where it was. This cache is populated
every time parking_service.fetch_combined_spots() runs (from the regular
/api/parking route or from the voice assistant's find_parking_spots tool) and
lets get_directions/check_spot_status resolve a spot_id back to a location.
"""

import time
from typing import Dict, List, Optional, Tuple

from app.models.parking import ParkingSpot

_TTL_S = 600.0  # 10 minutes — long enough to span a multi-turn voice conversation
_cache: Dict[str, Tuple[float, float, str, float]] = {}  # id -> (lat, lng, name, ts)


def remember(spots: List[ParkingSpot]) -> None:
    now = time.monotonic()
    for s in spots:
        _cache[s.id] = (s.lat, s.lng, s.name, now)

    stale = [k for k, v in _cache.items() if now - v[3] > _TTL_S]
    for k in stale:
        del _cache[k]


def resolve(spot_id: str) -> Optional[Tuple[float, float, str]]:
    entry = _cache.get(spot_id)
    if entry is None:
        return None

    lat, lng, name, ts = entry
    if time.monotonic() - ts > _TTL_S:
        del _cache[spot_id]
        return None

    return lat, lng, name
