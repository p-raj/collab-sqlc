"""Admin routes for Query-as-API management."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.api.dependencies import get_current_user, require_editor_or_admin
from src.auth.domain.schemas import CurrentUser
from src.connections.api.dependencies import get_connection_service
from src.connections.service.connection_service import ConnectionService
from src.editor.api.dependencies import get_query_executor
from src.editor.service.query_executor import QueryExecutor
from src.query_api.domain.schemas import (
    APIQueryDetail,
    APIQueryListItem,
    EnableAPIRequest,
    EnableAPIResponse,
    ExecutionLogDetail,
    RotateKeyResponse,
    TestExecuteRequest,
    UpdateAPIConfigRequest,
)
from src.query_api.service.query_api_service import QueryAPIService
from src.shared.database import get_session

router = APIRouter(prefix="/api/query-api", tags=["query-api"])


def _get_service(
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    query_executor: Annotated[QueryExecutor, Depends(get_query_executor)],
) -> QueryAPIService:
    return QueryAPIService(
        connection_service=conn_service,
        query_executor=query_executor,
    )


@router.get("/")
async def list_api_queries(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[APIQueryListItem]:
    """List all API-enabled queries. Visible to all roles."""
    queries = await service.list_api_queries(session, user.id, user.role)
    return [
        APIQueryListItem(
            id=q.id,
            title=q.title,
            sql_preview=q.sql[:100] if q.sql else "",
            api_enabled=q.api_enabled,
            api_key_prefix=q.api_key_prefix,
            api_parameters=q.api_parameters,
            api_row_limit=q.api_row_limit,
            api_rate_limit=q.api_rate_limit,
            api_notes=q.api_notes,
            is_shared=q.is_shared,
            has_sql_drift=q.sql != q.api_published_sql if q.api_published_sql else False,
            created_by=q.created_by,
            updated_at=q.updated_at,
        )
        for q in queries
    ]


@router.post("/{query_id}/enable")
async def enable_api(
    query_id: str,
    body: EnableAPIRequest,
    user: Annotated[CurrentUser, Depends(require_editor_or_admin)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> EnableAPIResponse:
    """Enable API hosting on a saved query. Returns the API key (shown once)."""
    config = body.model_dump(exclude_none=True) if body else None
    plaintext, prefix = await service.enable_api(session, query_id, user.id, user.role, config)
    await session.commit()
    return EnableAPIResponse(api_key=plaintext, api_key_prefix=prefix)


@router.post("/{query_id}/disable")
async def disable_api(
    query_id: str,
    user: Annotated[CurrentUser, Depends(require_editor_or_admin)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    """Disable API hosting. Query remains shared with team."""
    await service.disable_api(session, query_id, user.id, user.role)
    await session.commit()
    return {"message": "API hosting disabled. Query remains shared with team."}


@router.put("/{query_id}/config")
async def update_config(
    query_id: str,
    body: UpdateAPIConfigRequest,
    user: Annotated[CurrentUser, Depends(require_editor_or_admin)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    """Update API configuration (params, limits, IPs, notes)."""
    await service.update_config(
        session,
        query_id,
        user.id,
        user.role,
        body.model_dump(exclude_none=True),
    )
    await session.commit()
    return {"message": "API configuration updated."}


@router.post("/{query_id}/rotate")
async def rotate_key(
    query_id: str,
    user: Annotated[CurrentUser, Depends(require_editor_or_admin)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RotateKeyResponse:
    """Rotate API key. Old key stops working immediately."""
    plaintext, prefix = await service.rotate_key(session, query_id, user.id, user.role)
    await session.commit()
    return RotateKeyResponse(api_key=plaintext, api_key_prefix=prefix)


@router.post("/{query_id}/republish")
async def republish(
    query_id: str,
    user: Annotated[CurrentUser, Depends(require_editor_or_admin)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    """Republish: update hosted SQL to current editor SQL."""
    await service.republish(session, query_id, user.id, user.role)
    await session.commit()
    return {"message": "Query SQL republished to API."}


@router.post("/{query_id}/test")
async def test_execute(
    query_id: str,
    body: TestExecuteRequest,
    user: Annotated[CurrentUser, Depends(require_editor_or_admin)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Dry-run execution with specified connection and params (admin/editor only)."""
    return await service.test_execute(
        session=session,
        query_id=query_id,
        connection_id=body.connection_id,
        user_id=user.id,
        user_role=user.role,
        params=body.params,
    )


@router.get("/logs")
async def get_all_execution_logs(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Get all API execution logs. Visible to all team members."""
    return await service.get_execution_logs(
        session,
        user_id=user.id,
        user_role=user.role,
        limit=limit,
        offset=offset,
    )


@router.get("/logs/{execution_id}")
async def get_execution_log_detail(
    execution_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExecutionLogDetail:
    """Get the full payload for replaying a single API execution log."""
    return ExecutionLogDetail(
        **(
            await service.get_execution_log_detail(
                session,
                execution_id,
                user.id,
                user.role,
            )
        )
    )


@router.get("/{query_id}")
async def get_api_query_detail(
    query_id: str,
    user: Annotated[CurrentUser, Depends(require_editor_or_admin)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> APIQueryDetail:
    """Get detailed API configuration for a saved query."""
    return APIQueryDetail(
        **(await service.get_api_query_detail(session, query_id, user.id, user.role))
    )


@router.get("/{query_id}/logs")
async def get_execution_logs(
    query_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Get API execution logs for a query. Visible to all team members."""
    return await service.get_execution_logs(
        session,
        query_id=query_id,
        user_id=user.id,
        user_role=user.role,
        limit=limit,
        offset=offset,
    )
