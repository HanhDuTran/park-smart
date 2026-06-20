"""Route endpoint — calls Mapbox Directions API and returns a clean route model."""

import os
from typing import List, Literal

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.models.route import RouteResponse, RouteStep

router = APIRouter()

_DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox"


@router.get("/route", response_model=RouteResponse)
async def get_route(
    start_lat: float = Query(..., ge=-90, le=90),
    start_lng: float = Query(..., ge=-180, le=180),
    end_lat: float = Query(..., ge=-90, le=90),
    end_lng: float = Query(..., ge=-180, le=180),
    profile: Literal["driving", "walking"] = Query("driving"),
) -> RouteResponse:
    """Fetch a route from Mapbox Directions and return a simplified model
    with geometry (GeoJSON LineString), total distance/duration, and step-by-step
    instructions. `profile` switches between driving and walking directions
    (used by Walking mode)."""

    token = os.getenv("VITE_MAPBOX_TOKEN") or os.getenv("MAPBOX_TOKEN")
    if not token:
        raise HTTPException(503, "Mapbox token not configured")

    coords = f"{start_lng},{start_lat};{end_lng},{end_lat}"
    url = f"{_DIRECTIONS_BASE}/{profile}/{coords}"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                url,
                params={
                    "geometries": "geojson",
                    "steps": "true",
                    "overview": "full",
                    "access_token": token,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Mapbox Directions request failed: {exc}") from exc

    if data.get("code") != "Ok" or not data.get("routes"):
        message = data.get("message", "No route found between these points")
        raise HTTPException(404, message)

    route = data["routes"][0]

    steps: List[RouteStep] = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            maneuver = step.get("maneuver", {})
            instruction = maneuver.get("instruction", "Continue")
            steps.append(
                RouteStep(
                    instruction=instruction,
                    distance_meters=step.get("distance", 0),
                    duration_seconds=step.get("duration", 0),
                    maneuver_type=maneuver.get("type", "turn"),
                )
            )

    return RouteResponse(
        distance_meters=route["distance"],
        duration_seconds=route["duration"],
        geometry=route["geometry"],
        steps=steps,
    )
