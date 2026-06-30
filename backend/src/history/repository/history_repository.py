"""Run history repository — persistence layer."""

from collections.abc import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.history.domain.models import RunHistoryModel, RunResultModel
from src.shared.domain.base import utc_now


class RunHistoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entry: RunHistoryModel) -> RunHistoryModel:
        self._session.add(entry)
        await self._session.flush()
        return entry

    async def get(self, run_id: str) -> RunHistoryModel | None:
        return await self._session.get(RunHistoryModel, run_id)

    async def get_result(self, run_id: str) -> RunResultModel | None:
        return await self._session.get(RunResultModel, run_id)

    async def list_for_user(
        self,
        user_id: str | None,
        *,
        connection_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[RunHistoryModel], int]:
        """Return (entries, total_count) with optional user and connection filters."""
        stmt = select(RunHistoryModel)
        count_stmt = select(func.count(RunHistoryModel.id))

        if user_id:
            stmt = stmt.where(RunHistoryModel.user_id == user_id)
            count_stmt = count_stmt.where(RunHistoryModel.user_id == user_id)

        if connection_id:
            stmt = stmt.where(RunHistoryModel.connection_id == connection_id)
            count_stmt = count_stmt.where(RunHistoryModel.connection_id == connection_id)

        stmt = stmt.order_by(RunHistoryModel.created_at.desc()).limit(limit).offset(offset)

        result = await self._session.execute(stmt)
        entries = list(result.scalars().all())

        count_result = await self._session.execute(count_stmt)
        total = count_result.scalar_one()

        return entries, total

    async def update_status(
        self,
        entry: RunHistoryModel,
        status: str,
        *,
        error_message: str | None = None,
        row_count: int | None = None,
        execution_time_ms: float | None = None,
    ) -> RunHistoryModel:
        entry.status = status
        entry.error_message = error_message
        if row_count is not None:
            entry.row_count = row_count
        if execution_time_ms is not None:
            entry.execution_time_ms = execution_time_ms
        if status == "running":
            entry.started_at = utc_now()
        if status in {"success", "error", "cancelled", "timeout"}:
            entry.finished_at = utc_now()
        await self._session.flush()
        return entry

    async def store_backend_pid(self, entry: RunHistoryModel, backend_pid: int | None) -> None:
        entry.backend_pid = backend_pid
        await self._session.flush()

    async def store_backend_query_id(
        self,
        entry: RunHistoryModel,
        backend_query_id: str | None,
    ) -> None:
        entry.backend_query_id = backend_query_id
        await self._session.flush()

    async def request_cancellation(self, entry: RunHistoryModel) -> None:
        entry.cancellation_requested_at = utc_now()
        await self._session.flush()

    async def save_result(self, result: RunResultModel) -> RunResultModel:
        await self._session.merge(result)
        await self._session.flush()
        return result

    async def count_active_for_connection(
        self,
        connection_id: str,
        *,
        statuses: Sequence[str] = ("running",),
    ) -> int:
        stmt = (
            select(func.count(RunHistoryModel.id))
            .where(RunHistoryModel.connection_id == connection_id)
            .where(RunHistoryModel.status.in_(list(statuses)))
        )
        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def delete_all_for_user(self, user_id: str) -> None:
        stmt = delete(RunHistoryModel).where(RunHistoryModel.user_id == user_id)
        await self._session.execute(stmt)
        await self._session.flush()
