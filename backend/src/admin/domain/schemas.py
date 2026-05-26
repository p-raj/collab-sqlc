"""Audit log domain schemas — API boundary types."""

from datetime import datetime

from src.shared.domain.schemas import ApiSchema


class AuditLogResponse(ApiSchema):
    id: str
    user_id: str
    user_email: str
    action: str
    resource_type: str
    resource_id: str | None
    details: str | None
    ip_address: str | None
    created_at: datetime


class AuditLogListResponse(ApiSchema):
    items: list[AuditLogResponse]
    total: int
    has_more: bool


class SSOSettingsResponse(ApiSchema):
    sso_enabled: bool
    sso_only_mode: bool


class UpdateSSOSettingsRequest(ApiSchema):
    sso_enabled: bool | None = None
    sso_only_mode: bool | None = None
