"""Run history API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.auth.api.dependencies import get_current_user
from src.auth.domain.schemas import CurrentUser
from src.history.api.dependencies import get_history_service
from src.history.domain.schemas import RunHistoryListResponse
from src.history.service.history_service import HistoryService

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=RunHistoryListResponse)
async def list_history(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[HistoryService, Depends(get_history_service)],
    connection_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RunHistoryListResponse:
    return await service.list_runs(
        user,
        connection_id=connection_id,
        limit=limit,
        offset=offset,
    )


@router.delete("", response_model=None, status_code=204)
async def clear_history(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[HistoryService, Depends(get_history_service)],
) -> None:
    await service.clear_user_history(user.id)
