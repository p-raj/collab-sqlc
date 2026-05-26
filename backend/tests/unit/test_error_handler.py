from src.shared.middleware.error_handler import _get_db_error_message


class FakePostgresError(Exception):
    sqlstate = "42601"
    position = "7"

    def __str__(self) -> str:
        return "syntax error"


ClickHouseError = type(
    "DatabaseError",
    (Exception,),
    {
        "__module__": "clickhouse_connect.driver.exceptions",
        "__str__": lambda self: "ClickHouse syntax error",
    },
)


def test_get_db_error_message_extracts_postgres_position() -> None:
    assert _get_db_error_message(FakePostgresError()) == ("syntax error", 7)


def test_get_db_error_message_uses_engine_driver_error_profile() -> None:
    assert _get_db_error_message(ClickHouseError()) == ("ClickHouse syntax error", None)
