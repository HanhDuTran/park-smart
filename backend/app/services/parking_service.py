"""Shared logic for fetching and merging parking spots from all sources.

Used by both the /api/parking route and the voice assistant's
find_parking_spots tool, so there's a single place that combines Overpass +
Google Places and injects crowdsourced live status.
"""

import asyncio
import os
from typing import List, Tuple

from app.models.parking import ParkingSpot, ParkingTimeRule
from app.services import google_places, overpass, sf_parking_db, spot_cache, status_store


def _enrich_with_sf_signs(spots: List[ParkingSpot]) -> List[ParkingSpot]:
    """Adds real SFMTA `time_rules` to every street spot, using a single
    shared DB connection for the whole batch. No-ops (returns unchanged)
    until the one-time DataSF download has completed."""
    street_indices = [i for i, s in enumerate(spots) if s.type == "street"]
    if not street_indices:
        return spots

    coords = [(spots[i].lat, spots[i].lng) for i in street_indices]
    sign_rules_batch = sf_parking_db.get_signs_near_batch(coords)

    for i, sign_rules in zip(street_indices, sign_rules_batch):
        if not sign_rules:
            continue
        time_rules = [
            ParkingTimeRule(
                rule_type=sr.rule_type,
                days=sr.days,
                hours=sr.hours,
                max_stay_minutes=sr.max_stay_minutes,
                description=sr.description,
                cleaning_day=sr.cleaning_day,
                is_active_now=sr.is_active_now,
            )
            for sr in sign_rules
        ]
        spots[i] = spots[i].model_copy(update={"time_rules": time_rules})

    return spots


async def fetch_combined_spots(
    lat: float, lng: float, radius: int
) -> Tuple[List[ParkingSpot], bool]:
    """Fetch nearby parking spots merged from OSM and Google Places, with live
    crowdsourced status injected for street spots. Also remembers each spot's
    location in spot_cache so it can be resolved by id later.

    Returns (spots, street_data_unavailable) — the second value is True when
    the Overpass call itself failed (rate-limited, timed out, etc.), distinct
    from Overpass legitimately finding nothing.
    """

    google_api_key = os.getenv("GOOGLE_PLACES_API_KEY")

    overpass_result, google_result = await asyncio.gather(
        overpass.fetch_parking(lat, lng, radius),
        google_places.fetch_parking_lots(lat, lng, radius, google_api_key),
        return_exceptions=True,
    )

    raw_spots: List[ParkingSpot] = []

    street_data_unavailable = isinstance(overpass_result, Exception)
    if not street_data_unavailable:
        real_spots, estimated_spots = overpass_result
        raw_spots.extend(real_spots)
        raw_spots.extend(estimated_spots)

    if not isinstance(google_result, Exception):
        raw_spots.extend(google_result)

    spots: List[ParkingSpot] = []
    for spot in raw_spots:
        if spot.type == "street" and not spot.estimated:
            live = status_store.get_status(spot.id)
            if live is not None:
                spot = spot.model_copy(update={"live_status": live})
        spots.append(spot)

    spots = _enrich_with_sf_signs(spots)

    spot_cache.remember(spots)
    return spots, street_data_unavailable
