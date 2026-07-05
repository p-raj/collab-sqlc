"""Schema domain dependency wiring."""

from typing import Annotated

from fastapi import Depends

from src.connections.api.dependencies import get_connection_service
from src.connections.service.connection_service import ConnectionService
from src.schema.service.schema_service import SchemaService
from src.shared.config import AppSettings, get_settings
from src.shared.redis import get_redis_connection


def get_schema_service(
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> SchemaService:
    return SchemaService(
        connection_service=conn_service,
        redis=get_redis_connection(settings),
        cache_ttl=settings.redis.schema_cache_ttl,
        dynamodb_cache_ttl=settings.redis.dynamodb_schema_cache_ttl,
    )
