"""Pydantic DTOs for Query-as-API endpoints."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

# --- Parameter schema ---


class ParameterDef(BaseModel):
    name: str
    type: str = "any"  # string, integer, float, boolean, uuid, any
    required: bool = True
    default: Any | None = None


# --- Admin requests ---


class EnableAPIRequest(BaseModel):
    """Request to enable API hosting on a saved query."""

    parameters: list[ParameterDef] | None = None
    row_limit: int | None = None
    timeout_seconds: int | None = None
    rate_limit: int | None = None
    allowed_ips: list[str] | None = None
    notes: str | None = None


class UpdateAPIConfigRequest(BaseModel):
    """Update API configuration for a hosted query."""

    parameters: list[ParameterDef] | None = None
    row_limit: int | None = Field(default=None)
    timeout_seconds: int | None = Field(default=None)
    rate_limit: int | None = Field(default=None)
    allowed_ips: list[str] | None = None
    notes: str | None = None


class RepublishRequest(BaseModel):
    """Republish query SQL to the hosted API."""

    pass


class TestExecuteRequest(BaseModel):
    """Admin test execution with a specific connection."""

    connection_id: str
    params: dict[str, Any] = Field(default_factory=dict)


# --- Public execution ---


class ExecuteAPIRequest(BaseModel):
    """Public API execution request body."""

    params: dict[str, Any] = Field(default_factory=dict)


# --- Responses ---


class EnableAPIResponse(BaseModel):
    """Response after enabling API — includes the plaintext key (shown once)."""

    api_key: str
    api_key_prefix: str
    message: str = "API key generated. Store it securely — it will not be shown again."


class RotateKeyResponse(BaseModel):
    """Response after rotating API key."""

    api_key: str
    api_key_prefix: str
    message: str = "New API key generated. The previous key is now invalid."


class ExecuteAPIResponse(BaseModel):
    """Public API execution response."""

    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: int


class ExecuteAPIErrorResponse(BaseModel):
    """Error response for public API."""

    error: str
    message: str
    execution_id: str


class APIQueryListItem(BaseModel):
    """Item in the admin list of API-enabled queries."""

    id: str
    title: str
    sql_preview: str  # first 100 chars
    api_enabled: bool
    api_key_prefix: str | None
    api_parameters: list[dict[str, Any]] | None
    api_row_limit: int | None
    api_rate_limit: int | None
    api_notes: str | None
    is_shared: bool
    has_sql_drift: bool  # sql != api_published_sql
    created_by: str
    updated_at: datetime


class APIQueryDetail(BaseModel):
    """Detailed API configuration for a single saved query."""

    id: str
    title: str
    connection_id: str | None
    api_enabled: bool
    api_key_prefix: str | None
    api_parameters: list[ParameterDef] | None
    api_row_limit: int | None
    api_timeout_seconds: int | None
    api_rate_limit: int | None
    api_allowed_ips: list[str] | None
    api_notes: str | None
    is_shared: bool
    has_sql_drift: bool


class ExecutionLogItem(BaseModel):
    """Single entry in the API execution logs view."""

    id: str
    query_id: str
    query_title: str | None = None
    connection_id: str
    connection_name: str | None = None
    caller_ip: str
    status_code: int
    execution_time_ms: int | None
    params_sent: dict[str, Any] | None = None
    response_preview: dict[str, Any] | None = None  # truncated response
    error: str | None = None
    created_at: datetime


class ExecutionLogResponseData(BaseModel):
    """Stored result payload for replaying an API execution."""

    columns: list[str]
    column_types: list[str] = Field(default_factory=list)
    rows: list[list[Any]]
    row_count: int


class ExecutionLogDetail(BaseModel):
    """Detailed API execution log payload used for replaying a saved query."""

    id: str
    query_id: str
    query_title: str | None = None
    query_sql: str
    connection_id: str
    connection_name: str | None = None
    caller_ip: str
    status_code: int
    execution_time_ms: int | None
    params_sent: dict[str, Any] | None = None
    response_data: ExecutionLogResponseData | None = None
    error: str | None = None
    created_at: datetime
