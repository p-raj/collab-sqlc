"""Query executor — runs queries with safety checks, timeouts, concurrency control."""

from __future__ import annotations

import asyncio
import contextlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from loguru import logger

from src.connections.engine_registry import get_database_engine
from src.editor.service.sql_safety import is_read_only_query
from src.shared.domain.errors import ForbiddenError, ValidationError
from src.shared.domain.types import UserRole

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Awaitable, Callable

    from src.connections.domain.models import ConnectionModel
    from src.connections.drivers.base import ConnectionConfig, DatabaseDriver, QueryResult
    from src.connections.service.connection_service import ConnectionService

    RunningCallback = Callable[
        [DatabaseDriver, ConnectionConfig, int | None, str | None],
        Awaitable[None],
    ]

_semaphores: dict[str, asyncio.Semaphore] = {}


@dataclass(frozen=True, slots=True)
class RunningQueryInfo:
    """Status of a running query."""
    running: bool
    pid: int | None


@dataclass(frozen=True, slots=True)
class ExplainResult:
    """Result of an EXPLAIN ANALYZE query."""
    plan_json: str
    query: str


@dataclass
class _RunningQuery:
    """Tracks a running query so we can cancel exactly the right one."""
    driver: DatabaseDriver
    config: ConnectionConfig
    connection: Any
    backend_pid: int | None
    backend_query_id: str | None
    user_id: str  # Owner of this query
    supports_cancel: bool
    cancelled: bool = False


# Track running queries for cancellation: query_id → _RunningQuery
_running_queries: dict[str, _RunningQuery] = {}


def _get_semaphore(connection_id: str, max_concurrent: int) -> asyncio.Semaphore:
    if connection_id not in _semaphores:
        _semaphores[connection_id] = asyncio.Semaphore(max_concurrent)
    return _semaphores[connection_id]


class QueryCancelledError(Exception):
    """Raised when a query is cancelled by the user."""


class QueryExecutor:
    def __init__(self, connection_service: ConnectionService) -> None:
        self._conn_service = connection_service

    # ------------------------------------------------------------------
    # Shared safety checks
    # ------------------------------------------------------------------

    def _check_permissions(
        self, sql: str, user_role: str, conn_model: ConnectionModel, *, write_mode: bool = False,
    ) -> None:
        db_type = conn_model.db_type
        if user_role == UserRole.VIEWER and not is_read_only_query(sql, db_type):
            raise ForbiddenError("Viewers can only run read-only queries.")

        if not write_mode and not is_read_only_query(sql, db_type):
            raise ForbiddenError(
                "Write mode is off. Enable write mode to run"
                " INSERT, UPDATE, DELETE, or DDL queries."
            )

        if not sql.strip():
            raise ValidationError("Query cannot be empty")

    # ------------------------------------------------------------------
    # Execute — runs user SQL as-is, returns full result
    # ------------------------------------------------------------------

    async def execute(
        self,
        conn_model: ConnectionModel,
        sql: str,
        user_role: str,
        params: dict[str, Any] | None = None,
        write_mode: bool = False,
        query_id: str | None = None,
        user_id: str = "",
        timeout_seconds: int | None = None,
        max_rows: int | None = None,
        on_running: RunningCallback | None = None,
    ) -> QueryResult:
        self._check_permissions(sql, user_role, conn_model, write_mode=write_mode)

        return await self.execute_direct(
            conn_model=conn_model,
            sql=sql,
            params=params,
            timeout_seconds=timeout_seconds or conn_model.query_timeout_seconds,
            query_id=query_id,
            user_id=user_id,
            max_rows=max_rows,
            on_running=on_running,
        )

    async def execute_direct(
        self,
        conn_model: ConnectionModel,
        sql: str,
        params: dict[str, Any] | None = None,
        timeout_seconds: int | None = None,
        *,
        query_id: str | None = None,
        wrap_in_rollback: bool = False,
        user_id: str = "",
        max_rows: int | None = None,
        read_only: bool = False,
        on_running: RunningCallback | None = None,
    ) -> QueryResult:
        engine = get_database_engine(conn_model.db_type)
        driver = self._conn_service.get_driver(conn_model)
        config = await self._conn_service.get_connection_config(conn_model)
        semaphore = _get_semaphore(conn_model.id, conn_model.max_concurrent_queries)

        async with semaphore:
            return await self._execute_with_timeout(
                driver,
                config,
                sql,
                params,
                timeout_seconds or conn_model.query_timeout_seconds,
                supports_cancel=engine.supports_cancel,
                query_id=query_id,
                wrap_in_rollback=wrap_in_rollback,
                user_id=user_id,
                max_rows=max_rows,
                read_only=read_only,
                on_running=on_running,
            )

    async def execute_read_only(
        self,
        conn_model: ConnectionModel,
        sql: str,
        params: dict[str, Any] | None = None,
        timeout_seconds: int | None = None,
        *,
        query_id: str | None = None,
        user_id: str = "",
        max_rows: int | None = None,
        on_running: RunningCallback | None = None,
    ) -> QueryResult:
        self._check_permissions(sql, UserRole.VIEWER, conn_model, write_mode=False)
        return await self.execute_direct(
            conn_model=conn_model,
            sql=sql,
            params=params,
            timeout_seconds=timeout_seconds,
            query_id=query_id,
            user_id=user_id,
            max_rows=max_rows,
            read_only=True,
            on_running=on_running,
        )

    # ------------------------------------------------------------------
    # Explain — wraps SQL in EXPLAIN ANALYZE, returns the JSON plan
    # ------------------------------------------------------------------

    async def explain(
        self,
        conn_model: ConnectionModel,
        sql: str,
        user_role: str,
        params: dict[str, Any] | None = None,
        query_id: str | None = None,
        user_id: str = "",
    ) -> ExplainResult:
        """Run EXPLAIN on the SQL using the engine-specific explain prefix."""
        if not sql.strip():
            raise ValidationError("Query cannot be empty")

        engine = get_database_engine(conn_model.db_type)

        if not engine.supports_explain:
            raise ValidationError(f"EXPLAIN is not supported for {engine.label} connections.")

        if user_role == UserRole.VIEWER:
            raise ForbiddenError("Viewers cannot run EXPLAIN.")

        # PostgreSQL EXPLAIN ANALYZE actually executes the query. Respect safe_mode.
        if (
            engine.explain.wraps_in_rollback
            and conn_model.safe_mode
            and not is_read_only_query(sql, conn_model.db_type)
            and user_role != UserRole.ADMIN
        ):
            raise ForbiddenError(
                "Safe mode is enabled on this connection. "
                "EXPLAIN ANALYZE on write queries requires safe mode to be disabled."
            )

        explain_sql = f"{engine.explain.prefix} {sql}"

        result = await self.execute_direct(
            conn_model=conn_model,
            sql=explain_sql,
            params=params,
            timeout_seconds=conn_model.query_timeout_seconds,
            query_id=query_id,
            wrap_in_rollback=engine.explain.wraps_in_rollback,
            user_id=user_id,
        )

        # PostgreSQL returns JSON plan in a single cell; ClickHouse returns text rows
        if result.rows and result.rows[0]:
            if engine.explain.output_kind == "json":
                # PostgreSQL: single JSON object in rows[0][0]
                raw = result.rows[0][0]
                plan_json = json.dumps(raw) if not isinstance(raw, str) else raw
            else:
                # ClickHouse: multi-row text output — join all rows
                plan_json = "\n".join(
                    str(row[0]) for row in result.rows if row
                )
        else:
            raise ValidationError("EXPLAIN returned no plan data")

        return ExplainResult(plan_json=plan_json, query=sql)

    @staticmethod
    def get_running_info(query_id: str, user_id: str) -> RunningQueryInfo:
        """Return backend PID and running status for a query (only if owned by user)."""
        running = _running_queries.get(query_id)
        if running is None or running.user_id != user_id:
            return RunningQueryInfo(running=False, pid=None)
        return RunningQueryInfo(running=True, pid=running.backend_pid)

    @staticmethod
    async def cancel_query(query_id: str, user_id: str) -> bool:
        """Cancel a running query using the owning driver.

        Only the user who started the query can cancel it.
        """
        running = _running_queries.get(query_id)
        if running is None:
            return False

        if running.user_id != user_id:
            return False

        if not running.supports_cancel:
            logger.warning(f"Cancel not supported for query {query_id}")
            return False

        backend_identifier = running.backend_pid or running.backend_query_id
        if backend_identifier is None:
            logger.warning(f"No backend identifier for query {query_id} — cannot cancel")
            return False

        running.cancelled = True

        try:
            return await running.driver.cancel_backend(running.config, backend_identifier)
        except Exception:
            logger.warning(f"Failed to cancel query {query_id}", exc_info=True)
            return False

    # ------------------------------------------------------------------
    # Streaming execute — yields row chunks for export
    # ------------------------------------------------------------------

    async def execute_streaming(
        self,
        conn_model: ConnectionModel,
        sql: str,
        user_role: str,
        params: dict[str, Any] | None = None,
        chunk_size: int = 1000,
    ) -> tuple[list[str], AsyncIterator[list[list[Any]]]]:
        """Return (columns, async-row-chunk-iterator).

        The caller is responsible for closing the connection after consuming
        the iterator (handled by the route via the StreamingResponse).
        """
        self._check_permissions(sql, user_role, conn_model)

        driver = self._conn_service.get_driver(conn_model)
        config = await self._conn_service.get_connection_config(conn_model)

        connection = await driver.connect(config)
        try:
            # Fetch column metadata from a zero-row probe using statement_timeout
            stripped = sql.rstrip().rstrip(";")
            probe_sql = f"{stripped}\nLIMIT 0"
            probe = await driver.execute(connection, probe_sql, params)
            columns = probe.columns
        except Exception:
            await driver.disconnect(connection)
            raise

        row_iter = driver.stream(connection, sql, params, chunk_size=chunk_size)

        async def _iter_and_cleanup() -> AsyncIterator[list[list[Any]]]:
            try:
                async for chunk in row_iter:
                    yield chunk
            finally:
                await driver.disconnect(connection)

        return columns, _iter_and_cleanup()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _execute_with_timeout(
        self,
        driver: DatabaseDriver,
        config: ConnectionConfig,
        sql: str,
        params: dict[str, Any] | None,
        timeout_seconds: int,
        supports_cancel: bool,
        query_id: str | None = None,
        wrap_in_rollback: bool = False,
        user_id: str = "",
        max_rows: int | None = None,
        read_only: bool = False,
        on_running: RunningCallback | None = None,
    ) -> QueryResult:
        connection = await driver.connect(config)

        # Wrap EXPLAIN ANALYZE in a transaction that is always rolled back
        # to prevent write side effects from persisting (PostgreSQL-specific).
        if wrap_in_rollback and hasattr(connection, "execute"):
            await connection.execute("BEGIN")

        backend_pid: int | None = None
        if supports_cancel:
            backend_pid = driver.get_backend_pid(connection)

        qid = query_id or str(id(connection))
        running = _RunningQuery(
            driver=driver,
            config=config,
            connection=connection,
            backend_pid=backend_pid,
            backend_query_id=qid,
            user_id=user_id,
            supports_cancel=supports_cancel,
        )
        _running_queries[qid] = running
        if on_running is not None:
            await on_running(driver, config, backend_pid, qid)

        try:
            result = await asyncio.wait_for(
                driver.execute(
                    connection,
                    sql,
                    params,
                    max_rows=max_rows,
                    read_only=read_only,
                    backend_query_id=qid,
                ),
                timeout=timeout_seconds,
            )
            return result
        except Exception as exc:
            # Check if this was a user-initiated cancellation
            exc_name = type(exc).__name__
            is_cancel = (
                running.cancelled
                or exc_name == "QueryCanceledError"
                or "cancel" in str(exc).lower()
            )
            if is_cancel:
                raise QueryCancelledError("Query was cancelled") from exc
            if isinstance(exc, TimeoutError):
                if supports_cancel:
                    try:
                        await driver.cancel_backend(config, backend_pid or qid)
                    except Exception:
                        logger.warning("Failed to cancel query after timeout", exc_info=True)
                raise ValidationError(f"Query timed out after {timeout_seconds} seconds") from None
            raise
        finally:
            _running_queries.pop(qid, None)
            if wrap_in_rollback and hasattr(connection, "execute"):
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(connection.execute("ROLLBACK"), timeout=5.0)
            await driver.disconnect(connection)
