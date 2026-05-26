"""add_dbml_context_to_connections

Revision ID: d8a1f3b2c4e5
Revises: ce50418e4dc1
Create Date: 2026-04-18 14:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "d8a1f3b2c4e5"
down_revision: str | None = "ce50418e4dc1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("connections", sa.Column("dbml_context", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("connections", "dbml_context")
