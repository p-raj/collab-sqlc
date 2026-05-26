"""Assistant API routes — Eylo SDK configuration."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.assistant.domain.schemas import AssistantConfigResponse
from src.auth.api.dependencies import get_current_user
from src.shared.config import AppSettings, get_settings

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/config", response_model=AssistantConfigResponse)
async def get_assistant_config(
    _user: Annotated[object, Depends(get_current_user)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> AssistantConfigResponse:
    """Return Eylo SDK configuration for the frontend."""
    return AssistantConfigResponse(
        eylo_org_id=settings.assistant.eylo_org_id,
        eylo_agent_id=settings.assistant.eylo_agent_id,
        enabled=bool(settings.assistant.eylo_org_id and settings.assistant.eylo_agent_id),
    )
