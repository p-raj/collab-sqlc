"""Connection domain schemas — API boundary types."""

from datetime import datetime
from typing import TYPE_CHECKING, Any

from pydantic import Field, model_validator

from src.connections.engine_registry import SUPPORTED_DATABASE_ENGINE_PATTERN
from src.shared.domain.schemas import ApiSchema

if TYPE_CHECKING:
    from src.connections.domain.models import ConnectionModel


class ConnectionCreateRequest(ApiSchema):
    name: str = Field(min_length=1, max_length=255)
    db_type: str = Field(pattern=SUPPORTED_DATABASE_ENGINE_PATTERN)
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(gt=0, le=65535)
    database: str = Field(min_length=1, max_length=255)
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)

    ssl_enabled: bool = False
    ssl_ca: str | None = None
    ssl_cert: str | None = None
    ssl_key: str | None = None

    ssh_enabled: bool = False
    ssh_host: str | None = None
    ssh_port: int | None = Field(default=None, gt=0, le=65535)
    ssh_username: str | None = None
    ssh_private_key: str | None = None

    max_concurrent_queries: int = Field(default=5, ge=1, le=50)
    query_timeout_seconds: int = Field(default=300, ge=1, le=3600)
    safe_mode: bool = True
    is_shared: bool = False
    dbml_context: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_ssl_certificate_pair(self) -> "ConnectionCreateRequest":
        if not self.ssl_enabled:
            return self
        if bool(self.ssl_cert) != bool(self.ssl_key):
            raise ValueError("SSL client certificate and key must be provided together")
        if (self.ssl_cert or self.ssl_key) and not self.ssl_ca:
            raise ValueError("SSL CA certificate is required when client certificates are used")
        return self


class ConnectionUpdateRequest(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    host: str | None = Field(default=None, min_length=1, max_length=255)
    port: int | None = Field(default=None, gt=0, le=65535)
    database: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=1)

    ssl_enabled: bool | None = None
    ssl_ca: str | None = None
    ssl_cert: str | None = None
    ssl_key: str | None = None

    ssh_enabled: bool | None = None
    ssh_host: str | None = None
    ssh_port: int | None = Field(default=None, gt=0, le=65535)
    ssh_username: str | None = None
    ssh_private_key: str | None = None

    max_concurrent_queries: int | None = Field(default=None, ge=1, le=50)
    query_timeout_seconds: int | None = Field(default=None, ge=1, le=3600)
    safe_mode: bool | None = None
    is_shared: bool | None = None
    dbml_context: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_ssl_certificate_pair(self) -> "ConnectionUpdateRequest":
        if self.ssl_enabled is False:
            return self
        if bool(self.ssl_cert) != bool(self.ssl_key):
            raise ValueError("SSL client certificate and key must be provided together")
        return self


class ConnectionResponse(ApiSchema):
    id: str
    name: str
    db_type: str
    host: str
    port: int
    database: str
    username: str
    ssl_enabled: bool
    has_ssl_certificates: bool
    has_ssl_ca: bool
    has_ssl_client_certificates: bool
    ssh_enabled: bool
    ssh_host: str | None = None
    ssh_port: int | None = None
    ssh_username: str | None = None
    is_shared: bool
    max_concurrent_queries: int
    query_timeout_seconds: int
    safe_mode: bool
    created_by: str
    dbml_context: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, connection: "ConnectionModel") -> "ConnectionResponse":
        return cls(
            id=connection.id,
            name=connection.name,
            db_type=connection.db_type,
            host=connection.host,
            port=connection.port,
            database=connection.database,
            username=connection.username,
            ssl_enabled=connection.ssl_enabled,
            has_ssl_certificates=bool(
                connection.ssl_ca or connection.ssl_cert or connection.ssl_key
            ),
            has_ssl_ca=bool(connection.ssl_ca),
            has_ssl_client_certificates=bool(connection.ssl_cert and connection.ssl_key),
            ssh_enabled=connection.ssh_enabled,
            ssh_host=connection.ssh_host,
            ssh_port=connection.ssh_port,
            ssh_username=connection.ssh_username,
            is_shared=connection.is_shared,
            max_concurrent_queries=connection.max_concurrent_queries,
            query_timeout_seconds=connection.query_timeout_seconds,
            safe_mode=connection.safe_mode,
            created_by=connection.created_by,
            dbml_context=connection.dbml_context,
            created_at=connection.created_at,
            updated_at=connection.updated_at,
        )


class ConnectionListResponse(ApiSchema):
    items: list[ConnectionResponse]


class TestConnectionRequest(ApiSchema):
    db_type: str = Field(pattern=SUPPORTED_DATABASE_ENGINE_PATTERN)
    host: str
    port: int = Field(gt=0, le=65535)
    database: str
    username: str
    password: str
    ssl_enabled: bool = False
    ssl_ca: str | None = None
    ssl_cert: str | None = None
    ssl_key: str | None = None

    @model_validator(mode="after")
    def validate_ssl_certificate_pair(self) -> "TestConnectionRequest":
        if not self.ssl_enabled:
            return self
        if bool(self.ssl_cert) != bool(self.ssl_key):
            raise ValueError("SSL client certificate and key must be provided together")
        if (self.ssl_cert or self.ssl_key) and not self.ssl_ca:
            raise ValueError("SSL CA certificate is required when client certificates are used")
        return self


class TestConnectionResponse(ApiSchema):
    success: bool
    message: str
