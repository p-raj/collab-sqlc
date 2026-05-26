"""Run history domain schemas — API boundary types."""

from datetime import datetime

from src.shared.domain.schemas import ApiSchema


class RunHistoryResponse(ApiSchema):
    id: str
    user_id: str
    user_display_name: str | None = None
    user_email: str | None = None
    connection_id: str
    sql: str
    status: str
    row_count: int | None
    execution_time_ms: float | None
    error_message: str | None
    created_at: datetime


class RunHistoryListResponse(ApiSchema):
    items: list[RunHistoryResponse]
    total: int
    has_more: bool
