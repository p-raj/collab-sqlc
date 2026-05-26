"""Auth service — handles registration, login, token management."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from src.admin.service.audit_service import AuditService
from src.auth.domain.models import InviteModel, RefreshTokenModel, UserModel
from src.auth.domain.schemas import CurrentUser, TokenResponse, UpdateUserRequest
from src.auth.repository.user_repository import (
    InviteRepository,
    RefreshTokenRepository,
    UserRepository,
)
from src.auth.service.sso_service import GitHubUser
from src.shared.config import AppSettings
from src.shared.domain.base import new_id, utc_now
from src.shared.domain.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError
from src.shared.domain.types import UserRole

if TYPE_CHECKING:
    from src.admin.service.settings_service import SettingsService

_hasher = PasswordHasher()


@dataclass(frozen=True, slots=True)
class TokenPayload:
    sub: str
    email: str
    role: UserRole
    verified: bool = True


class AuthService:
    def __init__(
        self,
        user_repo: UserRepository,
        token_repo: RefreshTokenRepository,
        settings: AppSettings,
        invite_repo: InviteRepository | None = None,
        settings_service: "SettingsService | None" = None,
        audit_service: AuditService | None = None,
    ) -> None:
        self._users = user_repo
        self._tokens = token_repo
        self._invites = invite_repo
        self._settings = settings
        self._settings_service = settings_service
        self._audit = audit_service

    async def register(
        self,
        email: str,
        display_name: str,
        password: str,
        role: UserRole = UserRole.VIEWER,
        invite_token: str | None = None,
        ip_address: str | None = None,
    ) -> UserModel:
        # Validate invite token (always required — invite-only platform)
        resolved_role = role
        if invite_token:
            invite = await self._validate_invite(invite_token, email)
            resolved_role = UserRole(invite.role)
            invite.accepted_at = utc_now()
        else:
            # Allow first user to register without invite (bootstrap admin)
            existing_users = await self._users.list_all()
            if len(existing_users) > 0:
                raise ForbiddenError("Registration requires an invite. Contact your admin.")
            resolved_role = UserRole.ADMIN  # First user becomes admin

        existing = await self._users.get_by_email(email)
        if existing:
            raise ConflictError(f"User with email {email} already exists")

        user = UserModel(
            id=new_id(),
            email=email,
            display_name=display_name,
            password_hash=_hasher.hash(password),
            secret_key=_generate_secret_key(),
            role=resolved_role,
        )
        created_user = await self._users.create(user)
        await self._log_action(
            user_id=created_user.id,
            user_email=created_user.email,
            action="register",
            resource_type="user",
            resource_id=created_user.id,
            ip_address=ip_address,
        )
        return created_user

    async def login(
        self,
        email: str,
        password: str,
        ip_address: str | None = None,
    ) -> tuple[TokenResponse, str]:
        if not self._settings.auth.allow_password_login:
            raise ForbiddenError("Password login is disabled. Use SSO.")

        if await self._is_sso_only_mode_enabled():
            # In SSO-only mode, only admins can use password login
            user = await self._users.get_by_email(email)
            if not user or user.role != UserRole.ADMIN:
                raise ForbiddenError("SSO-only mode is enabled. Use GitHub SSO to log in.")

        user = await self._users.get_by_email(email)
        if not user or not user.password_hash or not user.is_active:
            raise UnauthorizedError("Invalid email or password")

        try:
            _hasher.verify(user.password_hash, password)
        except VerifyMismatchError:
            raise UnauthorizedError("Invalid email or password") from None

        # Rehash if argon2 params changed
        if _hasher.check_needs_rehash(user.password_hash):
            user.password_hash = _hasher.hash(password)
            await self._users.update(user)

        # Password login: issue unverified token — secret key guard follows
        token_response, refresh_token = await self._create_tokens(user, verified=False)
        await self._log_action(
            user_id="",
            user_email=email,
            action="login",
            resource_type="user",
            ip_address=ip_address,
        )
        return token_response, refresh_token

    async def _is_sso_only_mode_enabled(self) -> bool:
        if self._settings_service is None:
            return self._settings.auth.sso_only_mode

        config = await self._settings_service.get_sso_config()
        return config.sso_only_mode

    async def verify_secret_key(
        self,
        user: CurrentUser,
        secret_key: str,
    ) -> tuple[TokenResponse, str]:
        """Verify the user's secret key and issue a fully verified token."""
        if not user.secret_key:
            raise UnauthorizedError("No secret key configured for this user")
        if not secrets.compare_digest(user.secret_key, secret_key):
            raise UnauthorizedError("Invalid secret key")
        # Revoke all existing refresh tokens before issuing new verified ones
        # to prevent stale unverified tokens from being reused
        await self._tokens.revoke_all_for_user(user.id)
        return await self._create_tokens(user, verified=True)

    async def reset_secret_key(self, user_id: str) -> str:
        """Reset a user's secret key. Returns the new key."""
        user = await self._users.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", user_id)
        user.secret_key = _generate_secret_key()
        await self._users.update(user)
        return user.secret_key

    async def authenticate_github(
        self, github_user: GitHubUser,
    ) -> tuple[UserModel, TokenResponse, str]:
        """Authenticate or create a user via GitHub SSO. Returns (user, tokens, refresh).

        Security model:
        - Already linked (by SSO ID): login directly
        - Existing user (by email, not linked): auto-link is safe because this is
          invite-only — every user in the DB was created via invite or as bootstrap admin.
          C2 (below) ensures no uninvited user can exist.
        - New user: require a pending invite (same gate as password registration)
        """
        # Look up by SSO ID first (already linked — login directly)
        user = await self._users.get_by_sso("github", str(github_user.github_id))

        if not user:
            existing = await self._users.get_by_email(github_user.email)
            if existing:
                # User exists (was invited/created legitimately) — link their GitHub
                existing.sso_provider = "github"
                existing.sso_id = str(github_user.github_id)
                existing.github_id = github_user.github_id
                existing.avatar_url = github_user.avatar_url
                await self._users.update(existing)
                user = existing
            else:
                # New user — enforce invite-only (same as password registration)
                existing_users = await self._users.list_all()
                if len(existing_users) == 0:
                    # Bootstrap: first user becomes admin
                    user = UserModel(
                        id=new_id(),
                        email=github_user.email,
                        display_name=github_user.name or github_user.email,
                        role=UserRole.ADMIN,
                        sso_provider="github",
                        sso_id=str(github_user.github_id),
                        github_id=github_user.github_id,
                        avatar_url=github_user.avatar_url,
                    )
                    user = await self._users.create(user)
                else:
                    # Require invite for new SSO users (C2 fix)
                    if not self._invites:
                        raise ForbiddenError(
                            "Registration requires an invite. Contact your admin."
                        )
                    invite = await self._invites.get_by_email(github_user.email)
                    if not invite:
                        raise ForbiddenError(
                            "Registration requires an invite. Contact your admin."
                        )
                    user = UserModel(
                        id=new_id(),
                        email=github_user.email,
                        display_name=github_user.name or github_user.email,
                        role=invite.role,
                        sso_provider="github",
                        sso_id=str(github_user.github_id),
                        github_id=github_user.github_id,
                        avatar_url=github_user.avatar_url,
                    )
                    user = await self._users.create(user)
                    invite.accepted_at = utc_now()

        if not user.is_active:
            raise ForbiddenError("User account is deactivated")

        token_response, refresh_token = await self._create_tokens(user)
        return user, token_response, refresh_token

    async def refresh(
        self,
        refresh_token: str,
        *,
        current_verified: bool = True,
    ) -> tuple[TokenResponse, str]:
        token_hash = _hash_token(refresh_token)
        stored = await self._tokens.get_by_hash(token_hash)

        if not stored:
            raise UnauthorizedError("Invalid refresh token")

        if stored.expires_at < utc_now():
            raise UnauthorizedError("Refresh token expired")

        user = await self._users.get_by_id(stored.user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or inactive")

        # Rotate: revoke old, issue new (preserve verified status)
        stored.revoked = True
        return await self._create_tokens(user, verified=current_verified)

    async def logout(
        self,
        user_id: str,
        user_email: str,
        ip_address: str | None = None,
    ) -> None:
        await self._tokens.revoke_all_for_user(user_id)
        await self._log_action(
            user_id=user_id,
            user_email=user_email,
            action="logout",
            resource_type="user",
            ip_address=ip_address,
        )

    async def list_users(self) -> list[UserModel]:
        return await self._users.list_all()

    async def update_user(
        self,
        user_id: str,
        update: UpdateUserRequest,
        current_user_id: str,
    ) -> UserModel:
        user = await self._users.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", user_id)

        if user_id == current_user_id and (update.role is not None or update.is_active is not None):
            raise ForbiddenError("Cannot modify your own role or active status")

        if update.display_name is not None:
            user.display_name = update.display_name
        if update.role is not None:
            user.role = update.role
        if update.is_active is not None:
            user.is_active = update.is_active

        return await self._users.update(user)

    def create_access_token(
        self,
        user: UserModel | CurrentUser,
        *,
        verified: bool = True,
    ) -> str:
        now = utc_now()
        payload = {
            "sub": user.id,
            "email": user.email,
            "role": user.role,
            "verified": verified,
            "iat": now,
            "exp": now + timedelta(minutes=self._settings.auth.access_token_expire_minutes),
        }
        return jwt.encode(payload, self._settings.auth.secret_key, algorithm="HS256")

    @property
    def refresh_token_expire_days(self) -> int:
        return self._settings.auth.refresh_token_expire_days

    def decode_access_token(self, token: str) -> TokenPayload:
        try:
            data = jwt.decode(token, self._settings.auth.secret_key, algorithms=["HS256"])
            sub = data.get("sub")
            email = data.get("email")
            role = data.get("role")
            verified = data.get("verified", True)
            if not sub or not email or not role:
                raise UnauthorizedError("Invalid token: missing claims")
            return TokenPayload(
                sub=str(sub),
                email=str(email),
                role=UserRole(str(role)),
                verified=bool(verified),
            )
        except ValueError:
            raise UnauthorizedError("Invalid token: unknown role") from None
        except jwt.ExpiredSignatureError:
            raise UnauthorizedError("Token expired") from None
        except jwt.InvalidTokenError:
            raise UnauthorizedError("Invalid token") from None

    async def create_tokens_for_user(self, user: UserModel) -> tuple[TokenResponse, str]:
        """Public wrapper for token creation (used by register + SSO routes)."""
        return await self._create_tokens(user)

    # ── Invite management ────────────────────────────────────

    async def create_invite(
        self,
        email: str,
        role: UserRole,
        invited_by: str,
        invited_by_email: str,
        base_url: str,
        ip_address: str | None = None,
    ) -> tuple[InviteModel, str]:
        """Create an invite. Returns (invite, full_invite_url)."""
        if not self._invites:
            raise ForbiddenError("Invite system not initialized")

        existing_user = await self._users.get_by_email(email)
        if existing_user:
            raise ConflictError(f"User with email {email} already exists")

        token = secrets.token_urlsafe(48)
        invite = InviteModel(
            id=new_id(),
            email=email,
            token_hash=_hash_token(token),
            role=role,
            invited_by=invited_by,
            expires_at=utc_now() + timedelta(days=7),
        )
        invite = await self._invites.create(invite)
        invite_url = f"{base_url}/register?token={token}"
        await self._log_action(
            user_id=invited_by,
            user_email=invited_by_email,
            action="invite_user",
            resource_type="invite",
            resource_id=invite.id,
            details=f"Invited {email} as {role}",
            ip_address=ip_address,
        )
        return invite, invite_url

    async def list_pending_invites(self) -> list[InviteModel]:
        if not self._invites:
            return []
        return await self._invites.list_pending()

    async def revoke_invite(self, invite_id: str) -> None:
        if not self._invites:
            raise ForbiddenError("Invite system not initialized")
        await self._invites.delete(invite_id)

    async def _validate_invite(self, token: str, email: str) -> InviteModel:
        if not self._invites:
            raise ForbiddenError("Invite system not initialized")
        invite = await self._invites.get_by_token_hash(_hash_token(token))
        if not invite:
            raise ForbiddenError("Invalid or expired invite token")
        if invite.expires_at < utc_now():
            raise ForbiddenError("Invite token has expired")
        if invite.email.lower() != email.lower():
            raise ForbiddenError("Invite token does not match this email")
        return invite

    async def _create_tokens(
        self,
        user: UserModel | CurrentUser,
        *,
        verified: bool = True,
    ) -> tuple[TokenResponse, str]:
        access_token = self.create_access_token(user, verified=verified)
        refresh_token = secrets.token_urlsafe(64)

        refresh_model = RefreshTokenModel(
            id=new_id(),
            user_id=user.id,
            token_hash=_hash_token(refresh_token),
            expires_at=utc_now() + timedelta(days=self._settings.auth.refresh_token_expire_days),
        )
        await self._tokens.create(refresh_model)

        token_response = TokenResponse(
            access_token=access_token,
            expires_in=self._settings.auth.access_token_expire_minutes * 60,
        )
        return token_response, refresh_token

    async def _log_action(
        self,
        *,
        user_id: str,
        user_email: str,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        details: str | None = None,
        ip_address: str | None = None,
    ) -> None:
        if self._audit is None:
            return

        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_secret_key() -> str:
    """Generate a short, human-friendly secret key (12 chars, alphanumeric)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(12))
