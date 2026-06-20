"""Pydantic models for the voice assistant endpoint."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class VoiceRequest(BaseModel):
    message: str
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)
    lat: float
    lng: float
    # Which app mode the driver is currently in — changes what the assistant
    # suggests (e.g. walking/transit instead of parking) without a separate
    # endpoint or tool set.
    mode: Literal["driving", "parked", "walking"] = "driving"


class VoiceResponse(BaseModel):
    reply_text: str
    action: Optional[Dict[str, Any]] = None
