"""Open CoDB — FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

import orjson
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from loguru import logger
from starlette.responses import JSONResponse

from src.connections.service.ssh_tunnel import close_all_tunnels
from src.shared.config import AppSettings, get_settings
from src.shared.database import close_engine, init_engine
from src.shared.middleware.error_handler import ErrorHandlerMiddleware
from src.shared.middleware.logging import setup_logging
from src.shared.redis import close_redis, init_redis

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings: AppSettings = app.state.settings

    setup_logging(debug=settings.debug)
    logger.info("Starting Open CoDB")

    if settings.auth.secret_key == "change-me-in-production":
        if settings.debug:
            logger.warning("⚠️  AUTH_SECRET_KEY is using the default value — set a secure key!")
        else:
            raise SystemExit(
                "FATAL: AUTH_SECRET_KEY is the default value. "
                "Set a secure key before running in production."
            )
    if settings.encryption.key == "change-me-in-production":
        if settings.debug:
            logger.warning("⚠️  ENCRYPTION_KEY is using the default value — set a secure key!")
        else:
            raise SystemExit(
                "FATAL: ENCRYPTION_KEY is the default value. "
                "Set a secure key before running in production."
            )

    init_engine(settings)
    await init_redis(settings)
    logger.info("Database and Redis connected")

    yield

    await close_all_tunnels()
    await close_redis()
    await close_engine()
    logger.info("Shutdown complete")


def create_app(settings: AppSettings | None = None) -> FastAPI:
    if settings is None:
        settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.debug else None,
        redoc_url=None,
        default_response_class=ORJSONResponse,
    )
    app.state.settings = settings

    # Middleware — order matters (last added = first executed)
    app.add_middleware(ErrorHandlerMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )

    _register_routes(app)

    return app


def _register_routes(app: FastAPI) -> None:
    """Register all domain API routers."""
    from src.admin.api.routes import router as audit_router
    from src.assistant.api.routes import router as assistant_router
    from src.auth.api.routes import admin_router as auth_admin_router
    from src.auth.api.routes import router as auth_router
    from src.connections.api.routes import router as connections_router
    from src.editor.api.routes import router as editor_router
    from src.history.api.routes import router as history_router
    from src.queries.api.routes import folder_router
    from src.queries.api.routes import router as saved_queries_router
    from src.query_api.api.public_routes import router as query_api_public_router
    from src.query_api.api.routes import router as query_api_router
    from src.schema.api.routes import router as schema_router
    from src.shared.api.health import router as health_router

    app.include_router(health_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(auth_admin_router, prefix="/api")
    app.include_router(connections_router, prefix="/api")
    app.include_router(editor_router, prefix="/api")
    app.include_router(history_router, prefix="/api")
    app.include_router(schema_router, prefix="/api")
    app.include_router(saved_queries_router, prefix="/api")
    app.include_router(folder_router, prefix="/api")
    app.include_router(audit_router, prefix="/api")
    app.include_router(assistant_router, prefix="/api")
    app.include_router(query_api_router)
    app.include_router(query_api_public_router)


class ORJSONResponse(JSONResponse):
    """Use orjson for all JSON responses — 10x faster than stdlib json."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(content) if content is not None else b""
