"""Saved queries API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from src.auth.api.dependencies import get_current_user
from src.auth.domain.schemas import CurrentUser
from src.queries.api.dependencies import get_saved_query_service
from src.queries.domain.schemas import (
    FavoriteListResponse,
    FavoriteResponse,
    FolderCreateRequest,
    FolderListResponse,
    FolderResponse,
    FolderUpdateRequest,
    SavedQueryCreateRequest,
    SavedQueryListResponse,
    SavedQueryResponse,
    SavedQueryUpdateRequest,
    SavedQueryVersionListResponse,
    SavedQueryVersionResponse,
)
from src.queries.service.query_service import SavedQueryService

router = APIRouter(prefix="/saved-queries", tags=["saved-queries"])
folder_router = APIRouter(prefix="/folders", tags=["folders"])


# ── Folders ──────────────────────────────────────────────────


@folder_router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    body: FolderCreateRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> FolderResponse:
    folder = await service.create_folder(body, user.id)
    return FolderResponse.from_model(folder)


@folder_router.get("", response_model=FolderListResponse)
async def list_folders(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> FolderListResponse:
    folders = await service.list_folders(user.id)
    return FolderListResponse(items=[FolderResponse.from_model(folder) for folder in folders])


@folder_router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    body: FolderUpdateRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> FolderResponse:
    folder = await service.update_folder(folder_id, body, user.id, user.role)
    return FolderResponse.from_model(folder)


@folder_router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> None:
    await service.delete_folder(folder_id, user.id, user.role)


# ── Saved Queries ────────────────────────────────────────────


@router.post("", response_model=SavedQueryResponse, status_code=201)
async def create_query(
    body: SavedQueryCreateRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> SavedQueryResponse:
    query = await service.create_query(
        body,
        user.id,
        user.email,
        request.client.host if request.client else None,
    )
    return SavedQueryResponse.from_model(query)


@router.get("", response_model=SavedQueryListResponse)
async def list_queries(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
    folder_id: str | None = Query(default=None),
) -> SavedQueryListResponse:
    queries = await service.list_queries(user.id, folder_id)
    return SavedQueryListResponse(items=[SavedQueryResponse.from_model(query) for query in queries])


@router.get("/favorites", response_model=FavoriteListResponse)
async def list_favorites(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> FavoriteListResponse:
    favs = await service.list_favorites(user.id)
    return FavoriteListResponse(items=[FavoriteResponse.from_model(favorite) for favorite in favs])


@router.get("/{query_id}", response_model=SavedQueryResponse)
async def get_query(
    query_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> SavedQueryResponse:
    query = await service.get_query(query_id, user.id, user.role)
    return SavedQueryResponse.from_model(query)


@router.patch("/{query_id}", response_model=SavedQueryResponse)
async def update_query(
    query_id: str,
    body: SavedQueryUpdateRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> SavedQueryResponse:
    query = await service.update_query(
        query_id,
        body,
        user.id,
        user.role,
        user.email,
        request.client.host if request.client else None,
    )
    return SavedQueryResponse.from_model(query)


@router.delete("/{query_id}", status_code=204)
async def delete_query(
    query_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> None:
    await service.delete_query(
        query_id,
        user.id,
        user.role,
        user.email,
        request.client.host if request.client else None,
    )


# ── Versions ─────────────────────────────────────────────────


@router.get("/{query_id}/versions", response_model=SavedQueryVersionListResponse)
async def list_versions(
    query_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> SavedQueryVersionListResponse:
    versions = await service.list_versions(query_id, user.id, user.role)
    return SavedQueryVersionListResponse(
        items=[SavedQueryVersionResponse.from_model(version) for version in versions]
    )


@router.post("/{query_id}/versions/{version_id}/restore", response_model=SavedQueryResponse)
async def restore_version(
    query_id: str,
    version_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> SavedQueryResponse:
    query = await service.restore_version(query_id, version_id, user.id, user.role)
    return SavedQueryResponse.from_model(query)


# ── Favorites ────────────────────────────────────────────────


@router.post("/{query_id}/favorite", status_code=200)
async def toggle_favorite(
    query_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> dict[str, bool]:
    is_favorited = await service.toggle_favorite(query_id, user.id, user.role)
    return {"favorited": is_favorited}


@router.delete("/{query_id}/favorite", status_code=204)
async def remove_favorite(
    query_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> None:
    await service.remove_favorite(query_id, user.id)


# ── Fork / Duplicate ────────────────────────────────────────


@router.post("/{query_id}/fork", response_model=SavedQueryResponse, status_code=201)
async def fork_query(
    query_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[SavedQueryService, Depends(get_saved_query_service)],
) -> SavedQueryResponse:
    query = await service.fork_query(
        query_id,
        user.id,
        user.role,
        user.email,
        request.client.host if request.client else None,
    )
    return SavedQueryResponse.from_model(query)
