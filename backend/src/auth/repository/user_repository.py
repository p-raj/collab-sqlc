"""User repository — data access for auth domain."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.domain.models import InviteModel, RefreshTokenModel, UserModel
from src.shared.domain.base import utc_now


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_labels(
        self,
        user_ids: set[str],
    ) -> dict[str, tuple[str | None, str | None]]:
        if not user_ids:
            return {}

        result = await self._session.execute(
            select(
                UserModel.id,
                UserModel.display_name,
                UserModel.email,
            ).where(UserModel.id.in_(user_ids))
        )
        return {
            user_id: (display_name, email)
            for user_id, display_name, email in result.all()
        }

    async def get_by_id(self, user_id: str) -> UserModel | None:
        result = await self._session.execute(select(UserModel).where(UserModel.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> UserModel | None:
        result = await self._session.execute(select(UserModel).where(UserModel.email == email))
        return result.scalar_one_or_none()

    async def get_by_sso(self, provider: str, sso_id: str) -> UserModel | None:
        result = await self._session.execute(
            select(UserModel).where(
                UserModel.sso_provider == provider,
                UserModel.sso_id == sso_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[UserModel]:
        result = await self._session.execute(
            select(UserModel).order_by(UserModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, user: UserModel) -> UserModel:
        self._session.add(user)
        await self._session.flush()
        return user

    async def update(self, user: UserModel) -> UserModel:
        user.updated_at = utc_now()
        await self._session.flush()
        return user


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, token: RefreshTokenModel) -> RefreshTokenModel:
        self._session.add(token)
        await self._session.flush()
        return token

    async def get_by_hash(self, token_hash: str) -> RefreshTokenModel | None:
        result = await self._session.execute(
            select(RefreshTokenModel)
            .where(
                RefreshTokenModel.token_hash == token_hash,
                RefreshTokenModel.revoked.is_(False),
            )
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def revoke_all_for_user(self, user_id: str) -> None:
        from sqlalchemy import update

        await self._session.execute(
            update(RefreshTokenModel)
            .where(
                RefreshTokenModel.user_id == user_id,
                RefreshTokenModel.revoked.is_(False),
            )
            .values(revoked=True)
        )
        await self._session.flush()


class InviteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, invite: InviteModel) -> InviteModel:
        self._session.add(invite)
        await self._session.flush()
        return invite

    async def get_by_token_hash(self, token_hash: str) -> InviteModel | None:
        result = await self._session.execute(
            select(InviteModel).where(
                InviteModel.token_hash == token_hash,
                InviteModel.accepted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> InviteModel | None:
        """Get a pending (unused) invite by email."""
        result = await self._session.execute(
            select(InviteModel)
            .where(InviteModel.email == email, InviteModel.accepted_at.is_(None))
            .order_by(InviteModel.created_at.desc())
        )
        return result.scalars().first()

    async def list_pending(self) -> list[InviteModel]:
        result = await self._session.execute(
            select(InviteModel)
            .where(InviteModel.accepted_at.is_(None))
            .order_by(InviteModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete(self, invite_id: str) -> None:
        from sqlalchemy import delete as sql_delete

        await self._session.execute(sql_delete(InviteModel).where(InviteModel.id == invite_id))
        await self._session.flush()
