"""Thin client for the Mapbox Search Box API — powers the search bar's
address / neighborhood / business lookup.

Mapbox's older Geocoding v5 API (mapbox.places) has weak coverage for
generic chain businesses (e.g. "Whole Foods", "Starbucks" often return no
or irrelevant matches even with proximity bias) -- its POI data is mostly
limited to well-known unique landmarks. The Search Box API is Mapbox's
current product for combined address+POI-as-you-type search and has real
business coverage, at the cost of a two-step suggest -> retrieve flow tied
together by a client-generated session_token.
"""

import logging
from typing import List, Optional

import httpx

from app.models.search import SearchResult, SearchSuggestion

logger = logging.getLogger(__name__)

_SUGGEST_URL = "https://api.mapbox.com/search/searchbox/v1/suggest"
_RETRIEVE_URL = "https://api.mapbox.com/search/searchbox/v1/retrieve"
_RESULT_LIMIT = 6
_TYPES = "poi,address,place,neighborhood"


async def suggest_places(
    query: str,
    token: str,
    session_token: str,
    lat: Optional[float],
    lng: Optional[float],
) -> List[SearchSuggestion]:
    """Cheap autocomplete suggestions (no coordinates yet). Never raises --
    returns [] on no-match or an upstream error."""

    params = {
        "q": query,
        "access_token": token,
        "session_token": session_token,
        "types": _TYPES,
        "limit": str(_RESULT_LIMIT),
    }
    if lat is not None and lng is not None:
        params["proximity"] = f"{lng},{lat}"

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(_SUGGEST_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Mapbox suggest request failed: %s", exc)
        return []

    results: List[SearchSuggestion] = []
    for s in data.get("suggestions", []):
        mapbox_id = s.get("mapbox_id")
        if not mapbox_id:
            continue
        results.append(
            SearchSuggestion(
                mapbox_id=mapbox_id,
                name=s.get("name") or "Unknown",
                full_address=s.get("full_address") or s.get("place_formatted"),
                place_type=s.get("feature_type") or "poi",
            )
        )
    return results


async def retrieve_place(
    mapbox_id: str, token: str, session_token: str
) -> Optional[SearchResult]:
    """Resolve a suggestion's mapbox_id into real coordinates. Returns None
    on no-match or an upstream error."""

    params = {"access_token": token, "session_token": session_token}
    url = f"{_RETRIEVE_URL}/{mapbox_id}"

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Mapbox retrieve request failed: %s", exc)
        return None

    features = data.get("features", [])
    if not features:
        return None

    feature = features[0]
    coords = feature.get("geometry", {}).get("coordinates")
    if not coords or len(coords) != 2:
        return None

    props = feature.get("properties", {})
    return SearchResult(
        name=props.get("name") or "Unknown",
        full_address=props.get("full_address") or props.get("place_formatted"),
        lat=coords[1],
        lng=coords[0],
        place_type=props.get("feature_type") or "poi",
    )
