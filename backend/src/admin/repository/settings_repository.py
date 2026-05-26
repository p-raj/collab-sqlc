"""Runtime settings repository."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.admin.domain.app_settings_model import AppSettingModel
from src.shared.domain.base import utc_now


class SettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_value(self, key: str) -> str | None:
        result = await self._session.execute(
            select(AppSettingModel.value).where(AppSettingModel.key == key)
        )
        return result.scalar_one_or_none()

    async def set_value(self, key: str, value: str) -> None:
        existing = await self._session.get(AppSettingModel, key)
        if existing:
            existing.value = value
            existing.updated_at = utc_now()
        else:
            self._session.add(AppSettingModel(key=key, value=value))
        await self._session.flush()
