"""Taskiq broker configuration for background query jobs."""

from __future__ import annotations

from typing import Any

from taskiq import TaskiqEvents
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from src.shared.config import get_settings
from src.shared.database import close_engine, init_engine
from src.shared.middleware.logging import setup_logging
from src.shared.redis import close_redis, init_redis

settings = get_settings()

broker = RedisStreamBroker(settings.redis.url).with_result_backend(
    RedisAsyncResultBackend(settings.redis.url)
)


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def on_worker_startup(state: Any) -> None:
    worker_settings = get_settings()
    setup_logging(debug=worker_settings.debug)
    init_engine(worker_settings)
    await init_redis(worker_settings)
    state.settings = worker_settings


@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def on_worker_shutdown(_state: Any) -> None:
    await close_redis()
    await close_engine()
