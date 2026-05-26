"""Saved queries domain schemas — API boundary types."""

from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import Field

from src.shared.domain.schemas import ApiSchema

if TYPE_CHECKING:
    from src.queries.domain.models import (
        QueryFolder,
        SavedQuery,
        SavedQueryFavorite,
        SavedQueryVersion,
    )

# ── Folders ──────────────────────────────────────────────────


class FolderCreateRequest(ApiSchema):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None
    is_shared: bool = False


class FolderUpdateRequest(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None
    is_shared: bool | None = None
    sort_order: int | None = None


class FolderResponse(ApiSchema):
    id: str
    name: str
    parent_id: str | None
    created_by: str
    is_shared: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, folder: "QueryFolder") -> "FolderResponse":
        return cls(
            id=folder.id,
            name=folder.name,
            parent_id=folder.parent_id,
            created_by=folder.created_by,
            is_shared=folder.is_shared,
            sort_order=folder.sort_order,
            created_at=folder.created_at,
            updated_at=folder.updated_at,
        )


# ── Saved Queries ────────────────────────────────────────────


class SavedQueryCreateRequest(ApiSchema):
    title: str = Field(min_length=1, max_length=255)
    sql: str = Field(min_length=1)
    description: str | None = None
    connection_id: str | None = None
    folder_id: str | None = None
    is_shared: bool = False


class SavedQueryUpdateRequest(ApiSchema):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    sql: str | None = Field(default=None, min_length=1)
    description: str | None = None
    connection_id: str | None = None
    folder_id: str | None = None
    is_shared: bool | None = None
    sort_order: int | None = None


class SavedQueryResponse(ApiSchema):
    id: str
    title: str
    sql: str
    description: str | None
    connection_id: str | None
    folder_id: str | None
    created_by: str
    updated_by: str | None = None
    is_shared: bool
    sort_order: int
    api_enabled: bool = False
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, query: "SavedQuery") -> "SavedQueryResponse":
        return cls(
            id=query.id,
            title=query.title,
            sql=query.sql,
            description=query.description,
            connection_id=query.connection_id,
            folder_id=query.folder_id,
            created_by=query.created_by,
            updated_by=query.updated_by,
            is_shared=query.is_shared,
            sort_order=query.sort_order,
            api_enabled=query.api_enabled,
            created_at=query.created_at,
            updated_at=query.updated_at,
        )


# ── Versions ─────────────────────────────────────────────────


class SavedQueryVersionResponse(ApiSchema):
    id: str
    query_id: str
    version_number: int
    sql: str
    title: str
    description: str | None
    edited_by: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, version: "SavedQueryVersion") -> "SavedQueryVersionResponse":
        return cls(
            id=version.id,
            query_id=version.query_id,
            version_number=version.version_number,
            sql=version.sql,
            title=version.title,
            description=version.description,
            edited_by=version.edited_by,
            created_at=version.created_at,
        )


class SavedQueryVersionListResponse(ApiSchema):
    items: list[SavedQueryVersionResponse]


# ── Favorites ────────────────────────────────────────────────


class FavoriteResponse(ApiSchema):
    query_id: str
    created_at: datetime

    @classmethod
    def from_model(cls, favorite: "SavedQueryFavorite") -> "FavoriteResponse":
        return cls(query_id=favorite.query_id, created_at=favorite.created_at)


class FavoriteListResponse(ApiSchema):
    items: list[FavoriteResponse]


# ── List responses ───────────────────────────────────────────


class FolderListResponse(ApiSchema):
    items: list[FolderResponse]


class SavedQueryListResponse(ApiSchema):
    items: list[SavedQueryResponse]
