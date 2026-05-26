"""Saved queries repository — data access."""

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.queries.domain.models import QueryFolder, SavedQuery, SavedQueryFavorite, SavedQueryVersion
from src.shared.domain.base import utc_now


class FolderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, folder_id: str) -> QueryFolder | None:
        result = await self._session.execute(select(QueryFolder).where(QueryFolder.id == folder_id))
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: str) -> list[QueryFolder]:
        result = await self._session.execute(
            select(QueryFolder)
            .where((QueryFolder.created_by == user_id) | (QueryFolder.is_shared.is_(True)))
            .order_by(QueryFolder.sort_order, QueryFolder.name)
        )
        return list(result.scalars().all())

    async def create(self, folder: QueryFolder) -> QueryFolder:
        self._session.add(folder)
        await self._session.flush()
        return folder

    async def update(self, folder: QueryFolder) -> QueryFolder:
        folder.updated_at = utc_now()
        await self._session.flush()
        return folder

    async def delete(self, folder: QueryFolder) -> None:
        await self._session.delete(folder)
        await self._session.flush()


class SavedQueryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, query_id: str) -> SavedQuery | None:
        result = await self._session.execute(select(SavedQuery).where(SavedQuery.id == query_id))
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        user_id: str,
        folder_id: str | None = None,
    ) -> list[SavedQuery]:
        # Shared folder IDs — queries in shared folders are visible to everyone
        shared_folder_ids = (
            select(QueryFolder.id)
            .where(QueryFolder.is_shared.is_(True))
            .scalar_subquery()
        )

        stmt = select(SavedQuery).where(
            (SavedQuery.created_by == user_id)
            | (SavedQuery.is_shared.is_(True))
            | (SavedQuery.folder_id.in_(shared_folder_ids))
        )
        if folder_id is not None:
            stmt = stmt.where(SavedQuery.folder_id == folder_id)
        stmt = stmt.order_by(SavedQuery.sort_order, SavedQuery.title)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, query: SavedQuery) -> SavedQuery:
        self._session.add(query)
        await self._session.flush()
        return query

    async def update(self, query: SavedQuery) -> SavedQuery:
        query.updated_at = utc_now()
        await self._session.flush()
        return query

    async def delete(self, query: SavedQuery) -> None:
        await self._session.delete(query)
        await self._session.flush()


class VersionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def next_version_number(self, query_id: str) -> int:
        result = await self._session.execute(
            select(func.coalesce(func.max(SavedQueryVersion.version_number), 0)).where(
                SavedQueryVersion.query_id == query_id
            )
        )
        return (result.scalar() or 0) + 1

    async def create(self, version: SavedQueryVersion) -> SavedQueryVersion:
        self._session.add(version)
        await self._session.flush()
        return version

    async def list_for_query(self, query_id: str) -> list[SavedQueryVersion]:
        result = await self._session.execute(
            select(SavedQueryVersion)
            .where(SavedQueryVersion.query_id == query_id)
            .order_by(SavedQueryVersion.version_number.desc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, version_id: str) -> SavedQueryVersion | None:
        result = await self._session.execute(
            select(SavedQueryVersion).where(SavedQueryVersion.id == version_id)
        )
        return result.scalar_one_or_none()


class FavoriteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, favorite: SavedQueryFavorite) -> SavedQueryFavorite:
        self._session.add(favorite)
        await self._session.flush()
        return favorite

    async def remove(self, user_id: str, query_id: str) -> bool:
        result = await self._session.execute(
            delete(SavedQueryFavorite).where(
                SavedQueryFavorite.user_id == user_id,
                SavedQueryFavorite.query_id == query_id,
            )
        )
        await self._session.flush()
        return result.rowcount > 0  # type: ignore[no-any-return, attr-defined]

    async def get(self, user_id: str, query_id: str) -> SavedQueryFavorite | None:
        result = await self._session.execute(
            select(SavedQueryFavorite).where(
                SavedQueryFavorite.user_id == user_id,
                SavedQueryFavorite.query_id == query_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: str) -> list[SavedQueryFavorite]:
        result = await self._session.execute(
            select(SavedQueryFavorite)
            .where(SavedQueryFavorite.user_id == user_id)
            .order_by(SavedQueryFavorite.created_at.desc())
        )
        return list(result.scalars().all())
