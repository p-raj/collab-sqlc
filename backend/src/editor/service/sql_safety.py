"""SQL safety classifier — determines if a query is read-only."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

import sqlglot
from sqlglot import exp

from src.shared.dialect.factory import get_dialect

if TYPE_CHECKING:
    from src.shared.dialect.base import DialectProfile

_WRITE_EXPRESSIONS = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,
    exp.Alter,
    exp.Merge,
)


def _has_dangerous_functions(stmt: exp.Expression | exp.Expr, dangerous: frozenset[str]) -> bool:
    """Check if the statement calls any dangerous functions for the given dialect.

    Checks both function-call positions (Func/Anonymous) and table-function
    positions (e.g., SELECT * FROM file('/etc/passwd') in ClickHouse).
    """
    if not dangerous:
        return False
    for func in stmt.find_all(exp.Func):
        func_name = (func.sql_name() if hasattr(func, "sql_name") else "").lower()
        if not func_name:
            func_name = getattr(func, "name", "") or ""
            func_name = func_name.lower() if isinstance(func_name, str) else ""
        if func_name in dangerous:
            return True
    for anon in stmt.find_all(exp.Anonymous):
        name = getattr(anon, "name", "") or ""
        if name.lower() in dangerous:
            return True
    # ClickHouse table functions (e.g., file(), s3(), remote()) are parsed as
    # Table nodes by sqlglot, not Func nodes. Check table names too.
    for table in stmt.find_all(exp.Table):
        table_name = getattr(table, "name", "") or ""
        if table_name.lower() in dangerous:
            return True
    return False


def _has_dangerous_function_text(sql: str, dangerous: frozenset[str]) -> bool:
    if not dangerous:
        return False
    names = "|".join(re.escape(name) for name in sorted(dangerous))
    separator = _sql_token_separator("*")
    return (
        re.search(rf"\b(?:{names}){separator}\(", sql, flags=re.IGNORECASE | re.DOTALL)
        is not None
    )


def _sql_token_separator(quantifier: str) -> str:
    comments = r"--[^\n]*(?:\n|$)|\#[^\n]*(?:\n|$)|//[^\n]*(?:\n|$)|/\*.*?\*/"
    return rf"(?:\s|{comments}){quantifier}"


def _normalize_bind_placeholders(sql: str) -> str:
    normalized = re.sub(r"%\([A-Za-z_][A-Za-z0-9_]*\)s", "0", sql)
    normalized = re.sub(r"\{[A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_]*\}", "0", normalized)
    return normalized


def _parse_statements(sql: str) -> list[exp.Expr | None] | None:
    try:
        return sqlglot.parse(sql)
    except sqlglot.errors.ParseError:
        normalized = _normalize_bind_placeholders(sql)
        if normalized == sql:
            return None
        try:
            return sqlglot.parse(normalized)
        except sqlglot.errors.ParseError:
            return None


def _extract_postgresql_explain_inner_sql(sql: str) -> str | None:
    stripped = sql.strip()
    explain_match = re.match(r"(?is)^explain\b\s*", stripped)
    if not explain_match:
        return None

    rest = stripped[explain_match.end() :].lstrip()
    if rest.startswith("("):
        depth = 0
        for index, char in enumerate(rest):
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    return rest[index + 1 :].lstrip() or None
        return None

    rest = re.sub(r"(?is)^(?:analyze|verbose)\b\s*", "", rest)
    return rest.lstrip() or None


def _has_clickhouse_settings_clause(sql: str) -> bool:
    separator = _sql_token_separator("+")
    optional_separator = _sql_token_separator("*")
    setting_name = r"[A-Za-z_][A-Za-z0-9_.]*"
    pattern = rf"\bsettings{separator}{setting_name}{optional_separator}="
    return re.search(pattern, sql, flags=re.IGNORECASE | re.DOTALL) is not None


def _has_into_clause(stmt: exp.Expression | exp.Expr) -> bool:
    """Check if a SELECT has an INTO clause (PostgreSQL SELECT INTO creates a table)."""
    # sqlglot may parse SELECT INTO as a Select with an Into node
    return bool(stmt.find(exp.Into))


_READ_ONLY_PREFIXES = frozenset({"select", "show", "describe", "explain", "with"})


def _looks_read_only(sql: str, dialect: DialectProfile | None = None) -> bool:
    """Fallback heuristic: check first keyword when sqlglot can't parse the SQL."""
    prefixes = dialect.read_only_prefixes if dialect else _READ_ONLY_PREFIXES
    first_word = sql.strip().split(None, 1)[0].lower() if sql.strip() else ""
    return first_word in prefixes


def is_read_only_query(sql: str, db_type: str | None = None) -> bool:
    """Returns True if the SQL contains only SELECT/SHOW/EXPLAIN/DESCRIBE statements."""
    dialect = get_dialect(db_type)
    read_only = dialect.read_only_prefixes
    dangerous = dialect.dangerous_functions

    if db_type == "clickhouse" and _has_clickhouse_settings_clause(sql):
        return False

    if db_type in {None, "postgresql"}:
        explain_inner_sql = _extract_postgresql_explain_inner_sql(sql)
        if explain_inner_sql is not None:
            return is_read_only_query(explain_inner_sql, db_type)

    statements = _parse_statements(sql)
    if statements is None:
        if _has_dangerous_function_text(sql, dangerous):
            return False
        return _looks_read_only(sql, dialect)

    for stmt in statements:
        if stmt is None:
            continue
        # Check if any node in the AST is a write operation
        if stmt.find(*_WRITE_EXPRESSIONS):
            return False
        # Block SELECT INTO (creates a table in PostgreSQL)
        if _has_into_clause(stmt):
            return False
        # Block dangerous functions (file I/O, remote execution)
        if _has_dangerous_functions(stmt, dangerous):
            return False
        # Also check top-level command type
        stmt_type = stmt.key.lower()
        if stmt_type == "command":
            # sqlglot falls back to Command for EXPLAIN, SHOW, etc.
            cmd_text = stmt.sql().strip().split(None, 1)[0].lower() if stmt.sql().strip() else ""
            if cmd_text not in read_only:
                return False
        elif stmt_type not in read_only:
            return False

    return True


def classify_statement(sql: str) -> str:
    """Returns the statement type: 'select', 'insert', 'update', 'delete', 'ddl', 'unknown'."""
    try:
        statements = sqlglot.parse(sql)
    except sqlglot.errors.ParseError:
        return "unknown"

    if not statements or statements[0] is None:
        return "unknown"

    stmt_type = statements[0].key.lower()

    ddl_types = {"create", "alter", "drop", "truncate", "rename"}
    if stmt_type in ddl_types:
        return "ddl"

    return stmt_type if stmt_type in {"select", "insert", "update", "delete"} else "unknown"
