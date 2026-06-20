"""Pydantic models for the unified parking spot representation."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ParkingRules(BaseModel):
    """Human-readable parking rules/restrictions for a spot."""

    max_stay: Optional[str] = Field(default=None)
    fee: Optional[str] = Field(default=None)
    restriction: Optional[str] = Field(default=None)
    street_cleaning: Optional[str] = Field(default=None)
    hours: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)


class LotInfo(BaseModel):
    """Rich display fields for parking lots — fee and operating hours."""

    fee_display: str   # e.g. "Free", "$3/hr", "Paid", "Fee unknown"
    hours_display: str  # e.g. "Mon-Fri 06:00-22:00", "24/7", "Hours unknown"


class ParkingTimeRule(BaseModel):
    """A single real posted rule for a street spot, sourced from the official
    SFMTA parking regulations / street sweeping datasets (see sf_parking_db.py)."""

    rule_type: Literal[
        "time_limit", "no_parking", "permit", "paid", "paid_permit",
        "oversized_vehicle", "street_cleaning", "other",
    ]
    days: str
    hours: str
    max_stay_minutes: Optional[int] = None
    description: str
    cleaning_day: Optional[str] = None
    is_active_now: bool = False


class ParkingSpot(BaseModel):
    """A single parking location, normalized from any data source."""

    id: str
    name: str
    type: Literal["street", "lot"]
    lat: float
    lng: float
    address: Optional[str] = None
    rules: ParkingRules = Field(default_factory=ParkingRules)
    capacity: Optional[int] = None
    fee: Optional[bool] = None
    source: Literal["overpass", "google_places", "estimated"]

    # Crowdsourced live status (street spots only; null = unreported)
    live_status: Optional[Literal["available", "taken", "pending"]] = None

    # Rich display info for parking lots
    lot_info: Optional[LotInfo] = None

    # True when spot position is estimated from road geometry (no explicit OSM parking tag)
    estimated: bool = False

    # Real posted rules from the official SFMTA datasets (street spots in SF only)
    time_rules: List[ParkingTimeRule] = Field(default_factory=list)


class ParkingResponse(BaseModel):
    """Response envelope for the /api/parking endpoint."""

    spots: List[ParkingSpot]
    count: int
    # True when the Overpass (street parking) source failed this request —
    # distinct from a legitimate zero-result area — so the frontend can show
    # a "street data unavailable" notice instead of treating it as silence.
    street_data_unavailable: bool = False
