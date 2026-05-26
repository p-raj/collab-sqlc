"""Saved queries domain models — stored in app database."""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.shared.domain.base import new_id, utc_now
from src.shared.domain.base_model import Base


class QueryFolder(Base):
    __tablename__ = "query_folders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("query_folders.id", ondelete="CASCADE"), nullable=True
    )
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    queries: Mapped[list["SavedQuery"]] = relationship(
        back_populates="folder", cascade="save-update, merge", lazy="selectin"
    )


class SavedQuery(Base):
    __tablename__ = "saved_queries"
    __table_args__ = (
        Index(
            "ix_saved_queries_api_enabled",
            "api_enabled",
            postgresql_where=text("api_enabled = true"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    sql: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    connection_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("connections.id", ondelete="SET NULL"), nullable=True
    )
    folder_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("query_folders.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Query-as-API fields
    api_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    api_key_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    api_key_prefix: Mapped[str | None] = mapped_column(String(16), nullable=True)
    api_parameters: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    api_row_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    api_timeout_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    api_rate_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    api_allowed_ips: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    api_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_published_sql: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    folder: Mapped[QueryFolder | None] = relationship(back_populates="queries", lazy="selectin")


class SavedQueryVersion(Base):
    __tablename__ = "saved_query_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    query_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saved_queries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    sql: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    edited_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SavedQueryFavorite(Base):
    __tablename__ = "saved_query_favorites"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    query_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saved_queries.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
