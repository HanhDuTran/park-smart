"""In-memory crowdsourced street-parking status store.

Lifecycle per spot:
  (no entry) → set_pending() → "pending" → auto/confirm → "taken"
                                         → cancel_pending() → (no entry)
  "taken" → confirm_left() → "available"
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict, Literal, Optional

LiveStatus = Literal["available", "taken", "pending"]

_AUTO_CONFIRM_DELAY_S = 60.0


class _SpotRecord:
    __slots__ = ("status", "reported_at", "task")

    def __init__(self, status: LiveStatus) -> None:
        self.status: LiveStatus = status
        self.reported_at: datetime = datetime.now(timezone.utc)
        self.task: Optional[asyncio.Task] = None  # type: ignore[type-arg]


_store: Dict[str, _SpotRecord] = {}


def _cancel(record: Optional[_SpotRecord]) -> None:
    if record and record.task and not record.task.done():
        record.task.cancel()


async def _auto_confirm(spot_id: str) -> None:
    await asyncio.sleep(_AUTO_CONFIRM_DELAY_S)
    record = _store.get(spot_id)
    if record and record.status == "pending":
        record.status = "taken"
        record.reported_at = datetime.now(timezone.utc)
        record.task = None


def get_status(spot_id: str) -> Optional[LiveStatus]:
    r = _store.get(spot_id)
    return r.status if r else None


def set_pending(spot_id: str) -> None:
    """Mark a spot as pending confirmation; auto-confirms 'taken' after 60 s."""
    _cancel(_store.get(spot_id))
    r = _SpotRecord("pending")
    r.task = asyncio.create_task(_auto_confirm(spot_id))
    _store[spot_id] = r


def confirm_parked(spot_id: str) -> None:
    """Immediately mark the spot as taken."""
    _cancel(_store.get(spot_id))
    _store[spot_id] = _SpotRecord("taken")


def confirm_left(spot_id: str) -> None:
    """Mark the spot as available again."""
    _cancel(_store.get(spot_id))
    _store[spot_id] = _SpotRecord("available")


def cancel_pending(spot_id: str) -> None:
    """User denied parking — clear pending state entirely."""
    _cancel(_store.get(spot_id))
    _store.pop(spot_id, None)
