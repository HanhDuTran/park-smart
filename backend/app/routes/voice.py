"""Voice assistant endpoint — Claude-powered, scoped to parking tasks."""

import logging

from fastapi import APIRouter, HTTPException

from app.models.voice import VoiceRequest, VoiceResponse
from app.services.claude_agent import VoiceAgentError, run_agent_turn

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/voice", response_model=VoiceResponse)
async def voice(request: VoiceRequest) -> VoiceResponse:
    try:
        result = await run_agent_turn(
            request.message,
            request.conversation_history,
            request.lat,
            request.lng,
            mode=request.mode,
        )
    except VoiceAgentError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        logger.exception("Voice agent turn failed")
        raise HTTPException(502, "Voice assistant is temporarily unavailable.") from exc

    return VoiceResponse(reply_text=result["reply_text"], action=result.get("action"))
