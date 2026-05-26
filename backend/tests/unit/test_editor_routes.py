from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.connections.drivers.base import QueryResult
from src.editor.api.routes import ExportQueryRequest, FormatSqlRequest, export_query, format_sql
from src.shared.domain.types import UserRole


@pytest.mark.asyncio
async def test_export_non_streaming_engine_uses_safe_execute_path() -> None:
    conn_model = SimpleNamespace(db_type="clickhouse")
    conn_service = SimpleNamespace(
        get_for_user=AsyncMock(return_value=conn_model),
    )
    executor = SimpleNamespace(
        execute=AsyncMock(
            return_value=QueryResult(
                columns=["id"],
                column_types=["UInt64"],
                rows=[[1]],
                row_count=1,
                execution_time_ms=1.0,
            ),
        ),
        execute_direct=AsyncMock(),
    )
    user = SimpleNamespace(id="user-1", role=UserRole.VIEWER)

    await export_query(
        ExportQueryRequest(connection_id="conn-1", sql="SELECT * FROM events"),
        user,
        executor,
        conn_service,
    )

    executor.execute.assert_awaited_once_with(
        conn_model=conn_model,
        sql="SELECT * FROM events",
        user_role=UserRole.VIEWER,
        params=None,
        write_mode=False,
        user_id="user-1",
    )
    executor.execute_direct.assert_not_called()


@pytest.mark.asyncio
async def test_export_streaming_engine_uses_streaming_path() -> None:
    async def row_iter():
        yield [[1]]

    conn_model = SimpleNamespace(db_type="postgresql")
    conn_service = SimpleNamespace(
        get_for_user=AsyncMock(return_value=conn_model),
    )
    executor = SimpleNamespace(
        execute_streaming=AsyncMock(return_value=(["id"], row_iter())),
        execute=AsyncMock(),
    )
    user = SimpleNamespace(id="user-1", role=UserRole.EDITOR)

    await export_query(
        ExportQueryRequest(connection_id="conn-1", sql="SELECT * FROM events"),
        user,
        executor,
        conn_service,
    )

    executor.execute_streaming.assert_awaited_once_with(
        conn_model=conn_model,
        sql="SELECT * FROM events",
        user_role=UserRole.EDITOR,
        params=None,
    )
    executor.execute.assert_not_called()


@pytest.mark.asyncio
async def test_format_sql_preserves_query_api_parameters() -> None:
    response = await format_sql(
        FormatSqlRequest(
            sql=(
                "select * from users "
                "where org_name = $org_name and org_id = {org_id:integer}"
            ),
            dialect="postgresql",
        ),
        SimpleNamespace(),
    )

    assert "$org_name" in response.sql
    assert "{org_id:integer}" in response.sql
    assert "__CODB_FORMAT_PARAM_" not in response.sql
    assert response.sql.startswith("SELECT\n")


@pytest.mark.asyncio
async def test_format_sql_preserves_clickhouse_parameters() -> None:
    response = await format_sql(
        FormatSqlRequest(
            sql=(
                "select count() from events "
                "where org_name = $org_name and org_id = {org_id:integer}"
            ),
            dialect="clickhouse",
        ),
        SimpleNamespace(),
    )

    assert "$org_name" in response.sql
    assert "{org_id:integer}" in response.sql
    assert "__CODB_FORMAT_PARAM_" not in response.sql
    assert response.sql.startswith("SELECT\n")


@pytest.mark.asyncio
async def test_format_sql_preserves_parameters_after_postgresql_escape_string() -> None:
    response = await format_sql(
        FormatSqlRequest(
            sql=r"select E'it\'s {name:integer}' as literal, {org_id:integer} as id",
            dialect="postgresql",
        ),
        SimpleNamespace(),
    )

    assert "{name:integer}" in response.sql
    assert "{org_id:integer}" in response.sql
    assert "STRUCT(integer AS org_id)" not in response.sql
    assert "__CODB_FORMAT_PARAM_" not in response.sql
