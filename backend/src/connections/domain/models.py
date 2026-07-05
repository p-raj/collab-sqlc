"""Connection domain models — stored in app database."""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.domain.base import new_id, utc_now
from src.shared.domain.base_model import Base


class ConnectionModel(Base):
    __tablename__ = "connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    db_type: Mapped[str] = mapped_column(String(50), nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    database: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    config: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    credentials_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SSL
    ssl_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ssl_ca: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssl_cert: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssl_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SSH tunnel
    ssh_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ssh_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ssh_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ssh_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ssh_private_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Ownership & sharing
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)

    # Query protection
    max_concurrent_queries: Mapped[int] = mapped_column(Integer, default=5)
    query_timeout_seconds: Mapped[int] = mapped_column(Integer, default=300)
    safe_mode: Mapped[bool] = mapped_column(Boolean, default=True)

    # AI assistant context — parsed DBML schema as structured JSON
    dbml_context: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
