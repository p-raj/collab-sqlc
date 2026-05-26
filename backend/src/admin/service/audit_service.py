"""Audit log service — append-only logging of all significant actions."""

from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from src.admin.domain.models import AuditLogModel
from src.admin.domain.schemas import AuditLogListResponse, AuditLogResponse
from src.shared.domain.base import new_id

if TYPE_CHECKING:
    from datetime import datetime

    from sqlalchemy.ext.asyncio import AsyncSession

    from src.admin.repository.audit_repository import AuditLogRepository


class AuditService:
    def __init__(self, repo: AuditLogRepository) -> None:
        self._repo = repo

    async def log_action(
        self,
        *,
        user_id: str,
        user_email: str,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        details: str | None = None,
        ip_address: str | None = None,
    ) -> None:
        try:
            await self._repo.create(
                AuditLogModel(
                    id=new_id(),
                    user_id=user_id,
                    user_email=user_email,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    details=details,
                    ip_address=ip_address,
                )
            )
        except Exception:
            logger.exception("Failed to write audit log")

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
    ) -> AuditLogListResponse:
        logs, total = await self._repo.list_logs(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            since=since,
            until=until,
            limit=limit,
            offset=offset,
        )
        return AuditLogListResponse(
            items=[_to_response(log) for log in logs],
            total=total,
            has_more=(offset + limit) < total,
        )


def create_audit_service(session: AsyncSession) -> AuditService:
    from src.admin.repository.audit_repository import AuditLogRepository

    return AuditService(AuditLogRepository(session))


async def log_action(
    session: AsyncSession,
    user_id: str,
    user_email: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: str | None = None,
    ip_address: str | None = None,
) -> None:
    """Write an audit log entry. Fire-and-forget — never raises.

    Uses a savepoint (nested transaction) so a failure here cannot
    corrupt the parent session or roll back the calling business operation.
    """
    try:
        async with session.begin_nested():
            entry = AuditLogModel(
                id=new_id(),
                user_id=user_id,
                user_email=user_email,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details=details,
                ip_address=ip_address,
            )
            session.add(entry)
    except Exception:
        logger.exception("Failed to write audit log")


def _to_response(log: AuditLogModel) -> AuditLogResponse:
    return AuditLogResponse(
        id=log.id,
        user_id=log.user_id,
        user_email=log.user_email,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        details=log.details,
        ip_address=log.ip_address,
        created_at=log.created_at,
    )
