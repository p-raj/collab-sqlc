"""Auth dependencies for FastAPI route injection."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.admin.service.audit_service import create_audit_service
from src.admin.service.settings_service import SettingsService, create_settings_service
from src.auth.domain.schemas import CurrentUser
from src.auth.repository.user_repository import (
    InviteRepository,
    RefreshTokenRepository,
    UserRepository,
)
from src.auth.service.auth_service import AuthService
from src.auth.service.sso_service import SSOService
from src.shared.config import AppSettings, get_settings
from src.shared.database import get_session
from src.shared.domain.errors import ForbiddenError, UnauthorizedError
from src.shared.domain.types import UserRole
from src.shared.redis import get_redis_connection


def get_auth_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> AuthService:
    return AuthService(
        user_repo=UserRepository(session),
        token_repo=RefreshTokenRepository(session),
        settings=settings,
        invite_repo=InviteRepository(session),
        settings_service=create_settings_service(session, settings),
        audit_service=create_audit_service(session),
    )


def get_settings_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> SettingsService:
    return create_settings_service(session, settings)


def get_sso_service(
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> SSOService:
    return SSOService(settings=settings, redis=get_redis_connection(settings))


async def get_current_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> CurrentUser:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header")

    token = auth_header[7:]
    auth_service = AuthService(
        user_repo=UserRepository(session),
        token_repo=RefreshTokenRepository(session),
        settings=settings,
    )

    payload = auth_service.decode_access_token(token)

    # Reject unverified tokens (secret key not yet confirmed)
    if not payload.verified:
        raise UnauthorizedError("Secret key verification required")

    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(payload.sub)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return CurrentUser.from_model(user)


async def get_current_user_unverified(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> CurrentUser:
    """Like get_current_user but allows unverified tokens.

    Used only by the secret-key verification endpoint itself.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header")

    token = auth_header[7:]
    auth_service = AuthService(
        user_repo=UserRepository(session),
        token_repo=RefreshTokenRepository(session),
        settings=settings,
    )

    payload = auth_service.decode_access_token(token)

    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(payload.sub)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return CurrentUser.from_model(user)


async def require_admin(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    if user.role != UserRole.ADMIN:
        raise ForbiddenError("Admin access required")
    return user


async def require_editor_or_admin(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    if user.role not in (UserRole.ADMIN, UserRole.EDITOR):
        raise ForbiddenError("Editor or admin access required")
    return user
