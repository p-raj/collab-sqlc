"""Run history service — records query executions (fire-and-forget)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from src.auth.service.user_lookup_service import UserLookupService, create_user_lookup_service
from src.history.domain.models import RunHistoryModel
from src.history.domain.schemas import RunHistoryListResponse, RunHistoryResponse
from src.history.repository.history_repository import RunHistoryRepository
from src.shared.domain.base import new_id
from src.shared.domain.types import UserRole

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from src.auth.domain.schemas import CurrentUser


class HistoryService:
    def __init__(
        self,
        repo: RunHistoryRepository,
        user_lookup_service: UserLookupService,
    ) -> None:
        self._repo = repo
        self._user_lookup = user_lookup_service

    async def record_run(
        self,
        user_id: str,
        connection_id: str,
        sql: str,
        status: str,
        row_count: int | None = None,
        execution_time_ms: float | None = None,
        error_message: str | None = None,
    ) -> None:
        """Write a run history entry. Fire-and-forget — never raises."""
        try:
            entry = RunHistoryModel(
                id=new_id(),
                user_id=user_id,
                connection_id=connection_id,
                sql=sql,
                status=status,
                row_count=row_count,
                execution_time_ms=execution_time_ms,
                error_message=error_message,
            )
            await self._repo.create(entry)
        except Exception:
            logger.exception("Failed to write run history")

    async def list_runs(
        self,
        viewer: CurrentUser,
        *,
        connection_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> RunHistoryListResponse:
        history_user_id = None if viewer.role == UserRole.ADMIN else viewer.id
        entries, total = await self._repo.list_for_user(
            history_user_id,
            connection_id=connection_id,
            limit=limit,
            offset=offset,
        )
        user_labels = await self._user_lookup.get_user_labels(
            {entry.user_id for entry in entries}
        )
        return RunHistoryListResponse(
            items=[_to_response(entry, user_labels) for entry in entries],
            total=total,
            has_more=(offset + limit) < total,
        )

    async def clear_user_history(self, user_id: str) -> None:
        await self._repo.delete_all_for_user(user_id)


async def record_run(
    session: AsyncSession,
    user_id: str,
    connection_id: str,
    sql: str,
    status: str,
    row_count: int | None = None,
    execution_time_ms: float | None = None,
    error_message: str | None = None,
) -> None:
    service = HistoryService(
        RunHistoryRepository(session),
        create_user_lookup_service(session),
    )
    await service.record_run(
        user_id,
        connection_id,
        sql,
        status,
        row_count,
        execution_time_ms,
        error_message,
    )


async def list_runs(
    session: AsyncSession,
    user_id: str | None,
    *,
    connection_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[RunHistoryModel], int]:
    repo = RunHistoryRepository(session)
    entries, total = await repo.list_for_user(
        user_id, connection_id=connection_id, limit=limit, offset=offset
    )
    return entries, total


def _to_response(
    entry: RunHistoryModel,
    user_labels: dict[str, tuple[str | None, str | None]],
) -> RunHistoryResponse:
    display_name, email = user_labels.get(entry.user_id, (None, None))
    return RunHistoryResponse(
        id=entry.id,
        user_id=entry.user_id,
        user_display_name=display_name,
        user_email=email,
        connection_id=entry.connection_id,
        sql=entry.sql,
        status=entry.status,
        row_count=entry.row_count,
        execution_time_ms=entry.execution_time_ms,
        error_message=entry.error_message,
        created_at=entry.created_at,
    )
