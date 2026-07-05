"""polyglot connection and result contracts

Revision ID: a4d9c8e7b6f5
Revises: f3a9c1d2e4b5
Create Date: 2026-07-01 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "a4d9c8e7b6f5"
down_revision: Union[str, None] = "f3a9c1d2e4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("connections", sa.Column("config", JSONB(), nullable=True))
    op.add_column("connections", sa.Column("credentials_encrypted", sa.Text(), nullable=True))
    op.add_column("run_history", sa.Column("operation_language", sa.String(length=50), nullable=True))
    op.add_column(
        "run_history",
        sa.Column("result_shape", sa.String(length=50), server_default="tabular", nullable=False),
    )
    op.add_column(
        "run_results",
        sa.Column("result_shape", sa.String(length=50), server_default="tabular", nullable=False),
    )
    op.add_column("run_results", sa.Column("data", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("run_results", "data")
    op.drop_column("run_results", "result_shape")
    op.drop_column("run_history", "result_shape")
    op.drop_column("run_history", "operation_language")
    op.drop_column("connections", "credentials_encrypted")
    op.drop_column("connections", "config")
