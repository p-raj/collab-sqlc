"""Assistant domain schemas — Eylo SDK configuration."""

from __future__ import annotations

from src.shared.domain.schemas import ApiSchema


class AssistantConfigResponse(ApiSchema):
    eylo_org_id: str
    eylo_agent_id: str
    enabled: bool
