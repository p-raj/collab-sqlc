"""Auth API routes."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response

from src.admin.service.settings_service import SettingsService
from src.auth.api.dependencies import (
    get_auth_service,
    get_current_user,
    get_current_user_unverified,
    get_settings_service,
    get_sso_service,
    require_admin,
)
from src.auth.domain.schemas import (
    CurrentUser,
    InviteListResponse,
    InviteRequest,
    InviteResponse,
    LoginRequest,
    PendingInvite,
    RegisterRequest,
    ResetSecretKeyResponse,
    SSOCallbackRequest,
    SSOConfigResponse,
    TokenResponse,
    UpdateUserRequest,
    UserListResponse,
    UserResponse,
    VerifySecretKeyRequest,
)
from src.auth.service.auth_service import AuthService
from src.auth.service.sso_service import SSOService
from src.shared.config import AppSettings, get_settings
from src.shared.domain.errors import ForbiddenError, UnauthorizedError
from src.shared.middleware.rate_limit import (
    rate_limit_login,
    rate_limit_register,
    rate_limit_verify_key,
)

router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin/users", tags=["admin"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    auth: Annotated[AuthService, Depends(get_auth_service)],
    _rl: Annotated[None, Depends(rate_limit_register)],
    invite_token: str | None = None,
) -> TokenResponse:
    user = await auth.register(
        email=body.email,
        display_name=body.display_name,
        password=body.password,
        invite_token=invite_token,
        ip_address=request.client.host if request.client else None,
    )
    token_response, refresh_token = await auth.create_tokens_for_user(user)
    _set_refresh_cookie(response, refresh_token, auth.refresh_token_expire_days)
    return token_response


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    auth: Annotated[AuthService, Depends(get_auth_service)],
    _rl: Annotated[None, Depends(rate_limit_login)],
) -> TokenResponse:
    token_response, refresh_token = await auth.login(
        body.email,
        body.password,
        request.client.host if request.client else None,
    )
    _set_refresh_cookie(response, refresh_token, auth.refresh_token_expire_days)
    # Password login always requires secret key verification
    token_response.requires_secret_key = True
    return token_response


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    auth: Annotated[AuthService, Depends(get_auth_service)],
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    if not refresh_token:
        raise UnauthorizedError("No refresh token")

    # Preserve the current token's verified status during refresh
    # Default to False (unverified) — caller must prove verified status
    current_verified = False
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            payload = auth.decode_access_token(auth_header[7:])
            current_verified = payload.verified
        except Exception:
            # Expired/invalid token — keep unverified to be safe
            pass

    token_response, new_refresh = await auth.refresh(
        refresh_token, current_verified=current_verified,
    )
    _set_refresh_cookie(response, new_refresh, auth.refresh_token_expire_days)
    return token_response


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    user: Annotated[CurrentUser, Depends(get_current_user_unverified)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> None:
    await auth.logout(
        user.id,
        user.email,
        request.client.host if request.client else None,
    )
    response.delete_cookie("refresh_token", path="/api/auth/refresh")


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: Annotated[CurrentUser, Depends(get_current_user_unverified)],
) -> UserResponse:
    return UserResponse.from_user(user)


@router.post("/verify-key", response_model=TokenResponse)
async def verify_secret_key(
    body: VerifySecretKeyRequest,
    request: Request,
    response: Response,
    user: Annotated[CurrentUser, Depends(get_current_user_unverified)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    _rl: Annotated[None, Depends(rate_limit_verify_key)],
) -> TokenResponse:
    """Verify the user's secret key and upgrade to a fully verified session."""
    token_response, refresh_token = await auth.verify_secret_key(user, body.secret_key)
    _set_refresh_cookie(response, refresh_token, auth.refresh_token_expire_days)
    return token_response


# Admin routes


@admin_router.get("", response_model=UserListResponse)
async def list_users(
    _admin: Annotated[CurrentUser, Depends(require_admin)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> UserListResponse:
    users = await auth.list_users()
    return UserListResponse(items=[UserResponse.from_user(user) for user in users])


@admin_router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    _admin: Annotated[CurrentUser, Depends(require_admin)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> UserResponse:
    user = await auth.update_user(user_id, body, _admin.id)
    return UserResponse.from_user(user)


# ── Invite endpoints ─────────────────────────────────────────


@admin_router.post("/invites", response_model=InviteResponse, status_code=201)
async def create_invite(
    body: InviteRequest,
    request: Request,
    admin: Annotated[CurrentUser, Depends(require_admin)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> InviteResponse:
    base_url = str(request.headers.get("origin") or settings.frontend_url)
    invite, invite_url = await auth.create_invite(
        email=body.email,
        role=body.role,
        invited_by=admin.id,
        invited_by_email=admin.email,
        base_url=base_url,
        ip_address=request.client.host if request.client else None,
    )
    return InviteResponse(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        invite_url=invite_url,
        expires_at=invite.expires_at,
    )


@admin_router.get("/invites", response_model=InviteListResponse)
async def list_invites(
    _admin: Annotated[CurrentUser, Depends(require_admin)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> InviteListResponse:
    invites = await auth.list_pending_invites()
    return InviteListResponse(
        items=[
            PendingInvite(
                id=i.id,
                email=i.email,
                role=i.role,
                invited_by=i.invited_by,
                expires_at=i.expires_at,
                created_at=i.created_at,
            )
            for i in invites
        ]
    )


@admin_router.delete("/invites/{invite_id}", status_code=204)
async def revoke_invite(
    invite_id: str,
    _admin: Annotated[CurrentUser, Depends(require_admin)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> None:
    await auth.revoke_invite(invite_id)


@admin_router.post("/{user_id}/reset-secret-key", response_model=ResetSecretKeyResponse)
async def admin_reset_secret_key(
    user_id: str,
    _admin: Annotated[CurrentUser, Depends(require_admin)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> ResetSecretKeyResponse:
    """Admin resets a user's secret key. Returns the new key to share."""
    new_key = await auth.reset_secret_key(user_id)
    return ResetSecretKeyResponse(secret_key=new_key)


@router.post("/reset-secret-key", response_model=ResetSecretKeyResponse)
async def reset_own_secret_key(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> ResetSecretKeyResponse:
    """User resets their own secret key."""
    new_key = await auth.reset_secret_key(user.id)
    return ResetSecretKeyResponse(secret_key=new_key)

def _set_refresh_cookie(response: Response, token: str, max_age_days: int) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=max_age_days * 24 * 60 * 60,
        path="/api/auth/refresh",
    )


# SSO routes


@router.get("/sso/config", response_model=SSOConfigResponse)
async def sso_config(
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
) -> SSOConfigResponse:
    cfg = await settings_service.get_sso_config()
    return SSOConfigResponse(
        sso_enabled=cfg.sso_enabled,
        sso_only_mode=cfg.sso_only_mode,
    )


@router.get("/sso/github")
async def sso_github_authorize(
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
    sso_service: Annotated[SSOService, Depends(get_sso_service)],
) -> dict[str, str]:
    cfg = await settings_service.get_sso_config()
    if not cfg.sso_enabled:
        raise ForbiddenError("SSO is not enabled")

    authorize_url = await sso_service.create_github_authorize_url()
    return {"authorize_url": authorize_url}


@router.post("/sso/github/callback", response_model=TokenResponse)
async def sso_github_callback(
    body: SSOCallbackRequest,
    response: Response,
    auth: Annotated[AuthService, Depends(get_auth_service)],
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
    sso_service: Annotated[SSOService, Depends(get_sso_service)],
) -> TokenResponse:
    cfg = await settings_service.get_sso_config()
    if not cfg.sso_enabled:
        raise ForbiddenError("SSO is not enabled")

    github_user = await sso_service.exchange_github_callback(body.code, body.state)

    _user, token_response, refresh_token = await auth.authenticate_github(github_user)
    _set_refresh_cookie(response, refresh_token, auth.refresh_token_expire_days)
    return token_response
