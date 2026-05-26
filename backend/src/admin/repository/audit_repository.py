"""Audit log repository — read access with filtering."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.admin.domain.models import AuditLogModel


class AuditLogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entry: AuditLogModel) -> None:
        self._session.add(entry)

    async def list_logs(
        self,
        *,
        user_id: str | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AuditLogModel], int]:
        """Return (logs, total_count) with optional filters."""
        stmt = select(AuditLogModel)
        count_stmt = select(func.count(AuditLogModel.id))

        if user_id:
            stmt = stmt.where(AuditLogModel.user_id == user_id)
            count_stmt = count_stmt.where(AuditLogModel.user_id == user_id)
        if action:
            stmt = stmt.where(AuditLogModel.action == action)
            count_stmt = count_stmt.where(AuditLogModel.action == action)
        if resource_type:
            stmt = stmt.where(AuditLogModel.resource_type == resource_type)
            count_stmt = count_stmt.where(AuditLogModel.resource_type == resource_type)
        if since:
            stmt = stmt.where(AuditLogModel.created_at >= since)
            count_stmt = count_stmt.where(AuditLogModel.created_at >= since)
        if until:
            stmt = stmt.where(AuditLogModel.created_at <= until)
            count_stmt = count_stmt.where(AuditLogModel.created_at <= until)

        stmt = stmt.order_by(AuditLogModel.created_at.desc()).limit(limit).offset(offset)

        result = await self._session.execute(stmt)
        logs = list(result.scalars().all())

        count_result = await self._session.execute(count_stmt)
        total = count_result.scalar_one()

        return logs, total
