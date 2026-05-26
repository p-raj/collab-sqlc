"""Error handling middleware — maps AppError to JSON responses."""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING, Any

import orjson
from fastapi import Request, Response
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from src.connections.engine_registry import is_engine_driver_error
from src.shared.domain.errors import AppError
from src.shared.middleware.rate_limit import RateLimitExceededError

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine


def _get_db_error_message(exc: Exception) -> tuple[str, int | None] | None:
    """Extract a user-facing message and optional error position from DB errors.

    Returns (message, position) where position is a 1-based character offset
    in the SQL string, or None if no DB error detected.
    """
    cls_name = type(exc).__name__
    # asyncpg PostgresError (syntax errors, constraint violations, etc.)
    if hasattr(exc, "sqlstate"):
        msg = str(exc)
        # asyncpg stores the error position as a string attribute
        position: int | None = None
        raw_pos = getattr(exc, "position", None)
        if raw_pos is not None:
            with contextlib.suppress(ValueError, TypeError):
                position = int(raw_pos)
        return (msg if msg else cls_name, position)
    if is_engine_driver_error(exc):
        return (str(exc) or cls_name, None)
    return None


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    async def dispatch(  # type: ignore[override]  # Starlette typing mismatch
        self,
        request: Request,
        call_next: Callable[[Request], Coroutine[Any, Any, Response]],
    ) -> Response:
        try:
            return await call_next(request)
        except AppError as e:
            headers: dict[str, str] = {}
            if isinstance(e, RateLimitExceededError):
                headers["Retry-After"] = str(e.retry_after)
            return Response(
                content=orjson.dumps({"error": e.code, "message": e.message}),
                status_code=e.status_code,
                media_type="application/json",
                headers=headers or None,
            )
        except Exception as exc:
            result = _get_db_error_message(exc)
            if result:
                db_msg, position = result
                payload: dict[str, Any] = {"error": "query_error", "message": db_msg}
                if position is not None:
                    payload["position"] = position
                return Response(
                    content=orjson.dumps(payload),
                    status_code=422,
                    media_type="application/json",
                )
            logger.exception("Unhandled error")
            return Response(
                content=orjson.dumps(
                    {"error": "internal_error", "message": "An unexpected error occurred"}
                ),
                status_code=500,
                media_type="application/json",
            )
