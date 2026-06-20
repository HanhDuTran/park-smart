"""Pydantic models for the Mapbox Directions route response."""

from typing import Any, Dict, List

from pydantic import BaseModel


class RouteStep(BaseModel):
    instruction: str
    distance_meters: float
    duration_seconds: float
    maneuver_type: str  # "depart" | "turn" | "arrive" | ...


class RouteResponse(BaseModel):
    distance_meters: float
    duration_seconds: float
    # GeoJSON LineString — passes through as-is to the frontend
    geometry: Dict[str, Any]
    steps: List[RouteStep]
