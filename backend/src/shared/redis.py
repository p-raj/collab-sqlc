from __future__ import annotations

from typing import TYPE_CHECKING

from redis.asyncio import Redis

if TYPE_CHECKING:
    from src.shared.config import AppSettings

_redis: Redis | None = None


def create_redis_connection(settings: AppSettings) -> Redis:
    return Redis.from_url(settings.redis.url, decode_responses=True)


async def init_redis(settings: AppSettings) -> Redis:
    global _redis
    _redis = create_redis_connection(settings)
    await _redis.ping()  # type: ignore[misc]
    return _redis


def get_redis_connection(settings: AppSettings | None = None) -> Redis:
    if _redis is not None:
        return _redis
    if settings is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return create_redis_connection(settings)


def get_redis() -> Redis:
    return get_redis_connection()


def get_redis_conn(settings: AppSettings | None = None) -> Redis:
    return get_redis_connection(settings)


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None
