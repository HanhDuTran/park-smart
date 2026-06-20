"""Pydantic models for the location search (Mapbox Search Box API) endpoints."""

from typing import List, Optional

from pydantic import BaseModel


class SearchSuggestion(BaseModel):
    """A cheap, no-coordinates autocomplete suggestion from /suggest."""

    mapbox_id: str
    name: str
    full_address: Optional[str] = None
    place_type: str


class SearchSuggestResponse(BaseModel):
    suggestions: List[SearchSuggestion]
    session_token: str


class SearchResult(BaseModel):
    """A fully-resolved place with coordinates, from /retrieve."""

    name: str
    full_address: Optional[str] = None
    lat: float
    lng: float
    place_type: str
