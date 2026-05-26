"""History API dependency factories."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.service.user_lookup_service import create_user_lookup_service
from src.history.repository.history_repository import RunHistoryRepository
from src.history.service.history_service import HistoryService
from src.shared.database import get_session


def get_history_service(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> HistoryService:
    return HistoryService(
        RunHistoryRepository(session),
        create_user_lookup_service(session),
    )
