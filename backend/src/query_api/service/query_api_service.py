"""Query-as-API service — business logic for hosting, executing, and managing API queries."""

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING, Any, cast

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from pydantic_core import to_jsonable_python
from sqlalchemy import or_, select

from src.connections.domain.models import ConnectionModel
from src.editor.service.sql_safety import is_read_only_query
from src.queries.domain.models import QueryFolder, SavedQuery
from src.query_api.domain.models import APIExecutionData, APIExecutionLog
from src.query_api.domain.schemas import ExecuteAPIResponse
from src.query_api.service.param_substitution import (
    parse_parameters,
    substitute_sql_for_dialect,
    validate_params,
)
from src.query_api.service.rate_limiter import check_query_rate_limit
from src.shared.domain.base import new_id
from src.shared.domain.errors import ForbiddenError, NotFoundError, ValidationError
from src.shared.domain.types import UserRole

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from src.connections.service.connection_service import ConnectionService
    from src.editor.service.query_executor import QueryExecutor

_ph = PasswordHasher()

API_KEY_PREFIX = "codb_"


def _generate_api_key() -> tuple[str, str, str]:
    """Generate API key, its hash, and prefix.

    Returns (plaintext_key, argon2_hash, prefix).
    """
    random_hex = secrets.token_hex(32)
    plaintext = f"{API_KEY_PREFIX}{random_hex}"
    key_hash = _ph.hash(plaintext)
    prefix = plaintext[:16]  # "codb_" + first 11 hex chars
    return plaintext, key_hash, prefix


def _verify_api_key(plaintext: str, key_hash: str) -> bool:
    """Verify an API key against stored hash."""
    try:
        return _ph.verify(key_hash, plaintext)
    except VerifyMismatchError:
        return False


def _jsonable_rows(rows: list[list[Any]]) -> list[list[Any]]:
    return cast("list[list[Any]]", to_jsonable_python(rows))


def _jsonable_dict(data: dict[str, Any] | None) -> dict[str, Any] | None:
    return cast("dict[str, Any] | None", to_jsonable_python(data))


class QueryAPIService:
    def __init__(
        self,
        connection_service: ConnectionService,
        query_executor: QueryExecutor,
    ) -> None:
        self._conn_service = connection_service
        self._query_executor = query_executor

    # ------------------------------------------------------------------
    # Admin: Enable / Disable / Config
    # ------------------------------------------------------------------

    async def enable_api(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
        config: dict[str, Any] | None = None,
    ) -> tuple[str, str]:
        """Enable API on a saved query. Returns (plaintext_key, prefix)."""
        query = await self._get_query_with_write_access(session, query_id, user_id, user_role)

        if query.api_enabled:
            raise ValidationError("Query is already hosted as API.")
        conn_model = await self._get_connection_for_user(
            self._get_bound_connection_id(query),
            user_id,
            user_role,
        )

        plaintext, key_hash, prefix = _generate_api_key()

        # Auto-detect parameters from SQL if not provided
        parameters = None
        if config and config.get("parameters"):
            parameters = [
                p if isinstance(p, dict) else p.model_dump() for p in config["parameters"]
            ]
        else:
            parameters = parse_parameters(query.sql, conn_model.db_type)

        query.api_enabled = True
        query.api_key_hash = key_hash
        query.api_key_prefix = prefix
        query.api_parameters = parameters
        query.api_published_sql = query.sql
        query.is_shared = True  # Hosting implies sharing

        if config:
            if config.get("row_limit") is not None:
                query.api_row_limit = config["row_limit"]
            if config.get("timeout_seconds") is not None:
                query.api_timeout_seconds = config["timeout_seconds"]
            if config.get("rate_limit") is not None:
                query.api_rate_limit = config["rate_limit"]
            if config.get("allowed_ips") is not None:
                query.api_allowed_ips = config["allowed_ips"]
            if config.get("notes") is not None:
                query.api_notes = config["notes"]

        await session.flush()
        return plaintext, prefix

    async def disable_api(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> None:
        """Disable API hosting. Query remains shared with team."""
        query = await self._get_query_with_write_access(session, query_id, user_id, user_role)

        if not query.api_enabled:
            raise ValidationError("Query is not currently hosted as API.")

        query.api_enabled = False
        await session.flush()

    async def update_config(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
        config: dict[str, Any],
    ) -> None:
        """Update API configuration for a hosted query."""
        query = await self._get_query_with_write_access(session, query_id, user_id, user_role)

        if not query.api_enabled:
            raise ValidationError("Query is not hosted as API. Enable it first.")

        if "parameters" in config and config["parameters"] is not None:
            params = config["parameters"]
            # Validate: optional params must have a default
            for p in params:
                p_dict = p if isinstance(p, dict) else p.model_dump()
                if not p_dict.get("required", True) and p_dict.get("default") is None:
                    raise ValidationError(
                        f"Optional parameter '{p_dict['name']}' must have a default value."
                    )
            query.api_parameters = [p if isinstance(p, dict) else p.model_dump() for p in params]

        if "row_limit" in config:
            query.api_row_limit = config["row_limit"]
        if "timeout_seconds" in config:
            query.api_timeout_seconds = config["timeout_seconds"]
        if "rate_limit" in config:
            query.api_rate_limit = config["rate_limit"]
        if "allowed_ips" in config:
            query.api_allowed_ips = config["allowed_ips"]
        if "notes" in config:
            query.api_notes = config["notes"]

        await session.flush()

    async def rotate_key(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> tuple[str, str]:
        """Rotate API key. Old key stops working immediately. Returns (plaintext, prefix)."""
        query = await self._get_query_with_write_access(session, query_id, user_id, user_role)

        if not query.api_enabled:
            raise ValidationError("Query is not hosted as API.")

        plaintext, key_hash, prefix = _generate_api_key()
        query.api_key_hash = key_hash
        query.api_key_prefix = prefix
        await session.flush()
        return plaintext, prefix

    async def republish(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> None:
        """Republish: update api_published_sql to current sql."""
        query = await self._get_query_with_write_access(session, query_id, user_id, user_role)

        if not query.api_enabled:
            raise ValidationError("Query is not hosted as API.")

        query.api_published_sql = query.sql
        # Re-parse parameters from new SQL
        conn_model = await self._get_connection_for_user(
            self._get_bound_connection_id(query),
            user_id,
            user_role,
        )
        query.api_parameters = parse_parameters(query.sql, conn_model.db_type)
        await session.flush()

    # ------------------------------------------------------------------
    # Public: Execute
    # ------------------------------------------------------------------

    async def execute(
        self,
        session: AsyncSession,
        query_id: str,
        connection_id: str,
        api_key: str,
        caller_ip: str,
        params: dict[str, Any],
    ) -> tuple[ExecuteAPIResponse, str]:
        """Execute a hosted query via public API.

        Returns (response, execution_id).
        Raises appropriate errors for each validation stage.
        """
        # Load query
        query = await self._get_active_query(session, query_id)
        bound_connection_id = self._get_bound_connection_id(query)

        # Verify API key
        if not query.api_key_hash or not _verify_api_key(api_key, query.api_key_hash):
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                401,
                None,
                params,
                None,
                "Invalid API key",
            )
            raise ForbiddenError("Invalid API key.")

        if connection_id != bound_connection_id:
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                404,
                None,
                params,
                None,
                "Hosted query connection mismatch",
            )
            raise NotFoundError("Query", query_id)

        # Check IP allowlist
        if query.api_allowed_ips and caller_ip not in query.api_allowed_ips:
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                403,
                None,
                params,
                None,
                f"IP {caller_ip} not allowed",
            )
            raise ForbiddenError("IP address not allowed.")

        # Check rate limit
        if query.api_rate_limit:
            await check_query_rate_limit(query_id, caller_ip, query.api_rate_limit)

        # Validate parameters
        try:
            conn_model = await self._get_hosted_connection(query, bound_connection_id)
        except NotFoundError:
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                404,
                None,
                params,
                None,
                "Connection not found",
            )
            raise
        except ForbiddenError as exc:
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                403,
                None,
                params,
                None,
                str(exc),
            )
            raise

        try:
            sql, final_sql, bind_params, timeout = self._prepare_execution(
                query=query,
                conn_model=conn_model,
                params=params,
            )
        except ValidationError as exc:
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                400,
                None,
                params,
                None,
                str(exc),
            )
            raise
        try:
            result = await self._query_executor.execute_read_only(
                conn_model=conn_model,
                sql=final_sql,
                params=bind_params,
                timeout_seconds=timeout,
                max_rows=query.api_row_limit,
            )
        except ValidationError:
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                504,
                int(timeout * 1000),
                params,
                None,
                f"Query timed out after {timeout}s",
            )
            raise ValidationError(
                "Query exceeded time limit. Check execution ID in logs."
            ) from None
        except Exception as e:
            await self._log_execution(
                session,
                query_id,
                bound_connection_id,
                caller_ip,
                422,
                None,
                params,
                None,
                str(e),
            )
            raise ValidationError("Query execution failed. Check execution ID in logs.") from None

        # Apply row limit
        rows = _jsonable_rows(result.rows)
        if query.api_row_limit and len(rows) > query.api_row_limit:
            rows = rows[: query.api_row_limit]

        response = ExecuteAPIResponse(
            columns=result.columns,
            rows=rows,
            row_count=len(rows),
            execution_time_ms=int(result.execution_time_ms),
        )

        # Log successful execution
        response_data = {
            "sql": sql,
            "columns": result.columns,
            "column_types": result.column_types,
            "rows": rows,
            "row_count": len(rows),
        }
        execution_id = await self._log_execution(
            session,
            query_id,
            bound_connection_id,
            caller_ip,
            200,
            int(result.execution_time_ms),
            params,
            response_data,
            None,
        )

        return response, execution_id

    async def test_execute(
        self,
        session: AsyncSession,
        query_id: str,
        connection_id: str,
        user_id: str,
        user_role: UserRole,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        query = await self._get_query_with_write_access(session, query_id, user_id, user_role)
        if not query.api_enabled:
            raise ValidationError("Query is not hosted as API. Enable it first.")
        bound_connection_id = self._get_bound_connection_id(query)
        if connection_id != bound_connection_id:
            raise NotFoundError("Query", query_id)

        conn_model = await self._get_connection_for_user(bound_connection_id, user_id, user_role)
        _sql, final_sql, bind_params, timeout = self._prepare_execution(
            query=query,
            conn_model=conn_model,
            params=params,
        )
        result = await self._query_executor.execute_read_only(
            conn_model=conn_model,
            sql=final_sql,
            params=bind_params,
            timeout_seconds=timeout,
            max_rows=query.api_row_limit,
        )

        rows = _jsonable_rows(result.rows)
        if query.api_row_limit and len(rows) > query.api_row_limit:
            rows = rows[: query.api_row_limit]

        return {
            "columns": result.columns,
            "rows": rows,
            "row_count": len(rows),
            "execution_time_ms": result.execution_time_ms,
        }

    async def _get_connection(self, connection_id: str) -> ConnectionModel:
        return await self._conn_service.get_by_id(connection_id)

    async def _get_connection_for_user(
        self,
        connection_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> ConnectionModel:
        return await self._conn_service.get_for_user(connection_id, user_id, user_role)

    async def _get_hosted_connection(
        self,
        query: SavedQuery,
        connection_id: str,
    ) -> ConnectionModel:
        connection = await self._get_connection(connection_id)
        if connection.created_by != query.created_by and not connection.is_shared:
            raise ForbiddenError("Hosted query connection is not accessible.")
        return connection

    def _prepare_execution(
        self,
        query: SavedQuery,
        conn_model: ConnectionModel,
        params: dict[str, Any],
    ) -> tuple[str, str, dict[str, Any] | None, int]:
        schema: list[dict[str, Any]] = query.api_parameters or []
        validated_params = validate_params(params, schema)

        sql = query.api_published_sql or query.sql
        if not is_read_only_query(sql, conn_model.db_type):
            raise ValidationError("Query failed safety validation.")

        final_sql, bind_values = substitute_sql_for_dialect(
            sql,
            validated_params,
            conn_model.db_type,
        )
        if isinstance(bind_values, list):
            bind_params = (
                {str(i): value for i, value in enumerate(bind_values)}
                if bind_values
                else None
            )
        else:
            bind_params = bind_values or None
        timeout = query.api_timeout_seconds or conn_model.query_timeout_seconds
        return sql, final_sql, bind_params, timeout

    # ------------------------------------------------------------------
    # List / Query
    # ------------------------------------------------------------------

    async def list_api_queries(
        self,
        session: AsyncSession,
        user_id: str,
        user_role: UserRole,
    ) -> list[SavedQuery]:
        """List all API-enabled queries."""
        stmt = (
            select(SavedQuery)
            .where(SavedQuery.api_enabled == True)  # noqa: E712
            .where(SavedQuery.is_deleted == False)  # noqa: E712
            .order_by(SavedQuery.updated_at.desc())
        )
        if user_role != UserRole.ADMIN:
            stmt = stmt.where(self._read_access_filter(user_id))
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def get_api_query_detail(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> dict[str, Any]:
        """Get detailed hosted-query configuration for a saved query."""
        query = await self._get_query_with_read_access(session, query_id, user_id, user_role)

        raw_parameters = query.api_parameters or parse_parameters(query.sql)
        parameters = [p if isinstance(p, dict) else dict(p) for p in raw_parameters] or None

        return {
            "id": query.id,
            "title": query.title,
            "connection_id": query.connection_id,
            "api_enabled": query.api_enabled,
            "api_key_prefix": query.api_key_prefix,
            "api_parameters": parameters,
            "api_row_limit": query.api_row_limit,
            "api_timeout_seconds": query.api_timeout_seconds,
            "api_rate_limit": query.api_rate_limit,
            "api_allowed_ips": query.api_allowed_ips,
            "api_notes": query.api_notes,
            "is_shared": query.is_shared,
            "has_sql_drift": (
                query.sql != query.api_published_sql if query.api_published_sql else False
            ),
        }

    async def get_execution_logs(
        self,
        session: AsyncSession,
        query_id: str | None = None,
        user_id: str = "",
        user_role: UserRole = UserRole.VIEWER,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get API execution logs, optionally filtered by query_id."""
        stmt = (
            select(
                APIExecutionLog,
                SavedQuery.title,
                ConnectionModel.name,
            )
            .join(SavedQuery, SavedQuery.id == APIExecutionLog.query_id)
            .join(ConnectionModel, ConnectionModel.id == APIExecutionLog.connection_id)
            .order_by(APIExecutionLog.created_at.desc())
        )
        if query_id:
            await self._get_query_with_read_access(session, query_id, user_id, user_role)
            stmt = stmt.where(APIExecutionLog.query_id == query_id)
        elif user_role != UserRole.ADMIN:
            stmt = stmt.where(self._read_access_filter(user_id))
        stmt = stmt.limit(limit).offset(offset)

        result = await session.execute(stmt)
        logs = result.all()
        data_ids = [log.data_log_id for log, _, _ in logs if log.data_log_id]
        data_by_id: dict[str, APIExecutionData] = {}
        if data_ids:
            data_result = await session.execute(
                select(APIExecutionData).where(APIExecutionData.id.in_(data_ids))
            )
            data_by_id = {data.id: data for data in data_result.scalars().all()}

        entries = []
        for log, query_title, connection_name in logs:
            entry: dict[str, Any] = {
                "id": log.id,
                "query_id": log.query_id,
                "query_title": query_title,
                "connection_id": log.connection_id,
                "connection_name": connection_name,
                "caller_ip": log.caller_ip,
                "status_code": log.status_code,
                "execution_time_ms": log.execution_time_ms,
                "created_at": log.created_at,
            }
            if log.data_log_id:
                data = data_by_id.get(log.data_log_id)
                if data:
                    entry["params_sent"] = data.params_sent
                    entry["error"] = data.error
                    # Truncate response for list view
                    if data.response_data:
                        entry["response_preview"] = {
                            "row_count": data.response_data.get("row_count"),
                            "columns": data.response_data.get("columns"),
                        }
            entries.append(entry)

        return entries

    async def get_execution_log_detail(
        self,
        session: AsyncSession,
        execution_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> dict[str, Any]:
        """Get the full replay payload for a single API execution log."""
        result = await session.execute(
            select(
                APIExecutionLog,
                SavedQuery.title,
                SavedQuery.sql,
                SavedQuery.api_published_sql,
                ConnectionModel.name,
            )
            .join(SavedQuery, SavedQuery.id == APIExecutionLog.query_id)
            .join(ConnectionModel, ConnectionModel.id == APIExecutionLog.connection_id)
            .where(APIExecutionLog.id == execution_id)
        )
        row = result.one_or_none()
        if row is None:
            raise NotFoundError("API execution log", execution_id)

        log, query_title, current_sql, published_sql, connection_name = row
        await self._get_query_with_read_access(session, log.query_id, user_id, user_role)
        detail: dict[str, Any] = {
            "id": log.id,
            "query_id": log.query_id,
            "query_title": query_title,
            "query_sql": published_sql or current_sql,
            "connection_id": log.connection_id,
            "connection_name": connection_name,
            "caller_ip": log.caller_ip,
            "status_code": log.status_code,
            "execution_time_ms": log.execution_time_ms,
            "created_at": log.created_at,
        }
        if log.data_log_id:
            data = await session.get(APIExecutionData, log.data_log_id)
            if data:
                detail["params_sent"] = data.params_sent
                detail["error"] = data.error
                if data.response_data:
                    detail["response_data"] = {
                        "columns": data.response_data.get("columns") or [],
                        "column_types": data.response_data.get("column_types") or [],
                        "rows": data.response_data.get("rows") or [],
                        "row_count": data.response_data.get("row_count") or 0,
                    }
                    detail["query_sql"] = data.response_data.get("sql") or detail["query_sql"]

        return detail

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_query(self, session: AsyncSession, query_id: str) -> SavedQuery:
        """Get saved query by ID, raise 404 if not found."""
        stmt = select(SavedQuery).where(
            SavedQuery.id == query_id,
            SavedQuery.is_deleted == False,  # noqa: E712
        )
        result = await session.execute(stmt)
        query = result.scalar_one_or_none()
        if not query:
            raise NotFoundError("Query", query_id)
        return query

    async def _get_query_with_read_access(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> SavedQuery:
        query = await self._get_query(session, query_id)
        if await self._can_read_query(session, query, user_id, user_role):
            return query
        raise NotFoundError("Query", query_id)

    async def _get_query_with_write_access(
        self,
        session: AsyncSession,
        query_id: str,
        user_id: str,
        user_role: UserRole,
    ) -> SavedQuery:
        query = await self._get_query(session, query_id)
        if user_role == UserRole.ADMIN or query.created_by == user_id:
            return query
        raise ForbiddenError("Only the query owner or an admin can manage API hosting.")

    async def _can_read_query(
        self,
        session: AsyncSession,
        query: SavedQuery,
        user_id: str,
        user_role: UserRole,
    ) -> bool:
        if user_role == UserRole.ADMIN or query.created_by == user_id or query.is_shared:
            return True
        if not query.folder_id:
            return False
        result = await session.execute(
            select(QueryFolder.id).where(
                QueryFolder.id == query.folder_id,
                QueryFolder.is_shared == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none() is not None

    def _read_access_filter(self, user_id: str) -> Any:
        shared_folder_ids = select(QueryFolder.id).where(
            QueryFolder.is_shared == True  # noqa: E712
        )
        return or_(
            SavedQuery.created_by == user_id,
            SavedQuery.is_shared == True,  # noqa: E712
            SavedQuery.folder_id.in_(shared_folder_ids),
        )

    def _get_bound_connection_id(self, query: SavedQuery) -> str:
        if not query.connection_id:
            raise ValidationError("Hosted query has no bound connection.")
        return query.connection_id

    async def _get_active_query(self, session: AsyncSession, query_id: str) -> SavedQuery:
        """Get active API query, raise 404 if not found or disabled."""
        stmt = select(SavedQuery).where(
            SavedQuery.id == query_id,
            SavedQuery.api_enabled == True,  # noqa: E712
            SavedQuery.is_deleted == False,  # noqa: E712
        )
        result = await session.execute(stmt)
        query = result.scalar_one_or_none()
        if not query:
            raise NotFoundError("Query", query_id)
        return query

    async def _log_execution(
        self,
        session: AsyncSession,
        query_id: str,
        connection_id: str,
        caller_ip: str,
        status_code: int,
        execution_time_ms: int | None,
        params_sent: dict[str, Any] | None,
        response_data: dict[str, Any] | None,
        error: str | None,
    ) -> str:
        """Log an API execution (append-only). Returns the execution_id."""
        # Create data log entry
        data_log = APIExecutionData(
            id=new_id(),
            params_sent=_jsonable_dict(params_sent),
            response_data=_jsonable_dict(response_data),
            error=error,
        )
        session.add(data_log)
        await session.flush()

        # Create execution log entry
        log = APIExecutionLog(
            id=new_id(),
            query_id=query_id,
            connection_id=connection_id,
            caller_ip=caller_ip,
            status_code=status_code,
            execution_time_ms=execution_time_ms,
            data_log_id=data_log.id,
        )
        session.add(log)
        await session.flush()

        return log.id
