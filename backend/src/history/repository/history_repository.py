"""Run history repository — persistence layer."""

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.history.domain.models import RunHistoryModel


class RunHistoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entry: RunHistoryModel) -> RunHistoryModel:
        self._session.add(entry)
        await self._session.flush()
        return entry

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

    async def delete_all_for_user(self, user_id: str) -> None:
        stmt = delete(RunHistoryModel).where(RunHistoryModel.user_id == user_id)
        await self._session.execute(stmt)
        await self._session.flush()
