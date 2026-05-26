import ssl

import pytest

from src.connections.drivers.base import ConnectionConfig
from src.connections.drivers.postgres import _build_ssl_context


def make_config(**overrides: object) -> ConnectionConfig:
    values = {
        "host": "localhost",
        "port": 5432,
        "database": "postgres",
        "username": "postgres",
        "password": "password",
    }
    values.update(overrides)
    return ConnectionConfig(**values)


def test_postgres_ssl_context_is_disabled_by_default() -> None:
    assert _build_ssl_context(make_config()) is None


def test_postgres_ssl_context_requires_tls_without_certificates() -> None:
    context = _build_ssl_context(make_config(ssl_enabled=True))

    assert context is not None
    assert context.verify_mode == ssl.CERT_NONE
    assert context.check_hostname is False


def test_postgres_ssl_context_requires_client_cert_and_key_together() -> None:
    with pytest.raises(ValueError, match="certificate and key"):
        _build_ssl_context(make_config(ssl_enabled=True, ssl_cert="certificate"))
