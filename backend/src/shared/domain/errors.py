"""Typed error responses for the entire application."""

from dataclasses import dataclass


@dataclass(frozen=True)
class AppError(Exception):
    message: str
    code: str
    status_code: int = 400


class NotFoundError(AppError):
    def __init__(self, resource: str, identifier: str) -> None:
        super().__init__(
            message=f"{resource} not found: {identifier}",
            code="not_found",
            status_code=404,
        )


class ForbiddenError(AppError):
    def __init__(self, reason: str = "Access denied") -> None:
        super().__init__(
            message=reason,
            code="forbidden",
            status_code=403,
        )


class UnauthorizedError(AppError):
    def __init__(self, reason: str = "Authentication required") -> None:
        super().__init__(
            message=reason,
            code="unauthorized",
            status_code=401,
        )


class ConflictError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message=message,
            code="conflict",
            status_code=409,
        )


class ValidationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message=message,
            code="validation_error",
            status_code=422,
        )
