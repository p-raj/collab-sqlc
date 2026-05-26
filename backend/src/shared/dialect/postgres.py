"""PostgreSQL dialect profile."""

from __future__ import annotations


class PostgresDialect:
    @property
    def id(self) -> str:
        return "postgresql"

    @property
    def dangerous_functions(self) -> frozenset[str]:
        return frozenset({
            # File system access
            "pg_read_file",
            "pg_read_binary_file",
            "pg_write_file",
            # Large object manipulation
            "lo_import",
            "lo_export",
            "lo_from_bytea",
            "lo_put",
            "lo_get",
            # Remote execution
            "dblink",
            "dblink_exec",
            "dblink_connect",
            # Copy (when available as function)
            "pg_copy_from",
            "pg_copy_to",
            # Sequence mutation
            "nextval",
            "setval",
            # Program execution (superuser)
            "pg_execute_server_program",
        })

    @property
    def read_only_prefixes(self) -> frozenset[str]:
        return frozenset({"select", "show", "describe", "explain", "with"})
