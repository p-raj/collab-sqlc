"""Connection API dependency factories."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.admin.service.audit_service import create_audit_service
from src.connections.repository.connection_repository import ConnectionRepository
from src.connections.service.connection_service import ConnectionService
from src.connections.service.encryption import CredentialEncryption
from src.shared.config import AppSettings, get_settings
from src.shared.database import get_session


def get_connection_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> ConnectionService:
    return ConnectionService(
        repo=ConnectionRepository(session),
        encryption=CredentialEncryption(settings),
        audit_service=create_audit_service(session),
    )
