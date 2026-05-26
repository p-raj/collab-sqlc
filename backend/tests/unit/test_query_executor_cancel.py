from src.connections.drivers.base import ConnectionConfig
from src.editor.service.query_executor import QueryExecutor, _running_queries, _RunningQuery


class FakeDriver:
    def __init__(self, cancelled: bool) -> None:
        self.cancelled = cancelled
        self.cancel_calls: list[tuple[ConnectionConfig, int]] = []

    async def cancel_backend(self, config: ConnectionConfig, backend_pid: int) -> bool:
        self.cancel_calls.append((config, backend_pid))
        return self.cancelled


def _config() -> ConnectionConfig:
    return ConnectionConfig(
        host="localhost",
        port=5432,
        database="collabsql",
        username="user",
        password="secret",
    )


async def test_cancel_query_delegates_to_running_driver() -> None:
    config = _config()
    driver = FakeDriver(cancelled=True)
    _running_queries["query-1"] = _RunningQuery(
        driver=driver,  # type: ignore[arg-type]
        config=config,
        connection=object(),
        backend_pid=123,
        user_id="user-1",
        supports_cancel=True,
    )

    try:
        assert await QueryExecutor.cancel_query("query-1", "user-1") is True
    finally:
        _running_queries.pop("query-1", None)

    assert driver.cancel_calls == [(config, 123)]


async def test_cancel_query_does_not_delegate_when_driver_cannot_cancel() -> None:
    config = _config()
    driver = FakeDriver(cancelled=True)
    _running_queries["query-2"] = _RunningQuery(
        driver=driver,  # type: ignore[arg-type]
        config=config,
        connection=object(),
        backend_pid=123,
        user_id="user-1",
        supports_cancel=False,
    )

    try:
        assert await QueryExecutor.cancel_query("query-2", "user-1") is False
    finally:
        _running_queries.pop("query-2", None)

    assert driver.cancel_calls == []
