"""query run jobs

Revision ID: f3a9c1d2e4b5
Revises: bf8ef446249a
Create Date: 2026-06-29 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "f3a9c1d2e4b5"
down_revision: Union[str, None] = "bf8ef446249a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "run_history",
        sa.Column("source", sa.String(length=20), server_default="editor", nullable=False),
    )
    op.add_column("run_history", sa.Column("params", JSONB(), nullable=True))
    op.add_column(
        "run_history",
        sa.Column("write_mode", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "run_history",
        sa.Column("user_role", sa.String(length=20), server_default="viewer", nullable=False),
    )
    op.add_column("run_history", sa.Column("backend_pid", sa.Integer(), nullable=True))
    op.add_column("run_history", sa.Column("backend_query_id", sa.String(length=128), nullable=True))
    op.add_column("run_history", sa.Column("timeout_seconds", sa.Integer(), nullable=True))
    op.add_column("run_history", sa.Column("max_rows", sa.Integer(), nullable=True))
    op.add_column("run_history", sa.Column("api_query_id", sa.String(length=36), nullable=True))
    op.add_column("run_history", sa.Column("caller_ip", sa.String(length=45), nullable=True))
    op.add_column("run_history", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("run_history", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "run_history",
        sa.Column("cancellation_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_run_history_source", "run_history", ["source"])
    op.create_index("ix_run_history_api_query_id", "run_history", ["api_query_id"])

    op.create_table(
        "run_results",
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("columns", JSONB(), nullable=False),
        sa.Column("column_types", JSONB(), nullable=False),
        sa.Column("rows", JSONB(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("truncated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["run_history.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("run_id"),
    )


def downgrade() -> None:
    op.drop_table("run_results")
    op.drop_index("ix_run_history_api_query_id", table_name="run_history")
    op.drop_index("ix_run_history_source", table_name="run_history")
    op.drop_column("run_history", "cancellation_requested_at")
    op.drop_column("run_history", "finished_at")
    op.drop_column("run_history", "started_at")
    op.drop_column("run_history", "caller_ip")
    op.drop_column("run_history", "api_query_id")
    op.drop_column("run_history", "timeout_seconds")
    op.drop_column("run_history", "max_rows")
    op.drop_column("run_history", "backend_query_id")
    op.drop_column("run_history", "backend_pid")
    op.drop_column("run_history", "user_role")
    op.drop_column("run_history", "write_mode")
    op.drop_column("run_history", "params")
    op.drop_column("run_history", "source")
