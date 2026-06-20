"""Routes for the search bar — proxy the Mapbox Search Box API so the token
stays server-side and results can be biased to the user's location.

Two-step flow (mirrors Mapbox's suggest -> retrieve session model):
  GET /search           cheap autocomplete suggestions, called every keystroke
  GET /search/retrieve  resolves a chosen suggestion into real coordinates
"""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.search import SearchResult, SearchSuggestResponse
from app.services import geocoding

router = APIRouter()


def _mapbox_token() -> Optional[str]:
    return os.getenv("VITE_MAPBOX_TOKEN") or os.getenv("MAPBOX_TOKEN")


@router.get("/search", response_model=SearchSuggestResponse)
async def search(
    query: str = Query(""),
    session_token: str = Query(...),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
) -> SearchSuggestResponse:
    """Address / neighborhood / business suggestions, biased toward
    (lat, lng) when given. Blank or unmatched queries return an empty list,
    not an error, since this is called on every keystroke."""

    trimmed = query.strip()
    if not trimmed:
        return SearchSuggestResponse(suggestions=[], session_token=session_token)

    token = _mapbox_token()
    if not token:
        return SearchSuggestResponse(suggestions=[], session_token=session_token)

    suggestions = await geocoding.suggest_places(trimmed, token, session_token, lat, lng)
    return SearchSuggestResponse(suggestions=suggestions, session_token=session_token)


@router.get("/search/retrieve/{mapbox_id}", response_model=SearchResult)
async def retrieve(mapbox_id: str, session_token: str = Query(...)) -> SearchResult:
    """Resolve a suggestion (by mapbox_id) from the same search session into
    real coordinates."""

    token = _mapbox_token()
    if not token:
        raise HTTPException(503, "Mapbox token not configured")

    result = await geocoding.retrieve_place(mapbox_id, token, session_token)
    if result is None:
        raise HTTPException(404, "Place not found")
    return result
