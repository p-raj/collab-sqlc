"""Admin API dependency factories."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.admin.service.audit_service import AuditService, create_audit_service
from src.admin.service.settings_service import SettingsService, create_settings_service
from src.shared.config import AppSettings, get_settings
from src.shared.database import get_session


def get_audit_service(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AuditService:
    return create_audit_service(session)


def get_settings_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> SettingsService:
    return create_settings_service(session, settings)
