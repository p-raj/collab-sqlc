"""Run history domain models."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
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
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
