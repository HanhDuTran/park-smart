"""Claude-powered voice assistant for ParkSmart.

Runs one tool-use turn at a time: sends the driver's message (+ running
history) to Claude with tools that map onto the app's real parking/route/
status logic, executes whatever Claude calls, feeds the results back, and
returns Claude's final spoken reply plus a structured UI action.
"""

import json
import logging
import math
import os
from typing import Any, Dict, List, Optional, Tuple

import anthropic
from fastapi import HTTPException

from app.models.parking import ParkingSpot
from app.routes.route import get_route
from app.services import parking_service, spot_cache, status_store

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"
MAX_TOOL_ITERATIONS = 4
DEFAULT_RADIUS_M = 800
MAX_RESULTS = 5

_client: Optional[anthropic.AsyncAnthropic] = None


class VoiceAgentError(Exception):
    """Raised when the agent turn can't be run at all (bad/missing key, API down)."""


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise VoiceAgentError(
                "ANTHROPIC_API_KEY is not configured — voice assistant is disabled."
            )
        _client = anthropic.AsyncAnthropic(api_key=api_key)
    return _client


# ---------------------------------------------------------------------------
# Tool definitions (Claude tool-use format)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "find_parking_spots",
        "description": (
            "Search for parking spots (street spots or lots) near a given "
            "latitude/longitude. Use the driver's current GPS location for "
            "\"near me\" / \"nearby\" / \"around here\" requests. For a named "
            "place (a landmark, neighborhood, or address), use your own "
            "knowledge of that place's approximate coordinates as the search "
            "center instead. Returns only the closest few matches, not the "
            "full list."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "lat": {"type": "number", "description": "Latitude of the search center."},
                "lng": {"type": "number", "description": "Longitude of the search center."},
                "radius_m": {
                    "type": "integer",
                    "description": "Search radius in meters (default 800).",
                },
                "type": {
                    "type": "string",
                    "enum": ["street", "lot", "any"],
                    "description": "Restrict to street parking, lots, or any type.",
                },
            },
            "required": ["lat", "lng", "type"],
        },
    },
    {
        "name": "get_directions",
        "description": (
            "Get driving directions, ETA, and the first turn instruction from "
            "the driver's current location to a specific parking spot that was "
            "previously returned by find_parking_spots."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "spot_id": {
                    "type": "string",
                    "description": "The id of the parking spot, exactly as returned by find_parking_spots.",
                },
                "current_lat": {
                    "type": "number",
                    "description": "The driver's real current latitude (their GPS position, not a search center).",
                },
                "current_lng": {
                    "type": "number",
                    "description": "The driver's real current longitude.",
                },
            },
            "required": ["spot_id", "current_lat", "current_lng"],
        },
    },
    {
        "name": "check_spot_status",
        "description": (
            "Check the live, crowdsourced availability status (available / "
            "taken / pending) of a specific STREET parking spot. Not meaningful "
            "for lots."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "spot_id": {"type": "string", "description": "The id of the street parking spot."},
            },
            "required": ["spot_id"],
        },
    },
]


def _build_system_prompt(lat: float, lng: float, mode: str = "driving") -> str:
    if mode == "walking":
        return (
            "You are the voice assistant built into ParkSmart, a parking app. The "
            "user has switched to WALKING mode — they are on foot or taking "
            "public transit, not driving or looking for parking right now. "
            "In this mode, do NOT suggest parking spots or driving directions, "
            "and do not call find_parking_spots, get_directions, or "
            "check_spot_status even if asked — those are for drivers. Instead, "
            "use your own knowledge to suggest a walking route or transit "
            "option in plain language (e.g. \"That's about a 12 minute walk\" "
            "or \"Take the N-Judah two stops, then walk a block\"). If they ask "
            "about parking anyway, gently remind them they're in walking mode "
            "and ask if they'd like to switch back to driving.\n\n"
            f"Their current GPS location is latitude {lat}, longitude {lng}.\n\n"
            "If they ask about anything unrelated to walking, transit, or "
            "getting to a destination (weather, news, general chitchat, "
            "unrelated tasks), politely say you can only help with that and "
            "decline the rest — don't answer it.\n\n"
            "Keep replies very short: 1 to 3 plain sentences, since they're "
            "read aloud by text-to-speech. Never use markdown, bullet points, "
            "or numbered lists."
        )

    return (
        "You are the voice assistant built into ParkSmart, a parking app. You ONLY "
        "help with finding parking, checking live parking availability, getting "
        "directions to a parking spot, and short questions about parking near "
        "the driver. You have no other abilities.\n\n"
        f"The driver's current GPS location is latitude {lat}, longitude {lng}. "
        "Use this as the search center for \"near me\" / \"nearby\" / \"around "
        "here\" requests, and always pass these exact coordinates as "
        "current_lat/current_lng when calling get_directions. For a request "
        "naming a specific place, use your own knowledge of that place's "
        "coordinates as the search center instead.\n\n"
        "If the driver asks about anything unrelated to parking (weather, news, "
        "general chitchat, unrelated tasks), politely say you can only help "
        "with parking and decline the rest — don't answer it.\n\n"
        "Keep replies very short: 1 to 3 plain sentences, since they're read "
        "aloud by text-to-speech, possibly while the driver is driving. Never "
        "use markdown, bullet points, numbered lists, or long lists of options "
        "— summarize instead (e.g. \"the closest is X, about 200 feet away\" "
        "rather than listing five spots)."
    )


# ---------------------------------------------------------------------------
# Tool implementations — each returns (content_for_claude, ui_action_or_None)
# ---------------------------------------------------------------------------


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2.0 * R * math.asin(math.sqrt(min(1.0, a)))


def _fee_or_status_label(spot: ParkingSpot) -> str:
    if spot.type == "lot":
        return spot.lot_info.fee_display if spot.lot_info else "fee unknown"
    return spot.live_status or "status unknown"


async def _tool_find_parking_spots(
    args: Dict[str, Any]
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    lat = float(args["lat"])
    lng = float(args["lng"])
    radius_m = int(args.get("radius_m") or DEFAULT_RADIUS_M)
    type_filter = args.get("type", "any")

    spots, _street_data_unavailable = await parking_service.fetch_combined_spots(lat, lng, radius_m)
    if type_filter in ("street", "lot"):
        spots = [s for s in spots if s.type == type_filter]

    ranked = sorted(spots, key=lambda s: _haversine_m(lat, lng, s.lat, s.lng))[:MAX_RESULTS]

    summary = [
        {
            "id": s.id,
            "name": s.name,
            "type": s.type,
            "distance_m": round(_haversine_m(lat, lng, s.lat, s.lng)),
            "fee_or_status": _fee_or_status_label(s),
        }
        for s in ranked
    ]

    action = None
    if ranked:
        top = ranked[0]
        action = {"action": "select_spot", "spot_id": top.id, "lat": top.lat, "lng": top.lng}

    return {"spots": summary, "total_found": len(spots)}, action


async def _tool_get_directions(
    args: Dict[str, Any]
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    spot_id = args["spot_id"]
    current_lat = float(args["current_lat"])
    current_lng = float(args["current_lng"])

    resolved = spot_cache.resolve(spot_id)
    if resolved is None:
        # Cache miss (e.g. expired, or never seen this id) — try to relocate
        # the spot with a fresh nearby search before giving up.
        await parking_service.fetch_combined_spots(current_lat, current_lng, 1500)
        resolved = spot_cache.resolve(spot_id)

    if resolved is None:
        return (
            {
                "error": "That spot could not be located anymore — it may have "
                "expired. Ask the driver to search for parking again."
            },
            None,
        )

    lat, lng, name = resolved

    try:
        route = await get_route(
            start_lat=current_lat, start_lng=current_lng, end_lat=lat, end_lng=lng
        )
    except HTTPException as exc:
        return {"error": f"Could not get directions: {exc.detail}"}, None

    first_instruction = route.steps[0].instruction if route.steps else "Head toward the destination."
    content = {
        "spot_id": spot_id,
        "spot_name": name,
        "distance_meters": round(route.distance_meters),
        "duration_seconds": round(route.duration_seconds),
        "first_instruction": first_instruction,
    }
    action = {"action": "start_navigation", "spot_id": spot_id, "lat": lat, "lng": lng}
    return content, action


async def _tool_check_spot_status(
    args: Dict[str, Any]
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    spot_id = args["spot_id"]
    status = status_store.get_status(spot_id)
    return {"spot_id": spot_id, "status": status or "no reports yet"}, None


_DISPATCH = {
    "find_parking_spots": _tool_find_parking_spots,
    "get_directions": _tool_get_directions,
    "check_spot_status": _tool_check_spot_status,
}


async def _dispatch_tool(
    name: str, args: Dict[str, Any]
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    handler = _DISPATCH.get(name)
    if handler is None:
        return {"error": f"Unknown tool {name}"}, None
    try:
        return await handler(args)
    except Exception as exc:  # a single tool failing shouldn't crash the whole turn
        logger.exception("Voice assistant tool %s failed", name)
        return {"error": f"Something went wrong running {name}: {exc}"}, None


def _content_block_to_param(block: Any) -> Dict[str, Any]:
    if block.type == "text":
        return {"type": "text", "text": block.text}
    if block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    raise ValueError(f"Unsupported content block type: {block.type}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def run_agent_turn(
    user_message: str,
    conversation_history: List[Dict[str, Any]],
    lat: float,
    lng: float,
    mode: str = "driving",
) -> Dict[str, Any]:
    """Runs one turn of the parking voice assistant.

    Sends the message + history to Claude with tools, executes any tool calls
    against real backend logic, feeds results back, and returns
    {"reply_text": str, "action": dict}. `mode` ("driving" | "parked" |
    "walking") swaps in a different system prompt — walking mode suggests
    walking/transit instead of parking.
    """

    client = _get_client()
    messages: List[Dict[str, Any]] = list(conversation_history) + [
        {"role": "user", "content": user_message}
    ]
    system_prompt = _build_system_prompt(lat, lng, mode)
    action: Dict[str, Any] = {"action": "none"}

    for _ in range(MAX_TOOL_ITERATIONS):
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=400,
                system=system_prompt,
                tools=TOOLS,
                messages=messages,
            )
        except anthropic.AuthenticationError as exc:
            raise VoiceAgentError("Anthropic API key is invalid.") from exc
        except anthropic.APIError as exc:
            raise VoiceAgentError(f"Anthropic API error: {exc}") from exc

        if response.stop_reason != "tool_use":
            reply_text = "".join(
                block.text for block in response.content if block.type == "text"
            ).strip()
            return {"reply_text": reply_text or "Sorry, I didn't catch that.", "action": action}

        assistant_content = [_content_block_to_param(b) for b in response.content]
        messages.append({"role": "assistant", "content": assistant_content})

        tool_result_blocks = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            logger.info("Voice agent calling tool %s(%s)", block.name, block.input)
            result, maybe_action = await _dispatch_tool(block.name, block.input)
            logger.info("Voice agent tool %s result: %s", block.name, result)
            if maybe_action is not None:
                action = maybe_action
            tool_result_blocks.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}
            )
        messages.append({"role": "user", "content": tool_result_blocks})

    logger.warning("Voice agent turn exceeded %d tool iterations", MAX_TOOL_ITERATIONS)
    return {
        "reply_text": "Sorry, that's taking longer than expected — could you try again?",
        "action": {"action": "none"},
    }
