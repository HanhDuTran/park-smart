"""Fetches nearby parking lots from the Google Places API (Nearby Search)
and normalizes them into ParkingSpot objects."""

import logging
from typing import Any, Dict, List, Optional

import httpx

from app.models.parking import LotInfo, ParkingRules, ParkingSpot

logger = logging.getLogger(__name__)

NEARBY_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"


def _compute_lot_info(place: Dict[str, Any]) -> LotInfo:
    price_level: Optional[int] = place.get("price_level")
    if price_level is None:
        fee_display = "Fee unknown"
    elif price_level == 0:
        fee_display = "Free"
    else:
        # Nearby Search only returns price_level (1-4), not a price string.
        # A Places Details call would be needed for the real price.
        fee_display = "Paid"

    opening: Dict[str, Any] = place.get("opening_hours") or {}
    open_now: Optional[bool] = opening.get("open_now")
    if open_now is True:
        hours_display = "Open now"
    elif open_now is False:
        hours_display = "Currently closed"
    else:
        hours_display = "Hours unknown"

    return LotInfo(fee_display=fee_display, hours_display=hours_display)


async def fetch_parking_lots(
    lat: float, lng: float, radius: int, api_key: Optional[str]
) -> List[ParkingSpot]:
    """Query Google Places for nearby parking lots. Returns an empty list if
    no API key is configured or the request fails."""

    if not api_key:
        return []

    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "type": "parking",
        "key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(NEARBY_SEARCH_URL, params=params)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Google Places request failed: %s", exc)
        return []

    status = data.get("status")
    if status not in ("OK", "ZERO_RESULTS"):
        logger.warning("Google Places returned status: %s", status)
        return []

    spots: List[ParkingSpot] = []
    for place in data.get("results", []):
        location = place.get("geometry", {}).get("location")
        if not location:
            continue

        price_level = place.get("price_level")
        fee: Optional[bool] = None
        fee_text: Optional[str] = None
        if price_level is not None:
            fee = price_level > 0
            fee_text = "yes" if fee else "no"

        spots.append(
            ParkingSpot(
                id=f"google_{place['place_id']}",
                name=place.get("name", "Parking Lot"),
                type="lot",
                lat=location["lat"],
                lng=location["lng"],
                address=place.get("vicinity"),
                rules=ParkingRules(fee=fee_text),
                capacity=None,
                fee=fee,
                source="google_places",
                lot_info=_compute_lot_info(place),
            )
        )

    return spots
