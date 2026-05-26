"""Runtime settings service — DB-backed with env-var fallback."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.admin.domain.schemas import SSOSettingsResponse
from src.admin.repository.settings_repository import SettingsRepository
from src.shared.config import AppSettings

# Keys used for SSO settings
SSO_ENABLED = "sso_enabled"
SSO_ONLY_MODE = "sso_only_mode"


async def get_setting(session: AsyncSession, key: str) -> str | None:
    repo = SettingsRepository(session)
    return await repo.get_value(key)


async def set_setting(session: AsyncSession, key: str, value: str) -> None:
    repo = SettingsRepository(session)
    await repo.set_value(key, value)


class SettingsService:
    def __init__(self, repo: SettingsRepository, env_settings: AppSettings) -> None:
        self._repo = repo
        self._env_settings = env_settings

    async def get_sso_config(self) -> SSOSettingsResponse:
        """Get SSO config: DB values override env vars."""
        db_enabled = await self._repo.get_value(SSO_ENABLED)
        db_only_mode = await self._repo.get_value(SSO_ONLY_MODE)

        return SSOSettingsResponse(
            sso_enabled=(
                _to_bool(db_enabled)
                if db_enabled is not None
                else self._env_settings.auth.sso_enabled
            ),
            sso_only_mode=(
                _to_bool(db_only_mode)
                if db_only_mode is not None
                else self._env_settings.auth.sso_only_mode
            ),
        )

    async def update_sso_config(
        self,
        sso_enabled: bool | None = None,
        sso_only_mode: bool | None = None,
    ) -> SSOSettingsResponse:
        if sso_enabled is not None:
            await self._repo.set_value(SSO_ENABLED, str(sso_enabled).lower())
        if sso_only_mode is not None:
            await self._repo.set_value(SSO_ONLY_MODE, str(sso_only_mode).lower())
        return await self.get_sso_config()


def create_settings_service(
    session: AsyncSession,
    env_settings: AppSettings,
) -> SettingsService:
    return SettingsService(SettingsRepository(session), env_settings)


async def get_sso_config(session: AsyncSession, env_settings: AppSettings) -> dict[str, Any]:
    service = create_settings_service(session, env_settings)
    config = await service.get_sso_config()
    return {
        "sso_enabled": config.sso_enabled,
        "sso_only_mode": config.sso_only_mode,
    }


async def update_sso_config(
    session: AsyncSession,
    sso_enabled: bool | None = None,
    sso_only_mode: bool | None = None,
) -> None:
    if sso_enabled is not None:
        await set_setting(session, SSO_ENABLED, str(sso_enabled).lower())
    if sso_only_mode is not None:
        await set_setting(session, SSO_ONLY_MODE, str(sso_only_mode).lower())


def _to_bool(value: str) -> bool:
    return value.lower() in ("true", "1", "yes")
