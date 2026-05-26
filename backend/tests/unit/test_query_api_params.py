from pytest import raises

from src.query_api.service.param_substitution import (
    mask_parameters_for_format,
    parse_parameters,
    restore_parameters_after_format,
    substitute_sql_for_dialect,
    validate_params,
)
from src.shared.domain.errors import ValidationError


def test_validate_params_coerces_number_type() -> None:
    validated = validate_params(
        provided={"org_id": "42", "score": "3.14"},
        schema=[
            {"name": "org_id", "type": "number", "required": True},
            {"name": "score", "type": "number", "required": True},
        ],
    )

    assert validated == {"org_id": 42, "score": 3.14}


def test_validate_params_uses_default_for_optional_param() -> None:
    validated = validate_params(
        provided={},
        schema=[
            {"name": "is_deleted", "type": "boolean", "required": False, "default": False},
        ],
    )

    assert validated == {"is_deleted": False}


def test_validate_params_uses_default_even_when_required() -> None:
    validated = validate_params(
        provided={},
        schema=[
            {"name": "org_id", "type": "number", "required": True, "default": 7},
        ],
    )

    assert validated == {"org_id": 7}


def test_validate_params_reports_missing_required_params() -> None:
    with raises(ValidationError, match="Missing required parameter: org_id"):
        validate_params(
            provided={},
            schema=[
                {"name": "org_id", "type": "number", "required": True},
            ],
        )


def test_substitute_sql_for_postgresql_uses_positional_binds() -> None:
    sql, params = substitute_sql_for_dialect(
        "SELECT * FROM users WHERE id = {id:integer} AND active = {active:boolean}",
        {"id": 7, "active": True},
        "postgresql",
    )

    assert sql == "SELECT * FROM users WHERE id = $1 AND active = $2"
    assert params == [7, True]


def test_substitute_sql_for_clickhouse_typed_uses_named_binds() -> None:
    sql, params = substitute_sql_for_dialect(
        "SELECT * FROM events WHERE user_id = {user_id:integer}",
        {"user_id": 7},
        "clickhouse",
    )

    assert sql == "SELECT * FROM events WHERE user_id = %(user_id)s"
    assert params == {"user_id": 7}


def test_substitute_sql_for_clickhouse_untyped_reuses_named_binds() -> None:
    sql, params = substitute_sql_for_dialect(
        "SELECT * FROM events WHERE org_id = $org_id OR parent_org_id = $org_id",
        {"org_id": 42},
        "clickhouse",
    )

    assert sql == "SELECT * FROM events WHERE org_id = %(org_id)s OR parent_org_id = %(org_id)s"
    assert params == {"org_id": 42}


def test_parse_parameters_ignores_strings_and_comments() -> None:
    assert parse_parameters(
        "SELECT '$literal' AS literal, id FROM users "
        "WHERE id = $id -- keep {ignored:integer}",
    ) == [{"name": "id", "type": "any", "required": True, "default": None}]


def test_substitute_sql_ignores_strings_and_comments() -> None:
    sql, params = substitute_sql_for_dialect(
        "SELECT '$literal' AS literal, id FROM users "
        "WHERE id = $id -- keep $ignored",
        {"id": 7, "literal": "ignored", "ignored": "comment"},
        "postgresql",
    )

    assert sql == "SELECT '$literal' AS literal, id FROM users WHERE id = $1 -- keep $ignored"
    assert params == [7]


def test_substitute_sql_ignores_backslash_escaped_quotes_in_strings() -> None:
    sql, params = substitute_sql_for_dialect(
        r"SELECT 'it\'s $literal' AS literal, $id AS id",
        {"id": 7, "literal": "ignored"},
        "clickhouse",
    )

    assert sql == r"SELECT 'it\'s $literal' AS literal, %(id)s AS id"
    assert params == {"id": 7}


def test_postgresql_normal_strings_do_not_treat_backslash_as_quote_escape() -> None:
    sql, params = substitute_sql_for_dialect(
        r"SELECT 'a\' AS literal, $id AS id",
        {"id": 7},
        "postgresql",
    )

    assert sql == r"SELECT 'a\' AS literal, $1 AS id"
    assert params == [7]


def test_clickhouse_substitution_escapes_literal_percent_signs() -> None:
    sql, params = substitute_sql_for_dialect(
        "SELECT * FROM events WHERE name LIKE '%foo%' AND value % 2 = {remainder:integer}",
        {"remainder": 1},
        "clickhouse",
    )

    assert sql == (
        "SELECT * FROM events WHERE name LIKE '%%foo%%' "
        "AND value %% 2 = %(remainder)s"
    )
    assert params == {"remainder": 1}


def test_mask_parameters_for_format_preserves_dynamic_placeholders() -> None:
    masked_sql, replacements = mask_parameters_for_format(
        "SELECT * FROM users WHERE name = $org_name AND id = {org_id:integer}",
    )

    assert masked_sql == (
        "SELECT * FROM users WHERE name = __CODB_FORMAT_PARAM_0__ "
        "AND id = __CODB_FORMAT_PARAM_1__"
    )
    assert restore_parameters_after_format(masked_sql, replacements) == (
        "SELECT * FROM users WHERE name = $org_name AND id = {org_id:integer}"
    )


def test_mask_parameters_for_format_ignores_strings_and_comments() -> None:
    masked_sql, replacements = mask_parameters_for_format(
        "SELECT '$org_name' AS literal, id FROM users "
        "WHERE id = $org_id -- keep {ignored:integer}",
    )

    assert "'$org_name'" in masked_sql
    assert "-- keep {ignored:integer}" in masked_sql
    assert "__CODB_FORMAT_PARAM_0__" in masked_sql
    assert replacements == {"__CODB_FORMAT_PARAM_0__": "$org_id"}


def test_mask_parameters_for_format_avoids_existing_sentinel_text() -> None:
    masked_sql, replacements = mask_parameters_for_format(
        "SELECT __CODB_FORMAT_PARAM_0__, $org_name FROM users",
    )

    assert masked_sql == "SELECT __CODB_FORMAT_PARAM_0__, __CODB_FORMAT_PARAM_1__ FROM users"
    assert restore_parameters_after_format(masked_sql, replacements) == (
        "SELECT __CODB_FORMAT_PARAM_0__, $org_name FROM users"
    )


def test_mask_parameters_for_format_ignores_postgresql_escape_strings() -> None:
    masked_sql, replacements = mask_parameters_for_format(
        r"SELECT E'it\'s {name:integer}' AS literal, {org_id:integer} AS id",
    )

    assert r"E'it\'s {name:integer}'" in masked_sql
    assert "__CODB_FORMAT_PARAM_0__ AS id" in masked_sql
    assert replacements == {"__CODB_FORMAT_PARAM_0__": "{org_id:integer}"}


def test_mask_parameters_for_format_ignores_dollar_quoted_strings() -> None:
    masked_sql, replacements = mask_parameters_for_format(
        "SELECT $$hello {name:integer} $org_name$$ AS literal, $org_id AS id",
    )

    assert "$$hello {name:integer} $org_name$$" in masked_sql
    assert "__CODB_FORMAT_PARAM_0__ AS id" in masked_sql
    assert replacements == {"__CODB_FORMAT_PARAM_0__": "$org_id"}
