"""Connection API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from src.auth.api.dependencies import get_current_user
from src.auth.domain.schemas import CurrentUser
from src.connections.api.dependencies import get_connection_service
from src.connections.domain.schemas import (
    ConnectionCreateRequest,
    ConnectionListResponse,
    ConnectionResponse,
    ConnectionUpdateRequest,
    TestConnectionRequest,
    TestConnectionResponse,
)
from src.connections.service.connection_service import ConnectionService

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("", response_model=ConnectionResponse, status_code=201)
async def create_connection(
    body: ConnectionCreateRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> ConnectionResponse:
    conn = await service.create(
        body,
        user.id,
        user.email,
        request.client.host if request.client else None,
    )
    return ConnectionResponse.from_model(conn)


@router.get("", response_model=ConnectionListResponse)
async def list_connections(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> ConnectionListResponse:
    connections = await service.list_for_user(user.id)
    return ConnectionListResponse(items=[ConnectionResponse.from_model(c) for c in connections])


@router.get("/{connection_id}", response_model=ConnectionResponse)
async def get_connection(
    connection_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> ConnectionResponse:
    conn = await service.get_for_user(connection_id, user.id, user.role)
    return ConnectionResponse.from_model(conn)


@router.patch("/{connection_id}", response_model=ConnectionResponse)
async def update_connection(
    connection_id: str,
    body: ConnectionUpdateRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> ConnectionResponse:
    conn = await service.update(
        connection_id,
        body,
        user.id,
        user.role,
        user.email,
        request.client.host if request.client else None,
    )
    return ConnectionResponse.from_model(conn)


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(
    connection_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> None:
    await service.delete(
        connection_id,
        user.id,
        user.role,
        user.email,
        request.client.host if request.client else None,
    )


@router.post("/test", response_model=TestConnectionResponse)
async def test_connection(
    body: TestConnectionRequest,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> TestConnectionResponse:
    success, message = await service.test_connection(
        db_type=body.db_type,
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        password=body.password,
        ssl_enabled=body.ssl_enabled,
        ssl_ca=body.ssl_ca,
        ssl_cert=body.ssl_cert,
        ssl_key=body.ssl_key,
    )
    return TestConnectionResponse(success=success, message=message)
