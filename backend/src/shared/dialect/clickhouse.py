"""ClickHouse dialect profile."""

from __future__ import annotations


class ClickHouseDialect:
    @property
    def id(self) -> str:
        return "clickhouse"

    @property
    def dangerous_functions(self) -> frozenset[str]:
        # Note: SYSTEM commands (SYSTEM SHUTDOWN, etc.) are already blocked
        # by read_only_prefixes — "system" is not a read-only prefix.
        return frozenset({
            # File access table functions
            "file",
            "filecluster",
            "s3",
            "s3cluster",
            "url",
            "urlcluster",
            "hdfs",
            "hdfscluster",
            "azureblobstorage",
            "azureblobstoragecluster",
            "gcs",
            "gcscluster",
            # Remote execution table functions
            "remote",
            "remotesecure",
            "cluster",
            "executable",
            "executablepool",
            # Input table functions that can read external resources
            "input",
            "mysql",
            "postgresql",
            "jdbc",
            "odbc",
            "mongodb",
            "redis",
            "sqlite",
        })

    @property
    def read_only_prefixes(self) -> frozenset[str]:
        return frozenset({
            "select", "show", "describe", "explain", "exists", "with",
        })
