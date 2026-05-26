"""Saved query API dependency factories."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.admin.service.audit_service import create_audit_service
from src.queries.repository.query_repository import (
    FavoriteRepository,
    FolderRepository,
    SavedQueryRepository,
    VersionRepository,
)
from src.queries.service.query_service import SavedQueryService
from src.shared.database import get_session


def get_saved_query_service(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SavedQueryService:
    return SavedQueryService(
        folder_repo=FolderRepository(session),
        query_repo=SavedQueryRepository(session),
        version_repo=VersionRepository(session),
        favorite_repo=FavoriteRepository(session),
        audit_service=create_audit_service(session),
    )
