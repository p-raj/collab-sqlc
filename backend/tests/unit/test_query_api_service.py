"""Unit tests for Query-as-API service helpers and schema alignment."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from pytest import raises

from src.queries.domain.models import SavedQuery
from src.query_api.service.query_api_service import (
    QueryAPIService,
    _generate_api_key,
)
from src.shared.domain.errors import ForbiddenError, NotFoundError
from src.shared.domain.types import UserRole


def test_generate_api_key_prefix_matches_schema_length() -> None:
    plaintext, key_hash, prefix = _generate_api_key()

    prefix_column_type = SavedQuery.__table__.c.api_key_prefix.type
    prefix_column_length = getattr(prefix_column_type, "length", None)
    hash_column_type = SavedQuery.__table__.c.api_key_hash.type
    hash_column_length = getattr(hash_column_type, "length", None)

    assert plaintext.startswith("codb_")
    assert len(prefix) == 16
    assert prefix_column_length is not None
    assert prefix_column_length >= len(prefix)
    assert hash_column_length is not None
    assert hash_column_length >= len(key_hash)


def test_prepare_execution_uses_connection_database_type() -> None:
    service = QueryAPIService(connection_service=Mock(), query_executor=Mock())
    query = SimpleNamespace(
        api_parameters=[],
        api_published_sql="SELECT 1",
        sql="SELECT 1",
        api_timeout_seconds=None,
    )
    conn_model = SimpleNamespace(db_type="clickhouse", query_timeout_seconds=30)

    with patch(
        "src.query_api.service.query_api_service.is_read_only_query",
        return_value=True,
    ) as read_only_mock:
        service._prepare_execution(query, conn_model, {})

    read_only_mock.assert_called_once_with("SELECT 1", "clickhouse")


def test_prepare_execution_uses_clickhouse_named_binds() -> None:
    service = QueryAPIService(connection_service=Mock(), query_executor=Mock())
    query = SimpleNamespace(
        api_parameters=[
            {"name": "org_id", "type": "integer", "required": True, "default": None},
        ],
        api_published_sql="SELECT * FROM events WHERE org_id = {org_id:integer}",
        sql="SELECT * FROM events WHERE org_id = {org_id:integer}",
        api_timeout_seconds=None,
    )
    conn_model = SimpleNamespace(db_type="clickhouse", query_timeout_seconds=30)

    _source_sql, final_sql, bind_params, timeout = service._prepare_execution(
        query,
        conn_model,
        {"org_id": "42"},
    )

    assert final_sql == "SELECT * FROM events WHERE org_id = %(org_id)s"
    assert bind_params == {"org_id": 42}
    assert timeout == 30


def test_prepare_execution_keeps_postgresql_positional_binds() -> None:
    service = QueryAPIService(connection_service=Mock(), query_executor=Mock())
    query = SimpleNamespace(
        api_parameters=[
            {"name": "org_id", "type": "integer", "required": True, "default": None},
        ],
        api_published_sql="SELECT * FROM events WHERE org_id = {org_id:integer}",
        sql="SELECT * FROM events WHERE org_id = {org_id:integer}",
        api_timeout_seconds=None,
    )
    conn_model = SimpleNamespace(db_type="postgresql", query_timeout_seconds=30)

    _source_sql, final_sql, bind_params, timeout = service._prepare_execution(
        query,
        conn_model,
        {"org_id": "42"},
    )

    assert final_sql == "SELECT * FROM events WHERE org_id = $1"
    assert bind_params == {"0": 42}
    assert timeout == 30


async def test_enable_api_requires_owner_or_admin() -> None:
    service = QueryAPIService(connection_service=Mock(), query_executor=Mock())
    service._get_query = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(
            id="query-1",
            created_by="owner-1",
            connection_id="conn-1",
            api_enabled=False,
        )
    )

    with raises(ForbiddenError):
        await service.enable_api(
            session=AsyncMock(),
            query_id="query-1",
            user_id="editor-2",
            user_role=UserRole.EDITOR,
        )


async def test_private_query_read_requires_visibility() -> None:
    service = QueryAPIService(connection_service=Mock(), query_executor=Mock())
    service._get_query = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(
            id="query-1",
            created_by="owner-1",
            is_shared=False,
            folder_id=None,
        )
    )

    with raises(NotFoundError):
        await service.get_api_query_detail(
            session=AsyncMock(),
            query_id="query-1",
            user_id="viewer-2",
            user_role=UserRole.VIEWER,
        )


async def test_public_execute_rejects_connection_mismatch() -> None:
    plaintext, key_hash, _prefix = _generate_api_key()
    conn_service = Mock()
    conn_service.get_by_id = AsyncMock()
    query_executor = Mock()
    query_executor.execute_read_only = AsyncMock()
    service = QueryAPIService(connection_service=conn_service, query_executor=query_executor)
    service._get_active_query = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(
            id="query-1",
            connection_id="conn-canonical",
            api_key_hash=key_hash,
            api_allowed_ips=None,
            api_rate_limit=None,
        )
    )
    service._log_execution = AsyncMock(return_value="log-1")  # type: ignore[method-assign]

    with raises(NotFoundError):
        await service.execute(
            session=AsyncMock(),
            query_id="query-1",
            connection_id="conn-attacker",
            api_key=plaintext,
            caller_ip="127.0.0.1",
            params={},
        )

    conn_service.get_by_id.assert_not_awaited()
    query_executor.execute_read_only.assert_not_awaited()


async def test_test_execute_uses_canonical_connection_and_checked_executor() -> None:
    conn_model = SimpleNamespace(db_type="postgresql", query_timeout_seconds=30)
    conn_service = Mock()
    conn_service.get_for_user = AsyncMock(return_value=conn_model)
    query_executor = Mock()
    query_executor.execute_read_only = AsyncMock(
        return_value=SimpleNamespace(
            columns=["id"],
            rows=[[7]],
            execution_time_ms=3,
        )
    )
    service = QueryAPIService(connection_service=conn_service, query_executor=query_executor)
    service._get_query = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(
            id="query-1",
            created_by="owner-1",
            connection_id="conn-canonical",
            api_enabled=True,
            api_parameters=[{"name": "id", "type": "integer", "required": True}],
            api_published_sql="SELECT * FROM users WHERE id = {id:integer}",
            sql="SELECT * FROM users WHERE id = {id:integer}",
            api_timeout_seconds=None,
            api_row_limit=10,
        )
    )

    result = await service.test_execute(
        session=AsyncMock(),
        query_id="query-1",
        connection_id="conn-canonical",
        user_id="owner-1",
        user_role=UserRole.EDITOR,
        params={"id": "7"},
    )

    conn_service.get_for_user.assert_awaited_once_with(
        "conn-canonical",
        "owner-1",
        UserRole.EDITOR,
    )
    query_executor.execute_read_only.assert_awaited_once()
    assert query_executor.execute_read_only.await_args.kwargs["max_rows"] == 10
    assert result == {
        "columns": ["id"],
        "rows": [[7]],
        "row_count": 1,
        "execution_time_ms": 3,
    }


async def test_public_execute_rejects_hosted_query_bound_to_inaccessible_connection() -> None:
    plaintext, key_hash, _prefix = _generate_api_key()
    conn_service = Mock()
    conn_service.get_by_id = AsyncMock(
        return_value=SimpleNamespace(id="conn-private", created_by="other-user", is_shared=False)
    )
    query_executor = Mock()
    query_executor.execute_read_only = AsyncMock()
    service = QueryAPIService(connection_service=conn_service, query_executor=query_executor)
    service._get_active_query = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(
            id="query-1",
            created_by="owner-1",
            connection_id="conn-private",
            api_key_hash=key_hash,
            api_allowed_ips=None,
            api_rate_limit=None,
        )
    )
    service._log_execution = AsyncMock(return_value="log-1")  # type: ignore[method-assign]

    with raises(ForbiddenError):
        await service.execute(
            session=AsyncMock(),
            query_id="query-1",
            connection_id="conn-private",
            api_key=plaintext,
            caller_ip="127.0.0.1",
            params={},
        )

    query_executor.execute_read_only.assert_not_awaited()


async def test_public_execute_passes_row_limit_to_checked_executor() -> None:
    plaintext, key_hash, _prefix = _generate_api_key()
    conn_service = Mock()
    conn_service.get_by_id = AsyncMock(
        return_value=SimpleNamespace(
            id="conn-1",
            created_by="owner-1",
            is_shared=False,
            db_type="postgresql",
            query_timeout_seconds=30,
        )
    )
    query_executor = Mock()
    query_executor.execute_read_only = AsyncMock(
        return_value=SimpleNamespace(
            columns=["id"],
            column_types=["int4"],
            rows=[[1], [2]],
            execution_time_ms=5,
        )
    )
    service = QueryAPIService(connection_service=conn_service, query_executor=query_executor)
    service._get_active_query = AsyncMock(  # type: ignore[method-assign]
        return_value=SimpleNamespace(
            id="query-1",
            created_by="owner-1",
            connection_id="conn-1",
            api_key_hash=key_hash,
            api_allowed_ips=None,
            api_rate_limit=None,
            api_parameters=[],
            api_published_sql="SELECT id FROM users",
            sql="SELECT id FROM users",
            api_timeout_seconds=None,
            api_row_limit=2,
        )
    )
    service._log_execution = AsyncMock(return_value="log-1")  # type: ignore[method-assign]

    response, execution_id = await service.execute(
        session=AsyncMock(),
        query_id="query-1",
        connection_id="conn-1",
        api_key=plaintext,
        caller_ip="127.0.0.1",
        params={},
    )

    assert execution_id == "log-1"
    assert response.row_count == 2
    assert query_executor.execute_read_only.await_args.kwargs["max_rows"] == 2
