from enum import StrEnum
from functools import lru_cache

from pydantic_settings import BaseSettings


class GitHubLoginMechanism(StrEnum):
    OAUTH_APP = "oauthapp"
    GITHUB_APP = "githubapp"


class DatabaseSettings(BaseSettings):
    url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/collabsql"
    pool_size: int = 20
    max_overflow: int = 10
    pool_timeout: int = 30

    model_config = {"env_prefix": "DB_"}


class RedisSettings(BaseSettings):
    url: str = "redis://localhost:6379/0"
    schema_cache_ttl: int = 300
    dynamodb_schema_cache_ttl: int = 86400

    model_config = {"env_prefix": "REDIS_"}


class GitHubSSOSettings(BaseSettings):
    app_id: str = ""
    client_id: str = ""
    client_secret: str = ""
    private_key: str = ""
    login_mechanism: GitHubLoginMechanism = GitHubLoginMechanism.GITHUB_APP
    redirect_uri: str = "http://localhost:5173/auth/github/callback"

    model_config = {"env_prefix": "GITHUB_"}


class AuthSettings(BaseSettings):
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    allow_password_login: bool = True
    sso_enabled: bool = False
    sso_only_mode: bool = False

    model_config = {"env_prefix": "AUTH_"}


class EncryptionSettings(BaseSettings):
    key: str = "change-me-in-production"

    model_config = {"env_prefix": "ENCRYPTION_"}


class AssistantSettings(BaseSettings):
    """Eylo SDK assistant configuration — stored for admin reference."""

    eylo_org_id: str = ""
    eylo_agent_id: str = ""

    model_config = {"env_prefix": "ASSISTANT_"}


class WorkerSettings(BaseSettings):
    concurrency: int = 10
    result_preview_rows: int = 1000
    sync_poll_interval_ms: int = 500

    model_config = {"env_prefix": "WORKER_"}


class AppSettings(BaseSettings):
    app_name: str = "Collab SQLC"
    debug: bool = False
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]

    db: DatabaseSettings = DatabaseSettings()
    redis: RedisSettings = RedisSettings()
    auth: AuthSettings = AuthSettings()
    encryption: EncryptionSettings = EncryptionSettings()
    github_sso: GitHubSSOSettings = GitHubSSOSettings()
    assistant: AssistantSettings = AssistantSettings()
    worker: WorkerSettings = WorkerSettings()

    model_config = {"env_prefix": "APP_"}


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
