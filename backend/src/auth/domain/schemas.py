"""Auth domain Pydantic schemas — API boundary types."""

from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import EmailStr, Field

from src.shared.domain.schemas import ApiSchema
from src.shared.domain.types import UserRole

if TYPE_CHECKING:
    from src.auth.domain.models import UserModel


class LoginRequest(ApiSchema):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterRequest(ApiSchema):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(ApiSchema):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    requires_secret_key: bool = False


class UserResponse(ApiSchema):
    id: str
    email: str
    display_name: str
    role: UserRole
    is_active: bool
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    secret_key: str | None = None

    @classmethod
    def from_user(
        cls,
        user: "UserModel | CurrentUser",
        *,
        include_secret_key: bool = False,
    ) -> "UserResponse":
        return cls(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=UserRole(user.role),
            is_active=user.is_active,
            avatar_url=user.avatar_url,
            created_at=user.created_at,
            updated_at=user.updated_at,
            secret_key=user.secret_key if include_secret_key else None,
        )


class CurrentUser(ApiSchema):
    id: str
    email: str
    display_name: str
    role: UserRole
    is_active: bool
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    secret_key: str | None = None

    @classmethod
    def from_model(cls, user: "UserModel") -> "CurrentUser":
        return cls(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=UserRole(user.role),
            is_active=user.is_active,
            avatar_url=user.avatar_url,
            created_at=user.created_at,
            updated_at=user.updated_at,
            secret_key=user.secret_key,
        )


class UserListResponse(ApiSchema):
    items: list[UserResponse]


class UpdateUserRequest(ApiSchema):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None


class SSOCallbackRequest(ApiSchema):
    code: str = Field(min_length=1, max_length=2048)
    state: str = Field(min_length=1, max_length=256)


class SSOConfigResponse(ApiSchema):
    sso_enabled: bool
    sso_only_mode: bool


class InviteRequest(ApiSchema):
    email: EmailStr
    role: UserRole = UserRole.VIEWER


class InviteResponse(ApiSchema):
    id: str
    email: str
    role: UserRole
    invite_url: str
    expires_at: datetime


class InviteListResponse(ApiSchema):
    items: list["PendingInvite"]


class PendingInvite(ApiSchema):
    id: str
    email: str
    role: UserRole
    invited_by: str | None
    expires_at: datetime
    created_at: datetime


class AcceptInviteRequest(ApiSchema):
    token: str
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class VerifySecretKeyRequest(ApiSchema):
    secret_key: str = Field(min_length=1)


class ResetSecretKeyResponse(ApiSchema):
    secret_key: str
