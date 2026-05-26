"""GitHub SSO service — handles OAuth App and GitHub App user login flows."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import TYPE_CHECKING
from urllib.parse import urlencode

import httpx

from src.shared.config import GitHubLoginMechanism
from src.shared.domain.errors import UnauthorizedError

if TYPE_CHECKING:
    from redis.asyncio import Redis

    from src.shared.config import AppSettings

_GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GITHUB_USER_URL = "https://api.github.com/user"
_GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
_GITHUB_OAUTH_SCOPE = "read:user user:email"


@dataclass(frozen=True, slots=True)
class GitHubUser:
    github_id: int
    email: str
    name: str
    avatar_url: str


class SSOService:
    def __init__(self, settings: AppSettings, redis: Redis) -> None:
        self._settings = settings
        self._redis = redis

    async def create_github_authorize_url(self) -> str:
        state = secrets.token_urlsafe(32)
        await self._redis.setex(f"oauth_state:{state}", 600, "1")
        return self.get_github_authorize_url(state)

    async def exchange_github_callback(self, code: str, state: str) -> GitHubUser:
        state_key = f"oauth_state:{state}"
        stored = await self._redis.getdel(state_key)
        if not stored:
            raise UnauthorizedError("Invalid or expired OAuth state — please try again")

        return await self.exchange_github_code(code)

    def get_github_authorize_url(self, state: str) -> str:
        params = {
            "client_id": self._settings.github_sso.client_id,
            "redirect_uri": self._settings.github_sso.redirect_uri,
            "state": state,
        }
        if self._settings.github_sso.login_mechanism == GitHubLoginMechanism.OAUTH_APP:
            params["scope"] = _GITHUB_OAUTH_SCOPE
        return f"{_GITHUB_AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_github_code(self, code: str) -> GitHubUser:
        access_token = await self._exchange_code_for_token(code)
        return await self._fetch_github_user(access_token)

    async def _exchange_code_for_token(self, code: str) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                _GITHUB_TOKEN_URL,
                data={
                    "client_id": self._settings.github_sso.client_id,
                    "client_secret": self._settings.github_sso.client_secret,
                    "code": code,
                    "redirect_uri": self._settings.github_sso.redirect_uri,
                },
                headers={"Accept": "application/json"},
            )

        if resp.status_code != 200:
            raise UnauthorizedError("Failed to exchange GitHub authorization code")

        data = resp.json()
        token = data.get("access_token")
        if not token:
            error = data.get("error_description", "Unknown error")
            raise UnauthorizedError(f"GitHub OAuth error: {error}")

        return str(token)

    async def _fetch_github_user(self, access_token: str) -> GitHubUser:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient() as client:
            user_resp = await client.get(_GITHUB_USER_URL, headers=headers)
            if user_resp.status_code != 200:
                raise UnauthorizedError("Failed to fetch GitHub user info")

            user_data = user_resp.json()

            email = user_data.get("email") or ""
            if not email:
                email_resp = await client.get(_GITHUB_EMAILS_URL, headers=headers)
                if email_resp.status_code == 200:
                    for entry in email_resp.json():
                        if entry.get("primary") and entry.get("verified"):
                            email = entry["email"]
                            break

        if not email:
            raise UnauthorizedError(
                "No verified email found on GitHub account. "
                "Please add a verified email to your GitHub profile."
            )

        return GitHubUser(
            github_id=int(user_data["id"]),
            email=email,
            name=user_data.get("name") or user_data.get("login", ""),
            avatar_url=user_data.get("avatar_url", ""),
        )
