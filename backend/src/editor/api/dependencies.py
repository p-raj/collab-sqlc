"""Editor domain dependency wiring."""

from typing import Annotated

from fastapi import Depends

from src.connections.api.dependencies import get_connection_service
from src.connections.service.connection_service import ConnectionService
from src.editor.service.query_executor import QueryExecutor


def get_query_executor(
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> QueryExecutor:
    return QueryExecutor(conn_service)
