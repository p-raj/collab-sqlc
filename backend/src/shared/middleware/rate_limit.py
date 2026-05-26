"""Redis-based rate limiting for API endpoints."""

from fastapi import Request
from redis.asyncio import Redis

from src.shared.domain.errors import AppError
from src.shared.redis import get_redis


class RateLimitExceededError(AppError):
    """Raised when rate limit is exceeded."""
    retry_after: int

    def __init__(self, retry_after: int) -> None:
        super().__init__(
            message=f"Too many requests. Try again in {retry_after} seconds.",
            code="rate_limit_exceeded",
            status_code=429,
        )
        # AppError is frozen — use object.__setattr__ to bypass
        object.__setattr__(self, "retry_after", retry_after)


def _get_client_ip(request: Request) -> str:
    """Get client IP from ASGI scope. Do NOT trust X-Forwarded-For without a trusted proxy."""
    return request.client.host if request.client else "unknown"


async def _check_rate_limit(
    redis: Redis, key: str, max_requests: int, window_seconds: int,
) -> None:
    """Sliding window counter using Redis INCR + EXPIRE."""
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)
    if current > max_requests:
        ttl = await redis.ttl(key)
        raise RateLimitExceededError(retry_after=max(ttl, 1))


async def rate_limit_login(request: Request) -> None:
    """10 login attempts per minute per IP."""
    ip = _get_client_ip(request)
    redis = get_redis()
    await _check_rate_limit(redis, f"rl:login:{ip}", max_requests=10, window_seconds=60)


async def rate_limit_register(request: Request) -> None:
    """5 registration attempts per 10 minutes per IP."""
    ip = _get_client_ip(request)
    redis = get_redis()
    await _check_rate_limit(redis, f"rl:register:{ip}", max_requests=5, window_seconds=600)


async def rate_limit_verify_key(request: Request) -> None:
    """5 secret key attempts per minute per IP."""
    ip = _get_client_ip(request)
    redis = get_redis()
    await _check_rate_limit(redis, f"rl:verify:{ip}", max_requests=5, window_seconds=60)
