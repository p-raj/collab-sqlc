"""Connection repository — data access for connection domain."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.connections.domain.models import ConnectionModel
from src.shared.domain.base import utc_now


class ConnectionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, connection_id: str) -> ConnectionModel | None:
        result = await self._session.execute(
            select(ConnectionModel).where(ConnectionModel.id == connection_id)
        )
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: str) -> list[ConnectionModel]:
        """List connections a user can access: their own + shared ones."""
        result = await self._session.execute(
            select(ConnectionModel)
            .where((ConnectionModel.created_by == user_id) | (ConnectionModel.is_shared.is_(True)))
            .order_by(ConnectionModel.name)
        )
        return list(result.scalars().all())

    async def create(self, connection: ConnectionModel) -> ConnectionModel:
        self._session.add(connection)
        await self._session.flush()
        return connection

    async def update(self, connection: ConnectionModel) -> ConnectionModel:
        connection.updated_at = utc_now()
        await self._session.flush()
        return connection

    async def delete(self, connection: ConnectionModel) -> None:
        await self._session.delete(connection)
        await self._session.flush()
