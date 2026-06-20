"""Routes for fetching and updating parking data."""

from fastapi import APIRouter, Body, Query

from app.models.parking import ParkingResponse
from app.services import parking_service, sf_parking_db, status_store

router = APIRouter()


@router.get("/parking", response_model=ParkingResponse)
async def get_parking(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(1000, ge=50, le=5000),
) -> ParkingResponse:
    """Return nearby parking spots merged from OSM and Google Places,
    with live crowdsourced status injected for street spots."""

    spots, street_data_unavailable = await parking_service.fetch_combined_spots(lat, lng, radius)
    return ParkingResponse(
        spots=spots, count=len(spots), street_data_unavailable=street_data_unavailable
    )


@router.get("/parking/db-status")
async def db_status() -> dict:
    """Whether the real SFMTA parking-regulations DB has finished its
    one-time download from DataSF, and how many records it holds."""
    if not sf_parking_db.is_db_populated():
        return {"status": "not_ready"}
    conn = sf_parking_db.get_db()
    try:
        regulations = conn.execute("SELECT COUNT(*) FROM parking_regulations").fetchone()[0]
        sweeping = conn.execute("SELECT COUNT(*) FROM street_sweeping").fetchone()[0]
    finally:
        conn.close()
    return {
        "status": "ready",
        "parking_regulations": regulations,
        "street_sweeping": sweeping,
        "db_path": str(sf_parking_db.DB_PATH),
    }


# ---------------------------------------------------------------------------
# Crowdsourced status endpoints
# ---------------------------------------------------------------------------


@router.post("/parking/{spot_id}/prompt-park")
async def prompt_park(spot_id: str) -> dict:
    """Signal that a user may be parking at this spot.
    Starts a 60-second pending window; auto-confirms 'taken' on expiry."""
    status_store.set_pending(spot_id)
    return {"status": "pending", "spot_id": spot_id}


@router.post("/parking/{spot_id}/confirm-park")
async def confirm_park(
    spot_id: str,
    parked: bool = Body(..., embed=True),
) -> dict:
    """Confirm or deny the pending park.
    parked=true → mark 'taken'. parked=false → cancel pending."""
    if parked:
        status_store.confirm_parked(spot_id)
    else:
        status_store.cancel_pending(spot_id)
    result = status_store.get_status(spot_id)
    return {"status": result or "cleared", "spot_id": spot_id}


@router.post("/parking/{spot_id}/confirm-leave")
async def confirm_leave(
    spot_id: str,
    left: bool = Body(..., embed=True),
) -> dict:
    """Report that a user left a spot.
    left=true → mark 'available'. left=false → no change."""
    if left:
        status_store.confirm_left(spot_id)
    result = status_store.get_status(spot_id)
    return {"status": result or "unchanged", "spot_id": spot_id}
