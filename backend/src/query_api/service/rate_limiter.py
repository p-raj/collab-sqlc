"""Per-query rate limiting for the public Query-as-API endpoint.

Uses Redis sliding window, keyed by query_id + caller IP.
Returns 429 with Retry-After header info when exceeded.
"""

from fastapi import Request

from src.shared.domain.errors import AppError
from src.shared.redis import get_redis


class QueryRateLimitError(AppError):
    """Raised when a query's rate limit is exceeded."""

    retry_after: int

    def __init__(self, retry_after: int) -> None:
        super().__init__(
            message=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            code="rate_limit_exceeded",
            status_code=429,
        )
        object.__setattr__(self, "retry_after", retry_after)


def get_caller_ip(request: Request) -> str:
    """Extract caller IP from request."""
    return request.client.host if request.client else "unknown"


async def check_query_rate_limit(
    query_id: str,
    caller_ip: str,
    max_requests_per_minute: int,
) -> None:
    """Check per-query rate limit (sliding window per query+IP).

    Args:
        query_id: The API query being called.
        caller_ip: Caller's IP address.
        max_requests_per_minute: Max allowed requests per minute.

    Raises:
        QueryRateLimitError: If limit is exceeded.
    """
    if max_requests_per_minute <= 0:
        return

    redis = get_redis()
    key = f"rl:query_api:{query_id}:{caller_ip}"
    window_seconds = 60

    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)

    if current > max_requests_per_minute:
        ttl = await redis.ttl(key)
        raise QueryRateLimitError(retry_after=max(ttl, 1))
