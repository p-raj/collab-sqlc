"""Admin API routes — audit logs and app settings."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.admin.api.dependencies import get_audit_service, get_settings_service
from src.admin.domain.schemas import (
    AuditLogListResponse,
    SSOSettingsResponse,
    UpdateSSOSettingsRequest,
)
from src.admin.service.audit_service import AuditService
from src.admin.service.settings_service import SettingsService
from src.auth.api.dependencies import require_admin
from src.auth.domain.schemas import CurrentUser

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    _user: Annotated[CurrentUser, Depends(require_admin)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    user_id: Annotated[str | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    resource_type: Annotated[str | None, Query()] = None,
    since: Annotated[datetime | None, Query()] = None,
    until: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditLogListResponse:
    return await service.list_logs(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )


@router.get("/settings/sso", response_model=SSOSettingsResponse)
async def get_sso_settings(
    _admin: Annotated[CurrentUser, Depends(require_admin)],
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> SSOSettingsResponse:
    return await service.get_sso_config()


@router.put("/settings/sso", response_model=SSOSettingsResponse)
async def update_sso_settings(
    body: UpdateSSOSettingsRequest,
    _admin: Annotated[CurrentUser, Depends(require_admin)],
    service: Annotated[SettingsService, Depends(get_settings_service)],
) -> SSOSettingsResponse:
    return await service.update_sso_config(
        sso_enabled=body.sso_enabled,
        sso_only_mode=body.sso_only_mode,
    )
