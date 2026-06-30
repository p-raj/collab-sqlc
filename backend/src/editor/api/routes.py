"""Query execution API routes."""

import asyncio
import contextlib
import csv
import io
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.api.dependencies import get_current_user
from src.auth.domain.schemas import CurrentUser
from src.connections.api.dependencies import get_connection_service
from src.connections.engine_registry import get_database_engine_or_default
from src.connections.service.connection_service import ConnectionService
from src.editor.api.dependencies import get_query_executor
from src.editor.service.query_executor import (
    QueryCancelledError,
    QueryExecutor,
    RunningQueryInfo,
)
from src.history.api.dependencies import get_history_service
from src.history.domain.schemas import (
    CancelRunResponse,
    RunHistoryResponse,
    RunResultResponse,
    RunSource,
    RunStatus,
    RunSubmitResponse,
)
from src.history.service.history_service import HistoryService
from src.history.tasks import execute_query_run
from src.query_api.service.param_substitution import (
    mask_parameters_for_format,
    restore_parameters_after_format,
)
from src.shared.config import AppSettings, get_settings
from src.shared.database import get_session
from src.shared.domain.errors import ValidationError
from src.shared.domain.schemas import ApiSchema

router = APIRouter(prefix="/queries", tags=["queries"])


class ExecuteQueryRequest(ApiSchema):
    connection_id: str
    sql: str = Field(min_length=1)
    params: dict[str, Any] | None = None
    write_mode: bool = False
    query_id: str | None = None


class ExecuteQueryResponse(ApiSchema):
    columns: list[str]
    column_types: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: float


class ExportQueryRequest(ApiSchema):
    connection_id: str
    sql: str = Field(min_length=1)
    params: dict[str, Any] | None = None


class ExplainQueryRequest(ApiSchema):
    connection_id: str
    sql: str = Field(min_length=1)
    params: dict[str, Any] | None = None
    query_id: str | None = None


class ExplainQueryResponse(ApiSchema):
    plan: str
    query: str


class FormatSqlRequest(ApiSchema):
    sql: str = Field(min_length=1)
    dialect: str | None = None


class FormatSqlResponse(ApiSchema):
    sql: str


@router.post("/execute", response_model=ExecuteQueryResponse)
async def execute_query(
    body: ExecuteQueryRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    history_service: Annotated[HistoryService, Depends(get_history_service)],
    settings: Annotated[AppSettings, Depends(get_settings)],
) -> ExecuteQueryResponse:
    conn_model = await conn_service.get_for_user(body.connection_id, user.id, user.role)
    run = await _create_editor_run(body, user, conn_model.query_timeout_seconds, history_service)
    await session.commit()
    await execute_query_run.kiq(run.id)

    timeout_seconds = run.timeout_seconds or conn_model.query_timeout_seconds
    deadline = asyncio.get_running_loop().time() + timeout_seconds + 5
    poll_interval = settings.worker.sync_poll_interval_ms / 1000

    while asyncio.get_running_loop().time() < deadline:
        await session.refresh(run)
        if run.status == RunStatus.SUCCESS:
            result = await history_service.get_result_for_user(run.id, user)
            return ExecuteQueryResponse(
                columns=result.columns,
                column_types=result.column_types,
                rows=result.rows,
                row_count=result.row_count,
                execution_time_ms=result.execution_time_ms,
            )
        if run.status in {RunStatus.ERROR, RunStatus.CANCELLED, RunStatus.TIMEOUT}:
            raise ValidationError(run.error_message or f"Query finished with status {run.status}")
        await asyncio.sleep(poll_interval)

    await history_service.request_cancel_for_user(run.id, user)
    backend_identifier = run.backend_pid or run.backend_query_id
    if backend_identifier is not None:
        with contextlib.suppress(Exception):
            driver = conn_service.get_driver(conn_model)
            config = await conn_service.get_connection_config(conn_model)
            await driver.cancel_backend(config, backend_identifier)
    await session.commit()
    raise ValidationError("Query is still running. Use async run APIs to fetch it later.")


@router.post("/runs", response_model=RunSubmitResponse)
async def submit_query_run(
    body: ExecuteQueryRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    history_service: Annotated[HistoryService, Depends(get_history_service)],
) -> RunSubmitResponse:
    conn_model = await conn_service.get_for_user(body.connection_id, user.id, user.role)
    run = await _create_editor_run(body, user, conn_model.query_timeout_seconds, history_service)
    await session.commit()
    await execute_query_run.kiq(run.id)
    return RunSubmitResponse(run_id=run.id, status=run.status)


@router.get("/runs/{run_id}", response_model=RunHistoryResponse)
async def get_query_run(
    run_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    history_service: Annotated[HistoryService, Depends(get_history_service)],
) -> RunHistoryResponse:
    return await history_service.get_run_for_user(run_id, user)


@router.get("/runs/{run_id}/result", response_model=RunResultResponse)
async def get_query_run_result(
    run_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    history_service: Annotated[HistoryService, Depends(get_history_service)],
) -> RunResultResponse:
    return await history_service.get_result_for_user(run_id, user)


@router.post("/runs/{run_id}/cancel", response_model=CancelRunResponse)
async def cancel_query_run(
    run_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    history_service: Annotated[HistoryService, Depends(get_history_service)],
) -> CancelRunResponse:
    run = await history_service.request_cancel_for_user(run_id, user)

    if run.status == RunStatus.QUEUED:
        await history_service.mark_cancelled(run, "Query cancelled before execution")
        await session.commit()
        return CancelRunResponse(cancelled=True)

    accepted = True
    backend_identifier = run.backend_pid or run.backend_query_id
    if backend_identifier is not None:
        try:
            conn_model = await conn_service.get_for_user(run.connection_id, user.id, user.role)
            driver = conn_service.get_driver(conn_model)
            config = await conn_service.get_connection_config(conn_model)
            accepted = await driver.cancel_backend(config, backend_identifier)
        except Exception:
            accepted = False

    await session.commit()
    return CancelRunResponse(cancelled=accepted)


async def _create_editor_run(
    body: ExecuteQueryRequest,
    user: CurrentUser,
    timeout_seconds: int,
    history_service: HistoryService,
):
    return await history_service.create_run(
        user_id=user.id,
        connection_id=body.connection_id,
        sql=body.sql,
        source=RunSource.EDITOR,
        params=body.params,
        write_mode=body.write_mode,
        user_role=user.role,
        timeout_seconds=timeout_seconds,
        status=RunStatus.QUEUED,
    )


@router.post("/execute-direct", response_model=ExecuteQueryResponse, include_in_schema=False)
async def execute_query_direct_compat(
    body: ExecuteQueryRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    executor: Annotated[QueryExecutor, Depends(get_query_executor)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    history_service: Annotated[HistoryService, Depends(get_history_service)],
) -> ExecuteQueryResponse:
    conn_model = await conn_service.get_for_user(body.connection_id, user.id, user.role)

    try:
        result = await executor.execute(
            conn_model=conn_model,
            sql=body.sql,
            user_role=user.role,
            params=body.params,
            write_mode=body.write_mode,
            query_id=body.query_id,
            user_id=user.id,
        )
    except QueryCancelledError:
        await history_service.record_run(
            user.id,
            body.connection_id,
            body.sql,
            "cancelled",
            None,
            None,
            "Query cancelled by user",
        )
        raise ValidationError("Query cancelled by user") from None
    except Exception as exc:
        await history_service.record_run(
            user.id,
            body.connection_id,
            body.sql,
            "error",
            None,
            None,
            str(exc),
        )
        raise

    await history_service.record_run(
        user.id,
        body.connection_id,
        body.sql,
        "success",
        len(result.rows),
        result.execution_time_ms,
        None,
    )

    return ExecuteQueryResponse(
        columns=result.columns,
        column_types=result.column_types,
        rows=result.rows,
        row_count=len(result.rows),
        execution_time_ms=result.execution_time_ms,
    )


@router.post("/explain", response_model=ExplainQueryResponse)
async def explain_query(
    body: ExplainQueryRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    executor: Annotated[QueryExecutor, Depends(get_query_executor)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    history_service: Annotated[HistoryService, Depends(get_history_service)],
) -> ExplainQueryResponse:
    conn_model = await conn_service.get_for_user(body.connection_id, user.id, user.role)

    try:
        explain_result = await executor.explain(
            conn_model=conn_model,
            sql=body.sql,
            user_role=user.role,
            params=body.params,
            query_id=body.query_id,
            user_id=user.id,
        )
    except QueryCancelledError:
        await history_service.record_run(
            user.id, body.connection_id, body.sql,
            "cancelled", None, None, "EXPLAIN cancelled by user",
        )
        raise ValidationError("EXPLAIN cancelled by user") from None
    except Exception as exc:
        await history_service.record_run(
            user.id, body.connection_id, body.sql,
            "error", None, None, str(exc),
        )
        raise

    await history_service.record_run(
        user.id, body.connection_id,
        f"EXPLAIN ANALYZE {body.sql}", "success", None, None, None,
    )

    return ExplainQueryResponse(plan=explain_result.plan_json, query=explain_result.query)


class CancelQueryRequest(ApiSchema):
    query_id: str


@router.get("/running/{query_id}")
async def get_running_query(
    query_id: str,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
) -> RunningQueryInfo:
    """Return the backend PID of a running query, or null if not found."""
    return QueryExecutor.get_running_info(query_id, _user.id)


@router.post("/cancel")
async def cancel_query(
    body: CancelQueryRequest,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
) -> dict[str, bool]:
    """Cancel a running query by its query_id."""
    cancelled = await QueryExecutor.cancel_query(body.query_id, _user.id)
    return {"cancelled": cancelled}


@router.post("/export")
async def export_query(
    body: ExportQueryRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    executor: Annotated[QueryExecutor, Depends(get_query_executor)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
) -> StreamingResponse:
    """Export query results as CSV.

    Engines with true streaming use driver cursors. Engines without true
    streaming reuse normal execution so authorization and SQL safety checks stay
    identical to the main query path.
    """
    conn_model = await conn_service.get_for_user(body.connection_id, user.id, user.role)
    engine = get_database_engine_or_default(conn_model.db_type)

    if engine.supports_streaming:
        columns, row_iter = await executor.execute_streaming(
            conn_model=conn_model,
            sql=body.sql,
            user_role=user.role,
            params=body.params,
        )
    else:
        result = await executor.execute(
            conn_model=conn_model,
            sql=body.sql,
            user_role=user.role,
            params=body.params,
            write_mode=False,
            user_id=user.id,
        )
        columns = result.columns

        async def _single_batch() -> AsyncIterator[list[list[Any]]]:
            yield result.rows

        row_iter = _single_batch()

    async def _csv_generator() -> AsyncIterator[str]:
        # Header row
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns)
        yield buf.getvalue()

        async for chunk in row_iter:
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerows(chunk)
            yield buf.getvalue()

    return StreamingResponse(
        _csv_generator(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export.csv"},
    )


@router.post("/format", response_model=FormatSqlResponse)
async def format_sql(
    body: FormatSqlRequest,
    _user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FormatSqlResponse:
    """Format SQL using sqlglot's pretty-print, preserving dialect syntax."""
    import sqlglot

    dialect = get_database_engine_or_default(body.dialect).sqlglot_dialect

    try:
        masked_sql, replacements = mask_parameters_for_format(body.sql, body.dialect)
        statements = sqlglot.transpile(masked_sql, read=dialect, write=dialect, pretty=True)
        formatted = ";\n\n".join(statements) + (";" if statements else "")
        return FormatSqlResponse(sql=restore_parameters_after_format(formatted, replacements))
    except Exception:
        return FormatSqlResponse(sql=body.sql)
