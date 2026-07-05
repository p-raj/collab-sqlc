"""Run history domain schemas — API boundary types."""

from datetime import datetime
from enum import StrEnum
from typing import Any

from src.shared.domain.schemas import ApiSchema


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class RunSource(StrEnum):
    EDITOR = "editor"
    QUERY_API = "query_api"


class RunHistoryResponse(ApiSchema):
    id: str
    user_id: str
    user_display_name: str | None = None
    user_email: str | None = None
    connection_id: str
    sql: str
    status: str
    source: str = RunSource.EDITOR
    operation_language: str | None = None
    result_shape: str = "tabular"
    backend_pid: int | None = None
    backend_query_id: str | None = None
    timeout_seconds: int | None = None
    max_rows: int | None = None
    api_query_id: str | None = None
    caller_ip: str | None = None
    row_count: int | None
    execution_time_ms: float | None
    error_message: str | None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    cancellation_requested_at: datetime | None = None
    created_at: datetime


class RunHistoryListResponse(ApiSchema):
    items: list[RunHistoryResponse]
    total: int
    has_more: bool


class RunSubmitResponse(ApiSchema):
    run_id: str
    status: str


class RunResultResponse(ApiSchema):
    columns: list[str]
    column_types: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: float
    truncated: bool = False
    result_shape: str = "tabular"
    data: dict[str, Any] | list[Any] | str | int | float | bool | None = None


class CancelRunResponse(ApiSchema):
    cancelled: bool
