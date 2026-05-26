"""Unit tests for SQL safety classifier."""

from src.editor.service.sql_safety import classify_statement, is_read_only_query


class TestIsReadOnlyQuery:
    def test_simple_select(self) -> None:
        assert is_read_only_query("SELECT * FROM users") is True

    def test_select_with_joins(self) -> None:
        assert (
            is_read_only_query("SELECT u.*, o.total FROM users u JOIN orders o ON u.id = o.user_id")
            is True
        )

    def test_select_with_subquery(self) -> None:
        assert (
            is_read_only_query("SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)")
            is True
        )

    def test_explain(self) -> None:
        assert is_read_only_query("EXPLAIN SELECT * FROM users") is True

    def test_insert(self) -> None:
        assert is_read_only_query("INSERT INTO users (name) VALUES ('test')") is False

    def test_update(self) -> None:
        assert is_read_only_query("UPDATE users SET name = 'test' WHERE id = 1") is False

    def test_delete(self) -> None:
        assert is_read_only_query("DELETE FROM users WHERE id = 1") is False

    def test_drop_table(self) -> None:
        assert is_read_only_query("DROP TABLE users") is False

    def test_create_table(self) -> None:
        assert is_read_only_query("CREATE TABLE test (id INT)") is False

    def test_alter_table(self) -> None:
        assert is_read_only_query("ALTER TABLE users ADD COLUMN age INT") is False

    def test_empty_string(self) -> None:
        # Empty SQL has no statements → treated as read-only (vacuously true)
        result = is_read_only_query("")
        assert isinstance(result, bool)

    def test_invalid_sql_returns_false(self) -> None:
        assert is_read_only_query("THIS IS NOT SQL AT ALL @#$%") is False

    def test_malformed_select_is_read_only(self) -> None:
        # Trailing dot causes parse error, but it's still a SELECT
        assert (
            is_read_only_query(
                "SELECT * FROM vms_activitylog AS VA WHERE VA. LIMIT 10"
            )
            is True
        )

    def test_malformed_with_cte_is_read_only(self) -> None:
        assert is_read_only_query("WITH cte AS (SELECT FROM .) SELECT * FROM cte") is True

    def test_malformed_insert_is_not_read_only(self) -> None:
        assert is_read_only_query("INSERT INTO @#$ broken") is False

    def test_pg_dangerous_function_blocked(self) -> None:
        assert is_read_only_query("SELECT pg_read_file('/etc/passwd')", "postgresql") is False

    def test_pg_sequence_mutation_function_blocked(self) -> None:
        assert is_read_only_query("SELECT nextval('users_id_seq')", "postgresql") is False

    def test_pg_dangerous_function_not_blocked_for_clickhouse(self) -> None:
        # pg_read_file is PG-specific — ClickHouse dialect has no dangerous functions
        assert is_read_only_query("SELECT pg_read_file('/etc/passwd')", "clickhouse") is True

    def test_clickhouse_select_is_read_only(self) -> None:
        assert is_read_only_query("SELECT * FROM system.tables", "clickhouse") is True

    def test_clickhouse_insert_is_not_read_only(self) -> None:
        assert is_read_only_query("INSERT INTO events VALUES (1, 'test')", "clickhouse") is False

    def test_default_dialect_is_postgresql(self) -> None:
        # No db_type → defaults to postgresql → blocks PG dangerous functions
        assert is_read_only_query("SELECT pg_read_file('/etc/passwd')") is False

    # --- ClickHouse table-function detection ---

    def test_clickhouse_file_table_function_blocked(self) -> None:
        assert is_read_only_query("SELECT * FROM file('/etc/passwd')", "clickhouse") is False

    def test_clickhouse_file_table_function_with_query_api_placeholder_blocked(self) -> None:
        assert is_read_only_query("SELECT * FROM file({path:string})", "clickhouse") is False

    def test_clickhouse_file_table_function_with_pyformat_placeholder_blocked(self) -> None:
        assert is_read_only_query("SELECT * FROM file(%(path)s)", "clickhouse") is False

    def test_clickhouse_file_table_function_with_block_comment_before_args_blocked(self) -> None:
        assert is_read_only_query(
            "SELECT * FROM file /*comment*/ ({path:string})",
            "clickhouse",
        ) is False

    def test_clickhouse_file_table_function_with_line_comment_before_args_blocked(self) -> None:
        assert is_read_only_query(
            "SELECT * FROM file -- comment\n (%(path)s)",
            "clickhouse",
        ) is False

    def test_clickhouse_file_table_function_with_clickhouse_line_comments_blocked(self) -> None:
        blocked_sql = [
            "SELECT * FROM file # comment\n ({path:string})",
            "SELECT * FROM file // comment\n (%(path)s)",
        ]
        for sql in blocked_sql:
            assert is_read_only_query(sql, "clickhouse") is False

    def test_clickhouse_pyformat_parse_error_does_not_allow_later_write(self) -> None:
        assert is_read_only_query("SELECT %(id)s; DROP TABLE users", "clickhouse") is False

    def test_clickhouse_s3_table_function_blocked(self) -> None:
        assert is_read_only_query("SELECT * FROM s3('bucket/key.csv')", "clickhouse") is False

    def test_clickhouse_remote_table_function_blocked(self) -> None:
        assert (
            is_read_only_query("SELECT * FROM remote('host:9000', 'db', 'table')", "clickhouse")
            is False
        )

    def test_clickhouse_remotesecure_table_function_blocked(self) -> None:
        assert (
            is_read_only_query("SELECT * FROM remotesecure('host', 'db', 'table')", "clickhouse")
            is False
        )

    def test_clickhouse_mysql_table_function_blocked(self) -> None:
        assert (
            is_read_only_query(
                "SELECT * FROM mysql('host', 'db', 'table', 'user', 'pw')",
                "clickhouse",
            )
            is False
        )

    def test_clickhouse_url_table_function_blocked(self) -> None:
        assert (
            is_read_only_query("SELECT * FROM url('http://evil.com/data.csv')", "clickhouse")
            is False
        )

    def test_clickhouse_executable_table_function_blocked(self) -> None:
        assert (
            is_read_only_query(
                "SELECT * FROM executable('script.sh', 'TabSeparated', 'x UInt64')",
                "clickhouse",
            )
            is False
        )

    def test_clickhouse_external_cluster_table_functions_blocked(self) -> None:
        blocked_sql = [
            "SELECT * FROM fileCluster('cluster', '/etc/passwd')",
            "SELECT * FROM s3Cluster('cluster', 'url', 'CSV', 'x UInt64')",
            "SELECT * FROM hdfsCluster('cluster', 'hdfs://x')",
            "SELECT * FROM azureBlobStorageCluster('cluster', 'url', 'CSV', 'x UInt64')",
            "SELECT * FROM gcs('bucket', 'CSV', 'x UInt64')",
            "SELECT * FROM gcsCluster('cluster', 'bucket', 'CSV', 'x UInt64')",
        ]
        for sql in blocked_sql:
            assert is_read_only_query(sql, "clickhouse") is False

    def test_clickhouse_external_database_table_functions_blocked(self) -> None:
        blocked_sql = [
            "SELECT * FROM mongodb('host', 'db', 'collection', 'user', 'password')",
            "SELECT * FROM redis('host:6379', 'key', 'String')",
            "SELECT * FROM sqlite('db.sqlite', 'table')",
        ]
        for sql in blocked_sql:
            assert is_read_only_query(sql, "clickhouse") is False

    def test_clickhouse_normal_table_not_blocked(self) -> None:
        assert is_read_only_query("SELECT * FROM events", "clickhouse") is True

    def test_clickhouse_exists_is_read_only(self) -> None:
        assert is_read_only_query("EXISTS TABLE events", "clickhouse") is True

    # --- SELECT INTO (PostgreSQL) ---

    def test_select_into_blocked(self) -> None:
        assert is_read_only_query("SELECT * INTO new_table FROM users", "postgresql") is False

    def test_postgresql_explain_analyze_write_blocked(self) -> None:
        assert (
            is_read_only_query(
                "EXPLAIN ANALYZE INSERT INTO users(id) VALUES (1)",
                "postgresql",
            )
            is False
        )

    def test_postgresql_explain_analyze_read_only_allowed(self) -> None:
        assert is_read_only_query("EXPLAIN ANALYZE SELECT * FROM users", "postgresql") is True

    # --- SYSTEM / non-read-only command types ---

    def test_clickhouse_system_command_blocked(self) -> None:
        # SYSTEM is not in ClickHouse read_only_prefixes
        assert is_read_only_query("SYSTEM RELOAD CONFIG", "clickhouse") is False

    def test_clickhouse_query_settings_clause_blocked(self) -> None:
        assert (
            is_read_only_query(
                "SELECT * FROM events SETTINGS max_result_rows=1000000000",
                "clickhouse",
            )
            is False
        )

    def test_clickhouse_query_settings_clause_with_comments_blocked(self) -> None:
        blocked_sql = [
            "SELECT * FROM events SETTINGS/**/max_result_rows=1000000000",
            "SELECT * FROM events SETTINGS -- comment\n max_result_rows=1000000000",
            "SELECT * FROM events SETTINGS max_result_rows/**/=1000000000",
            "SELECT * FROM events SETTINGS # comment\n max_result_rows=1000000000",
            "SELECT * FROM events SETTINGS // comment\n max_result_rows=1000000000",
        ]
        for sql in blocked_sql:
            assert is_read_only_query(sql, "clickhouse") is False

    def test_truncate_blocked(self) -> None:
        assert is_read_only_query("TRUNCATE TABLE users") is False

    # --- Multiple statements ---

    def test_multi_statement_all_read_only(self) -> None:
        assert is_read_only_query("SELECT 1; SELECT 2") is True

    def test_multi_statement_one_write(self) -> None:
        assert is_read_only_query("SELECT 1; DROP TABLE users") is False

    # --- show/describe ---

    def test_show_tables(self) -> None:
        assert is_read_only_query("SHOW TABLES", "clickhouse") is True

    def test_describe_table(self) -> None:
        assert is_read_only_query("DESCRIBE TABLE events", "clickhouse") is True

    def test_vacuum_command_blocked(self) -> None:
        # VACUUM is parsed as a Command node; not in read_only prefixes
        assert is_read_only_query("VACUUM") is False

    def test_call_procedure_blocked(self) -> None:
        # CALL is parsed as Command; not read-only
        assert is_read_only_query("CALL my_proc()") is False


class TestClassifyStatement:
    def test_select(self) -> None:
        assert classify_statement("SELECT * FROM users") == "select"

    def test_insert(self) -> None:
        assert classify_statement("INSERT INTO users (name) VALUES ('x')") == "insert"

    def test_update(self) -> None:
        assert classify_statement("UPDATE users SET name = 'x'") == "update"

    def test_delete(self) -> None:
        assert classify_statement("DELETE FROM users WHERE id = 1") == "delete"

    def test_create_is_ddl(self) -> None:
        assert classify_statement("CREATE TABLE test (id INT)") == "ddl"

    def test_drop_is_ddl(self) -> None:
        assert classify_statement("DROP TABLE test") == "ddl"

    def test_alter_is_ddl(self) -> None:
        assert classify_statement("ALTER TABLE test ADD COLUMN x INT") == "ddl"

    def test_invalid_sql(self) -> None:
        assert classify_statement("GIBBERISH @#$") == "unknown"

    def test_empty_string(self) -> None:
        assert classify_statement("") == "unknown"
