"""Query-as-API domain models — extends SavedQuery with API execution log tables."""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.domain.base import new_id, utc_now
from src.shared.domain.base_model import Base


class APIExecutionLog(Base):
    """Append-only log of every API execution. Never updated."""

    __tablename__ = "api_execution_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    query_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("saved_queries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connection_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("connections.id", ondelete="CASCADE"),
        nullable=False,
    )
    caller_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    execution_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data_log_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("api_execution_data.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )


class APIExecutionData(Base):
    """Prunable response data — deleted after retention period."""

    __tablename__ = "api_execution_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    params_sent: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    response_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
