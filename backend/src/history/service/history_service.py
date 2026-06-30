"""Run history service — query run lifecycle and history listing."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from loguru import logger

from src.auth.service.user_lookup_service import UserLookupService, create_user_lookup_service
from src.history.domain.models import RunHistoryModel, RunResultModel
from src.history.domain.schemas import (
    RunHistoryListResponse,
    RunHistoryResponse,
    RunResultResponse,
    RunSource,
    RunStatus,
)
from src.history.repository.history_repository import RunHistoryRepository
from src.shared.domain.base import new_id, utc_now
from src.shared.domain.errors import ForbiddenError, NotFoundError
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
        """Compatibility helper for older synchronous execution paths."""
        try:
            await self.create_run(
                user_id=user_id,
                connection_id=connection_id,
                sql=sql,
                source=RunSource.EDITOR,
                status=status,
                row_count=row_count,
                execution_time_ms=execution_time_ms,
                error_message=error_message,
            )
        except Exception:
            logger.exception("Failed to write run history")

    async def create_run(
        self,
        *,
        user_id: str,
        connection_id: str,
        sql: str,
        source: str = RunSource.EDITOR,
        status: str = RunStatus.QUEUED,
        params: dict[str, Any] | None = None,
        write_mode: bool = False,
        user_role: str = UserRole.VIEWER,
        timeout_seconds: int | None = None,
        max_rows: int | None = None,
        api_query_id: str | None = None,
        caller_ip: str | None = None,
        row_count: int | None = None,
        execution_time_ms: float | None = None,
        error_message: str | None = None,
    ) -> RunHistoryModel:
        entry = RunHistoryModel(
            id=new_id(),
            user_id=user_id,
            connection_id=connection_id,
            sql=sql,
            status=status,
            source=source,
            params=params,
            write_mode=write_mode,
            user_role=user_role,
            timeout_seconds=timeout_seconds,
            max_rows=max_rows,
            api_query_id=api_query_id,
            caller_ip=caller_ip,
            row_count=row_count,
            execution_time_ms=execution_time_ms,
            error_message=error_message,
        )
        if status == RunStatus.RUNNING:
            entry.started_at = utc_now()
        if status in {RunStatus.SUCCESS, RunStatus.ERROR, RunStatus.CANCELLED, RunStatus.TIMEOUT}:
            entry.finished_at = utc_now()
        return await self._repo.create(entry)

    async def get_run(self, run_id: str) -> RunHistoryModel:
        entry = await self._repo.get(run_id)
        if entry is None:
            raise NotFoundError("Run", run_id)
        return entry

    async def get_run_for_user(self, run_id: str, viewer: CurrentUser) -> RunHistoryResponse:
        entry = await self._get_visible_run(run_id, viewer)
        labels = await self._user_lookup.get_user_labels({entry.user_id})
        return _to_response(entry, labels)

    async def get_result_for_user(self, run_id: str, viewer: CurrentUser) -> RunResultResponse:
        entry = await self._get_visible_run(run_id, viewer)
        result = await self._repo.get_result(entry.id)
        if result is None:
            raise NotFoundError("Run result", run_id)
        return RunResultResponse(
            columns=result.columns,
            column_types=result.column_types,
            rows=result.rows,
            row_count=result.row_count,
            execution_time_ms=entry.execution_time_ms or 0,
            truncated=result.truncated,
        )

    async def request_cancel_for_user(self, run_id: str, viewer: CurrentUser) -> RunHistoryModel:
        entry = await self._get_visible_run(run_id, viewer)
        await self._repo.request_cancellation(entry)
        return entry

    async def mark_running(self, entry: RunHistoryModel) -> RunHistoryModel:
        return await self._repo.update_status(entry, RunStatus.RUNNING)

    async def store_backend_pid(self, entry: RunHistoryModel, backend_pid: int | None) -> None:
        await self._repo.store_backend_pid(entry, backend_pid)

    async def store_backend_query_id(
        self,
        entry: RunHistoryModel,
        backend_query_id: str | None,
    ) -> None:
        await self._repo.store_backend_query_id(entry, backend_query_id)

    async def mark_success(
        self,
        entry: RunHistoryModel,
        *,
        columns: list[str],
        column_types: list[str],
        rows: list[list[Any]],
        row_count: int,
        execution_time_ms: float,
        truncated: bool,
    ) -> RunHistoryModel:
        await self._repo.save_result(
            RunResultModel(
                run_id=entry.id,
                columns=columns,
                column_types=column_types,
                rows=rows,
                row_count=row_count,
                truncated=truncated,
            )
        )
        return await self._repo.update_status(
            entry,
            RunStatus.SUCCESS,
            row_count=row_count,
            execution_time_ms=execution_time_ms,
        )

    async def mark_error(self, entry: RunHistoryModel, message: str) -> RunHistoryModel:
        return await self._repo.update_status(entry, RunStatus.ERROR, error_message=message)

    async def mark_cancelled(self, entry: RunHistoryModel, message: str) -> RunHistoryModel:
        return await self._repo.update_status(
            entry,
            RunStatus.CANCELLED,
            error_message=message,
        )

    async def mark_timeout(self, entry: RunHistoryModel, message: str) -> RunHistoryModel:
        return await self._repo.update_status(entry, RunStatus.TIMEOUT, error_message=message)

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

    async def _get_visible_run(self, run_id: str, viewer: CurrentUser) -> RunHistoryModel:
        entry = await self.get_run(run_id)
        if viewer.role != UserRole.ADMIN and entry.user_id != viewer.id:
            raise ForbiddenError("You can only access your own query runs.")
        return entry


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
        source=entry.source,
        backend_pid=entry.backend_pid,
        backend_query_id=entry.backend_query_id,
        timeout_seconds=entry.timeout_seconds,
        max_rows=entry.max_rows,
        api_query_id=entry.api_query_id,
        caller_ip=entry.caller_ip,
        row_count=entry.row_count,
        execution_time_ms=entry.execution_time_ms,
        error_message=entry.error_message,
        started_at=entry.started_at,
        finished_at=entry.finished_at,
        cancellation_requested_at=entry.cancellation_requested_at,
        created_at=entry.created_at,
    )
