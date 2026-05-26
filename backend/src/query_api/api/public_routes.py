"""Public routes for Query-as-API execution (no CoDB auth required)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.connections.api.dependencies import get_connection_service
from src.connections.service.connection_service import ConnectionService
from src.editor.api.dependencies import get_query_executor
from src.editor.service.query_executor import QueryExecutor
from src.query_api.domain.schemas import ExecuteAPIRequest
from src.query_api.service.query_api_service import QueryAPIService
from src.shared.database import get_session
from src.shared.domain.errors import ForbiddenError, NotFoundError, ValidationError

router = APIRouter(prefix="/api/v1/q", tags=["query-api-public"])


def _get_service(
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    query_executor: Annotated[QueryExecutor, Depends(get_query_executor)],
) -> QueryAPIService:
    return QueryAPIService(
        connection_service=conn_service,
        query_executor=query_executor,
    )


@router.post("/{connection_id}/execute/{query_id}")
async def execute_api_query(
    connection_id: str,
    query_id: str,
    request: Request,
    body: ExecuteAPIRequest,
    service: Annotated[QueryAPIService, Depends(_get_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> JSONResponse:
    """Execute a hosted query via API key. No CoDB auth needed."""
    caller_ip = request.client.host if request.client else "unknown"
    params = body.params or {}

    try:
        response, execution_id = await service.execute(
            session=session,
            query_id=query_id,
            connection_id=connection_id,
            api_key=x_api_key,
            caller_ip=caller_ip,
            params=params,
        )
        await session.commit()
        return JSONResponse(
            status_code=200,
            content={
                "columns": response.columns,
                "rows": response.rows,
                "row_count": response.row_count,
                "execution_time_ms": response.execution_time_ms,
                "execution_id": execution_id,
            },
        )
    except NotFoundError:
        await session.commit()  # Commit execution log
        return JSONResponse(status_code=404, content={"error": "Query not found or inactive."})
    except ForbiddenError as e:
        await session.commit()
        status = 403
        if "API key" in str(e):
            status = 401
        return JSONResponse(status_code=status, content={"error": str(e)})
    except ValidationError as e:
        await session.commit()
        msg = str(e)
        status = 400
        if "time limit" in msg:
            status = 504
        elif "execution failed" in msg.lower():
            status = 422
        return JSONResponse(status_code=status, content={"error": msg})
