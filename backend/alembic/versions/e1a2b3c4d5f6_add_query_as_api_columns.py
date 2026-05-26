"""add_query_as_api_columns

Revision ID: e1a2b3c4d5f6
Revises: d8a1f3b2c4e5
Create Date: 2026-05-04 23:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "e1a2b3c4d5f6"
down_revision: Union[str, None] = "d8a1f3b2c4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # API columns on saved_queries
    op.add_column("saved_queries", sa.Column("api_enabled", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("saved_queries", sa.Column("api_key_hash", sa.String(length=128), nullable=True))
    op.add_column("saved_queries", sa.Column("api_key_prefix", sa.String(length=8), nullable=True))
    op.add_column("saved_queries", sa.Column("api_parameters", JSONB(), nullable=True))
    op.add_column("saved_queries", sa.Column("api_row_limit", sa.Integer(), nullable=True))
    op.add_column("saved_queries", sa.Column("api_timeout_seconds", sa.Integer(), nullable=True))
    op.add_column("saved_queries", sa.Column("api_rate_limit", sa.Integer(), nullable=True))
    op.add_column("saved_queries", sa.Column("api_allowed_ips", JSONB(), nullable=True))
    op.add_column("saved_queries", sa.Column("api_notes", sa.Text(), nullable=True))
    op.add_column("saved_queries", sa.Column("api_published_sql", sa.Text(), nullable=True))
    op.add_column("saved_queries", sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False))

    # Index for quick lookup of active API queries
    op.create_index("ix_saved_queries_api_enabled", "saved_queries", ["api_enabled"], postgresql_where=sa.text("api_enabled = true"))

    # API execution logs (append-only)
    op.create_table(
        "api_execution_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("query_id", sa.String(length=36), nullable=False),
        sa.Column("connection_id", sa.String(length=36), nullable=False),
        sa.Column("caller_ip", sa.String(length=45), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("execution_time_ms", sa.Integer(), nullable=True),
        sa.Column("data_log_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["query_id"], ["saved_queries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connection_id"], ["connections.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_api_execution_logs_query_id", "api_execution_logs", ["query_id"])
    op.create_index("ix_api_execution_logs_created_at", "api_execution_logs", ["created_at"])

    # API execution data (prunable)
    op.create_table(
        "api_execution_data",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("params_sent", JSONB(), nullable=True),
        sa.Column("response_data", JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_api_execution_data_created_at", "api_execution_data", ["created_at"])

    # Add FK from logs to data (ON DELETE SET NULL for pruning)
    op.create_foreign_key(
        "fk_api_execution_logs_data",
        "api_execution_logs",
        "api_execution_data",
        ["data_log_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_api_execution_logs_data", "api_execution_logs", type_="foreignkey")
    op.drop_index("ix_api_execution_data_created_at", table_name="api_execution_data")
    op.drop_table("api_execution_data")
    op.drop_index("ix_api_execution_logs_created_at", table_name="api_execution_logs")
    op.drop_index("ix_api_execution_logs_query_id", table_name="api_execution_logs")
    op.drop_table("api_execution_logs")
    op.drop_index("ix_saved_queries_api_enabled", table_name="saved_queries")
    op.drop_column("saved_queries", "is_deleted")
    op.drop_column("saved_queries", "api_published_sql")
    op.drop_column("saved_queries", "api_notes")
    op.drop_column("saved_queries", "api_allowed_ips")
    op.drop_column("saved_queries", "api_rate_limit")
    op.drop_column("saved_queries", "api_timeout_seconds")
    op.drop_column("saved_queries", "api_row_limit")
    op.drop_column("saved_queries", "api_parameters")
    op.drop_column("saved_queries", "api_key_prefix")
    op.drop_column("saved_queries", "api_key_hash")
    op.drop_column("saved_queries", "api_enabled")
