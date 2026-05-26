"""Auth read service for lightweight user lookup operations."""

from typing import TYPE_CHECKING

from src.auth.repository.user_repository import UserRepository

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class UserLookupService:
    def __init__(self, user_repo: UserRepository) -> None:
        self._users = user_repo

    async def get_user_labels(
        self,
        user_ids: set[str],
    ) -> dict[str, tuple[str | None, str | None]]:
        return await self._users.get_labels(user_ids)


def create_user_lookup_service(session: "AsyncSession") -> UserLookupService:
    return UserLookupService(UserRepository(session))
