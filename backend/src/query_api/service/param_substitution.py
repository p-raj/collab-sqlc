"""Parameter parsing and substitution for Query-as-API.

Supports three parameter syntaxes:
- No parameters: query runs as-is
- Typed: {name:type} — strict type validation
- Untyped: $name — presence-only validation
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from src.connections.engine_registry import get_database_engine_or_default
from src.shared.domain.errors import ValidationError

# {name:type} → typed parameter
_TYPED_PARAM_RE = re.compile(r"\{(\w+):(\w+)\}")

# $name → untyped parameter (but NOT inside {name:type} blocks)
_UNTYPED_PARAM_RE = re.compile(r"\$(\w+)")

VALID_TYPES = frozenset({"string", "integer", "float", "number", "boolean", "uuid", "any"})


@dataclass(frozen=True)
class _Placeholder:
    start: int
    end: int
    raw: str
    name: str
    ptype: str
    kind: Literal["typed", "untyped"]


def parse_parameters(sql: str, db_type: str | None = None) -> list[dict[str, Any]]:
    """Parse SQL to detect parameter placeholders and return their schema.

    Returns list of {"name": str, "type": str, "required": True, "default": None}.
    """
    placeholders = _collect_placeholders(
        sql,
        supports_backslash_strings=_uses_backslash_string_escapes(db_type),
    )
    typed_params = [placeholder for placeholder in placeholders if placeholder.kind == "typed"]
    if typed_params:
        return [
            {"name": placeholder.name, "type": placeholder.ptype, "required": True, "default": None}
            for placeholder in typed_params
        ]

    untyped_params = [
        placeholder for placeholder in placeholders if placeholder.kind == "untyped"
    ]
    if untyped_params:
        # Deduplicate preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for placeholder in untyped_params:
            if placeholder.name not in seen:
                seen.add(placeholder.name)
                unique.append(placeholder.name)
        return [{"name": name, "type": "any", "required": True, "default": None} for name in unique]

    return []


def validate_params(
    provided: dict[str, Any],
    schema: list[dict[str, Any]],
) -> dict[str, Any]:
    """Validate caller-provided params against the defined schema.

    Returns the validated params dict (with defaults filled in).
    Raises ValidationError if validation fails.
    """
    if not schema:
        return {}

    validated: dict[str, Any] = {}
    errors: list[str] = []

    for param_def in schema:
        name = param_def["name"]
        ptype = param_def.get("type", "any")
        required = param_def.get("required", True)
        default = param_def.get("default")

        if name not in provided:
            if default is not None:
                validated[name] = _coerce_type(name, default, ptype, errors)
                continue
            if required:
                errors.append(f"Missing required parameter: {name}")
                continue
            validated[name] = default
            continue

        value = provided[name]
        validated[name] = _coerce_type(name, value, ptype, errors)

    if errors:
        raise ValidationError("; ".join(errors))

    return validated


def substitute_sql(
    sql: str,
    params: dict[str, Any],
) -> tuple[str, list[Any]]:
    """Replace parameter placeholders with PostgreSQL positional bind markers.

    Returns (modified_sql, ordered_values) ready for asyncpg/driver execution.
    """
    final_sql, bind_values = substitute_sql_for_dialect(sql, params, "postgresql")
    return final_sql, list(bind_values.values()) if isinstance(bind_values, dict) else bind_values


def mask_parameters_for_format(
    sql: str,
    db_type: str | None = None,
) -> tuple[str, dict[str, str]]:
    """Replace Query-as-API placeholders with SQL-safe sentinels for formatting."""
    replacements: dict[str, str] = {}
    counter = 0

    def make_replacement(placeholder: _Placeholder) -> str:
        nonlocal counter
        sentinel, counter = _next_format_sentinel(sql, replacements, counter)
        replacements[sentinel] = placeholder.raw
        return sentinel

    masked_sql = _replace_placeholders(
        sql,
        _collect_placeholders(
            sql,
            supports_backslash_strings=_uses_backslash_string_escapes(db_type),
        ),
        make_replacement,
    )
    return masked_sql, replacements


def restore_parameters_after_format(sql: str, replacements: dict[str, str]) -> str:
    """Restore Query-as-API placeholders after SQL formatting."""
    restored = sql
    for sentinel, placeholder in replacements.items():
        restored = restored.replace(sentinel, placeholder)
    return restored


def _next_format_sentinel(
    original_sql: str,
    replacements: dict[str, str],
    counter: int,
) -> tuple[str, int]:
    while True:
        sentinel = f"__CODB_FORMAT_PARAM_{counter}__"
        counter += 1
        if sentinel not in original_sql and sentinel not in replacements:
            return sentinel, counter


def substitute_sql_for_dialect(
    sql: str,
    params: dict[str, Any],
    db_type: str | None,
) -> tuple[str, list[Any] | dict[str, Any]]:
    """Replace Query-as-API placeholders with driver-compatible bind markers."""
    if not params:
        return sql, []

    placeholders = _collect_placeholders(
        sql,
        supports_backslash_strings=_uses_backslash_string_escapes(db_type),
    )
    typed_placeholders = [
        placeholder for placeholder in placeholders if placeholder.kind == "typed"
    ]
    untyped_placeholders = [
        placeholder for placeholder in placeholders if placeholder.kind == "untyped"
    ]

    bind_style = get_database_engine_or_default(db_type).parameter_binding.placeholder_style

    if bind_style == "pyformat_named":
        if typed_placeholders:
            return _substitute_named(sql, typed_placeholders, params)
        if untyped_placeholders:
            return _substitute_named(sql, untyped_placeholders, params)
        return sql, []

    # Determine which syntax is used
    if typed_placeholders:
        return _substitute_positional(sql, typed_placeholders, params, reuse_names=False)
    if untyped_placeholders:
        return _substitute_positional(sql, untyped_placeholders, params, reuse_names=True)

    return sql, []


def _substitute_positional(
    sql: str,
    placeholders: list[_Placeholder],
    params: dict[str, Any],
    *,
    reuse_names: bool,
) -> tuple[str, list[Any]]:
    """Replace placeholders with PostgreSQL positional binds."""
    values: list[Any] = []
    name_to_pos: dict[str, int] = {}

    def make_replacement(placeholder: _Placeholder) -> str:
        if reuse_names and placeholder.name in name_to_pos:
            return f"${name_to_pos[placeholder.name]}"
        values.append(params.get(placeholder.name))
        position = len(values)
        name_to_pos[placeholder.name] = position
        return f"${position}"

    result_sql = _replace_placeholders(sql, placeholders, make_replacement)
    return result_sql, values


def _substitute_named(
    sql: str,
    placeholders: list[_Placeholder],
    params: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    """Replace placeholders with named pyformat binds."""
    bind_params: dict[str, Any] = {}

    def make_replacement(placeholder: _Placeholder) -> str:
        bind_params[placeholder.name] = params.get(placeholder.name)
        return f"%({placeholder.name})s"

    result_sql = _replace_placeholders(
        sql,
        placeholders,
        make_replacement,
        escape_percent=True,
    )
    return result_sql, bind_params


def _collect_placeholders(
    sql: str,
    *,
    supports_backslash_strings: bool = False,
) -> list[_Placeholder]:
    placeholders: list[_Placeholder] = []
    index = 0

    while index < len(sql):
        if sql.startswith("--", index):
            next_newline = sql.find("\n", index)
            if next_newline == -1:
                break
            index = next_newline
            continue

        if sql.startswith("/*", index):
            comment_end = sql.find("*/", index + 2)
            if comment_end == -1:
                break
            index = comment_end + 2
            continue

        if index + 1 < len(sql) and sql[index] in {"e", "E"} and sql[index + 1] == "'":
            _, index = _consume_escape_string(sql, index)
            continue

        dollar_quoted = _consume_dollar_quoted(sql, index)
        if dollar_quoted is not None:
            _, index = dollar_quoted
            continue

        if sql[index] in {"'", '"'}:
            _, index = _consume_quoted(
                sql,
                index,
                supports_backslash_escapes=supports_backslash_strings,
            )
            continue

        typed_match = _TYPED_PARAM_RE.match(sql, index)
        if typed_match:
            placeholders.append(
                _Placeholder(
                    start=index,
                    end=typed_match.end(),
                    raw=typed_match.group(0),
                    name=typed_match.group(1),
                    ptype=typed_match.group(2),
                    kind="typed",
                )
            )
            index = typed_match.end()
            continue

        untyped_match = _UNTYPED_PARAM_RE.match(sql, index)
        if untyped_match:
            placeholders.append(
                _Placeholder(
                    start=index,
                    end=untyped_match.end(),
                    raw=untyped_match.group(0),
                    name=untyped_match.group(1),
                    ptype="any",
                    kind="untyped",
                )
            )
            index = untyped_match.end()
            continue

        index += 1

    return placeholders


def _replace_placeholders(
    sql: str,
    placeholders: list[_Placeholder],
    make_replacement: Callable[[_Placeholder], str],
    *,
    escape_percent: bool = False,
) -> str:
    parts: list[str] = []
    index = 0

    for placeholder in placeholders:
        parts.append(_prepare_sql_segment(sql[index : placeholder.start], escape_percent))
        parts.append(make_replacement(placeholder))
        index = placeholder.end

    parts.append(_prepare_sql_segment(sql[index:], escape_percent))
    return "".join(parts)


def _prepare_sql_segment(segment: str, escape_percent: bool) -> str:
    if not escape_percent:
        return segment
    return segment.replace("%", "%%")


def _consume_quoted(
    sql: str,
    start: int,
    *,
    supports_backslash_escapes: bool = False,
) -> tuple[str, int]:
    quote = sql[start]
    index = start + 1

    while index < len(sql):
        if supports_backslash_escapes and quote == "'" and sql[index] == "\\":
            index += 2
            continue
        if sql[index] == quote:
            if index + 1 < len(sql) and sql[index + 1] == quote:
                index += 2
                continue
            return sql[start : index + 1], index + 1
        index += 1

    return sql[start:], len(sql)


def _uses_backslash_string_escapes(db_type: str | None) -> bool:
    return db_type == "clickhouse"


def _consume_escape_string(sql: str, start: int) -> tuple[str, int]:
    index = start + 2

    while index < len(sql):
        if sql[index] == "\\":
            index += 2
            continue
        if sql[index] == "'":
            if index + 1 < len(sql) and sql[index + 1] == "'":
                index += 2
                continue
            return sql[start : index + 1], index + 1
        index += 1

    return sql[start:], len(sql)


def _consume_dollar_quoted(sql: str, start: int) -> tuple[str, int] | None:
    opening = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", sql[start:])
    if not opening:
        return None

    delimiter = opening.group(0)
    content_start = start + len(delimiter)
    content_end = sql.find(delimiter, content_start)
    if content_end == -1:
        return None

    end = content_end + len(delimiter)
    return sql[start:end], end


def _coerce_type(name: str, value: Any, ptype: str, errors: list[str]) -> Any:
    """Validate and coerce a value to the declared type."""
    if ptype == "any" or ptype == "string":
        return value

    if ptype == "integer":
        try:
            return int(value)
        except (ValueError, TypeError):
            errors.append(f"Parameter '{name}' must be an integer, got: {value!r}")
            return value

    if ptype == "float":
        try:
            return float(value)
        except (ValueError, TypeError):
            errors.append(f"Parameter '{name}' must be a float, got: {value!r}")
            return value

    if ptype == "number":
        try:
            text = str(value).strip()
            if re.fullmatch(r"[-+]?\d+", text):
                return int(text)
            return float(text)
        except (ValueError, TypeError):
            errors.append(f"Parameter '{name}' must be a number, got: {value!r}")
            return value

    if ptype == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            if value.lower() in ("true", "1", "yes"):
                return True
            if value.lower() in ("false", "0", "no"):
                return False
        errors.append(f"Parameter '{name}' must be a boolean, got: {value!r}")
        return value

    if ptype == "uuid":
        import uuid as uuid_mod

        try:
            return str(uuid_mod.UUID(str(value)))
        except ValueError:
            errors.append(f"Parameter '{name}' must be a valid UUID, got: {value!r}")
            return value

    return value
