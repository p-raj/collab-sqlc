"""Pydantic base schemas shared across API boundaries."""

from datetime import datetime

from pydantic import BaseModel


class ApiSchema(BaseModel):
    """Base for all API request/response models. Uses orjson for speed."""

    model_config = {
        "from_attributes": True,
        "json_encoders": {datetime: lambda v: v.isoformat()},
        "populate_by_name": True,
    }


class ApiResponse(ApiSchema):
    """Standard success wrapper."""

    success: bool = True


class ErrorResponse(BaseModel):
    error: str
    message: str


class PaginatedResponse[T](ApiSchema):
    """Cursor-based pagination wrapper."""

    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False
