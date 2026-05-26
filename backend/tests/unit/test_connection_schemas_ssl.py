import pytest

from src.connections.domain.schemas import (
    ConnectionCreateRequest,
)
from src.connections.domain.schemas import (
    TestConnectionRequest as ConnectionTestRequest,
)


def test_connection_create_requires_ca_for_client_certificates() -> None:
    with pytest.raises(ValueError, match="CA certificate is required"):
        ConnectionCreateRequest(
            name="PG",
            db_type="postgresql",
            host="localhost",
            port=5432,
            database="postgres",
            username="postgres",
            password="password",
            ssl_enabled=True,
            ssl_cert="client-cert",
            ssl_key="client-key",
        )


def test_test_connection_requires_ca_for_client_certificates() -> None:
    with pytest.raises(ValueError, match="CA certificate is required"):
        ConnectionTestRequest(
            db_type="postgresql",
            host="localhost",
            port=5432,
            database="postgres",
            username="postgres",
            password="password",
            ssl_enabled=True,
            ssl_cert="client-cert",
            ssl_key="client-key",
        )
