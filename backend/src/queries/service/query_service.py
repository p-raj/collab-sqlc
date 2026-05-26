"""Saved queries service — business logic for folders and queries."""

from src.admin.service.audit_service import AuditService
from src.queries.domain.models import QueryFolder, SavedQuery, SavedQueryFavorite, SavedQueryVersion
from src.queries.domain.schemas import (
    FolderCreateRequest,
    FolderUpdateRequest,
    SavedQueryCreateRequest,
    SavedQueryUpdateRequest,
)
from src.queries.repository.query_repository import (
    FavoriteRepository,
    FolderRepository,
    SavedQueryRepository,
    VersionRepository,
)
from src.shared.domain.base import new_id, utc_now
from src.shared.domain.errors import ForbiddenError, NotFoundError
from src.shared.domain.types import UserRole


class SavedQueryService:
    def __init__(
        self,
        folder_repo: FolderRepository,
        query_repo: SavedQueryRepository,
        version_repo: VersionRepository,
        favorite_repo: FavoriteRepository,
        audit_service: AuditService,
    ) -> None:
        self._folders = folder_repo
        self._queries = query_repo
        self._versions = version_repo
        self._favorites = favorite_repo
        self._audit = audit_service

    # ── Folders ──────────────────────────────────────────

    async def create_folder(self, request: FolderCreateRequest, user_id: str) -> QueryFolder:
        folder = QueryFolder(
            id=new_id(),
            name=request.name,
            parent_id=request.parent_id,
            created_by=user_id,
            is_shared=request.is_shared,
        )
        return await self._folders.create(folder)

    async def list_folders(self, user_id: str) -> list[QueryFolder]:
        return await self._folders.list_for_user(user_id)

    async def update_folder(
        self,
        folder_id: str,
        update: FolderUpdateRequest,
        user_id: str,
        user_role: str,
    ) -> QueryFolder:
        folder = await self._get_folder_with_write_access(folder_id, user_id, user_role)

        if update.name is not None:
            folder.name = update.name
        if update.parent_id is not None:
            folder.parent_id = update.parent_id
        if update.is_shared is not None:
            folder.is_shared = update.is_shared
        if update.sort_order is not None:
            folder.sort_order = update.sort_order

        return await self._folders.update(folder)

    async def delete_folder(self, folder_id: str, user_id: str, user_role: str) -> None:
        folder = await self._get_folder_with_write_access(folder_id, user_id, user_role)
        await self._folders.delete(folder)

    # ── Queries ──────────────────────────────────────────

    async def create_query(
        self,
        request: SavedQueryCreateRequest,
        user_id: str,
        user_email: str,
        ip_address: str | None,
    ) -> SavedQuery:
        query = SavedQuery(
            id=new_id(),
            title=request.title,
            sql=request.sql,
            description=request.description,
            connection_id=request.connection_id,
            folder_id=request.folder_id,
            created_by=user_id,
            is_shared=request.is_shared,
        )
        created_query = await self._queries.create(query)
        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action="query.save",
            resource_type="query",
            resource_id=created_query.id,
            ip_address=ip_address,
        )
        return created_query

    async def list_queries(
        self,
        user_id: str,
        folder_id: str | None = None,
    ) -> list[SavedQuery]:
        return await self._queries.list_for_user(user_id, folder_id)

    async def get_query(self, query_id: str, user_id: str, user_role: str) -> SavedQuery:
        return await self._get_query_with_read_access(query_id, user_id, user_role)

    async def update_query(
        self,
        query_id: str,
        update: SavedQueryUpdateRequest,
        user_id: str,
        user_role: str,
        user_email: str,
        ip_address: str | None,
    ) -> SavedQuery:
        query = await self._get_query_with_write_access(query_id, user_id, user_role)

        # Snapshot previous state if title or sql is changing
        title_changing = update.title is not None and update.title != query.title
        sql_changing = update.sql is not None and update.sql != query.sql
        if title_changing or sql_changing:
            version_number = await self._versions.next_version_number(query_id)
            version = SavedQueryVersion(
                id=new_id(),
                query_id=query_id,
                version_number=version_number,
                sql=query.sql,
                title=query.title,
                description=query.description,
                edited_by=user_id,
                created_at=utc_now(),
            )
            await self._versions.create(version)

        if update.title is not None:
            query.title = update.title
        if update.sql is not None:
            query.sql = update.sql
        if update.description is not None:
            query.description = update.description
        if update.connection_id is not None:
            query.connection_id = update.connection_id
        if update.folder_id is not None:
            query.folder_id = update.folder_id
        if update.is_shared is not None:
            query.is_shared = update.is_shared
        if update.sort_order is not None:
            query.sort_order = update.sort_order

        query.updated_by = user_id
        updated_query = await self._queries.update(query)
        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action="query.save",
            resource_type="query",
            resource_id=updated_query.id,
            ip_address=ip_address,
        )
        return updated_query

    async def delete_query(
        self,
        query_id: str,
        user_id: str,
        user_role: str,
        user_email: str,
        ip_address: str | None,
    ) -> None:
        query = await self._get_query_with_write_access(query_id, user_id, user_role)
        await self._queries.delete(query)
        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action="query.delete",
            resource_type="query",
            resource_id=query_id,
            ip_address=ip_address,
        )

    # ── Versions ─────────────────────────────────────────

    async def list_versions(
        self, query_id: str, user_id: str, user_role: str
    ) -> list[SavedQueryVersion]:
        await self._get_query_with_read_access(query_id, user_id, user_role)
        return await self._versions.list_for_query(query_id)

    async def restore_version(
        self, query_id: str, version_id: str, user_id: str, user_role: str
    ) -> SavedQuery:
        query = await self._get_query_with_write_access(query_id, user_id, user_role)
        version = await self._versions.get_by_id(version_id)
        if not version or version.query_id != query_id:
            raise NotFoundError("SavedQueryVersion", version_id)

        # Snapshot current state before restoring
        next_num = await self._versions.next_version_number(query_id)
        snapshot = SavedQueryVersion(
            id=new_id(),
            query_id=query_id,
            version_number=next_num,
            sql=query.sql,
            title=query.title,
            description=query.description,
            edited_by=user_id,
            created_at=utc_now(),
        )
        await self._versions.create(snapshot)

        query.title = version.title
        query.sql = version.sql
        query.description = version.description
        query.updated_by = user_id
        return await self._queries.update(query)

    # ── Favorites ────────────────────────────────────────

    async def toggle_favorite(self, query_id: str, user_id: str, user_role: str) -> bool:
        """Toggle favorite status. Returns True if now favorited, False if removed."""
        await self._get_query_with_read_access(query_id, user_id, user_role)

        existing = await self._favorites.get(user_id, query_id)
        if existing:
            await self._favorites.remove(user_id, query_id)
            return False

        fav = SavedQueryFavorite(user_id=user_id, query_id=query_id, created_at=utc_now())
        await self._favorites.add(fav)
        return True

    async def remove_favorite(self, query_id: str, user_id: str) -> None:
        removed = await self._favorites.remove(user_id, query_id)
        if not removed:
            raise NotFoundError("Favorite", query_id)

    async def list_favorites(self, user_id: str) -> list[SavedQueryFavorite]:
        return await self._favorites.list_for_user(user_id)

    # ── Fork / Duplicate ─────────────────────────────────

    async def fork_query(
        self,
        query_id: str,
        user_id: str,
        user_role: str,
        user_email: str,
        ip_address: str | None,
    ) -> SavedQuery:
        original = await self._get_query_with_read_access(query_id, user_id, user_role)
        forked = SavedQuery(
            id=new_id(),
            title=f"Copy of {original.title}",
            sql=original.sql,
            description=original.description,
            connection_id=original.connection_id,
            folder_id=None,
            created_by=user_id,
            is_shared=False,
        )
        forked_query = await self._queries.create(forked)
        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action="query.fork",
            resource_type="query",
            resource_id=forked_query.id,
            details=f"forked from {query_id}",
            ip_address=ip_address,
        )
        return forked_query

    # ── Access checks ────────────────────────────────────

    async def _get_folder_with_write_access(
        self, folder_id: str, user_id: str, user_role: str
    ) -> QueryFolder:
        folder = await self._folders.get_by_id(folder_id)
        if not folder:
            raise NotFoundError("Folder", folder_id)
        if folder.created_by != user_id and user_role != UserRole.ADMIN:
            raise ForbiddenError("You don't have access to this folder")
        return folder

    async def _get_query_with_read_access(
        self, query_id: str, user_id: str, user_role: str
    ) -> SavedQuery:
        """Read access: owner, admin, shared query, or query in a shared folder."""
        query = await self._queries.get_by_id(query_id)
        if not query:
            raise NotFoundError("SavedQuery", query_id)
        if query.created_by == user_id or query.is_shared or user_role == UserRole.ADMIN:
            return query
        # Check if parent folder is shared
        if query.folder_id:
            folder = await self._folders.get_by_id(query.folder_id)
            if folder and folder.is_shared:
                return query
        raise ForbiddenError("You don't have access to this query")

    async def _get_query_with_write_access(
        self, query_id: str, user_id: str, user_role: str
    ) -> SavedQuery:
        """Write access: owner or admin only. Shared queries are read-only for non-owners."""
        query = await self._queries.get_by_id(query_id)
        if not query:
            raise NotFoundError("SavedQuery", query_id)
        if query.created_by != user_id and user_role != UserRole.ADMIN:
            raise ForbiddenError("Only the query owner or an admin can modify this query")
        return query
