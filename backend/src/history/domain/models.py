"""Run history domain models."""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.domain.base import new_id, utc_now
from src.shared.domain.base_model import Base


class RunHistoryModel(Base):
    __tablename__ = "run_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    connection_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    sql: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="editor", nullable=False, index=True)
    operation_language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    result_shape: Mapped[str] = mapped_column(String(50), default="tabular", nullable=False)
    params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    write_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_role: Mapped[str] = mapped_column(String(20), default="viewer", nullable=False)
    backend_pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    backend_query_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    timeout_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    api_query_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    caller_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )


class RunResultModel(Base):
    __tablename__ = "run_results"

    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("run_history.id", ondelete="CASCADE"),
        primary_key=True,
    )
    columns: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    column_types: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    rows: Mapped[list[list[Any]]] = mapped_column(JSONB, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    result_shape: Mapped[str] = mapped_column(String(50), default="tabular", nullable=False)
    data: Mapped[dict[str, Any] | list[Any] | str | int | float | bool | None] = mapped_column(
        JSONB, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
