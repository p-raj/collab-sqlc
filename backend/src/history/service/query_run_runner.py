"""Worker-side execution service for queued query runs."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from loguru import logger

from src.admin.service.audit_service import create_audit_service
from src.auth.service.user_lookup_service import create_user_lookup_service
from src.connections.repository.connection_repository import ConnectionRepository
from src.connections.service.connection_service import ConnectionService
from src.connections.service.encryption import CredentialEncryption
from src.editor.service.query_executor import QueryCancelledError, QueryExecutor
from src.history.domain.schemas import RunStatus
from src.history.repository.history_repository import RunHistoryRepository
from src.history.service.history_service import HistoryService
from src.shared.config import get_settings
from src.shared.database import get_session_factory
from src.shared.domain.errors import ValidationError

if TYPE_CHECKING:
    from src.connections.drivers.base import ConnectionConfig, DatabaseDriver, QueryResult
    from src.history.domain.models import RunHistoryModel


class QueryRunRunner:
    """Loads a persisted run and executes it inside a worker process."""

    async def execute(self, run_id: str) -> None:
        session_factory = get_session_factory()

        async with session_factory() as session:
            history = HistoryService(
                RunHistoryRepository(session),
                create_user_lookup_service(session),
            )
            conn_service = ConnectionService(
                repo=ConnectionRepository(session),
                encryption=CredentialEncryption(get_settings()),
                audit_service=create_audit_service(session),
            )
            executor = QueryExecutor(conn_service)

            run = await history.get_run(run_id)
            if run.status not in {RunStatus.QUEUED, RunStatus.RUNNING}:
                return

            if run.cancellation_requested_at is not None:
                await history.mark_cancelled(run, "Query cancelled before execution")
                await session.commit()
                return

            await history.mark_running(run)
            await session.commit()

            async def on_running(
                _driver: DatabaseDriver,
                _config: ConnectionConfig,
                backend_pid: int | None,
                backend_query_id: str | None,
            ) -> None:
                fresh_run = await history.get_run(run_id)
                await history.store_backend_pid(fresh_run, backend_pid)
                await history.store_backend_query_id(fresh_run, backend_query_id)
                await session.commit()

            try:
                conn_model = await conn_service.get_for_user(
                    run.connection_id,
                    run.user_id,
                    run.user_role,
                )
                if run.cancellation_requested_at is not None:
                    await history.mark_cancelled(run, "Query cancelled before execution")
                    await session.commit()
                    return

                result = await executor.execute(
                    conn_model=conn_model,
                    sql=run.sql,
                    user_role=run.user_role,
                    params=run.params,
                    write_mode=run.write_mode,
                    query_id=run.id,
                    user_id=run.user_id,
                    timeout_seconds=run.timeout_seconds,
                    max_rows=run.max_rows,
                    on_running=on_running,
                )
                await self._store_success(history, run, result)
                await session.commit()
            except QueryCancelledError:
                await history.mark_cancelled(run, "Query cancelled by user")
                await session.commit()
            except ValidationError as exc:
                message = str(exc)
                if "timed out" in message.lower():
                    await history.mark_timeout(run, message)
                else:
                    await history.mark_error(run, message)
                await session.commit()
            except Exception as exc:
                logger.exception("Query run failed", run_id=run_id)
                await history.mark_error(run, str(exc))
                await session.commit()

    async def _store_success(
        self,
        history: HistoryService,
        run: RunHistoryModel,
        result: QueryResult,
    ) -> None:
        settings = get_settings()
        preview_limit = settings.worker.result_preview_rows
        rows: list[list[Any]] = result.rows[:preview_limit]
        truncated = len(result.rows) > preview_limit
        await history.mark_success(
            run,
            columns=result.columns,
            column_types=result.column_types,
            rows=rows,
            row_count=result.row_count,
            execution_time_ms=result.execution_time_ms,
            truncated=truncated,
            result_shape=result.result_shape,
            data=result.data,
        )
