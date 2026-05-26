"""add_saved_query_versions

Revision ID: b77621b06f2d
Revises: 272adc1b0fb7
Create Date: 2026-04-16 17:01:46.287232
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b77621b06f2d'
down_revision: Union[str, None] = '272adc1b0fb7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add updated_by to saved_queries
    op.add_column(
        "saved_queries",
        sa.Column("updated_by", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_saved_queries_updated_by",
        "saved_queries",
        "users",
        ["updated_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # saved_query_versions table
    op.create_table(
        "saved_query_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("query_id", sa.String(length=36), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("sql", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("edited_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["query_id"], ["saved_queries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["edited_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saved_query_versions_query_id", "saved_query_versions", ["query_id"])

    # saved_query_favorites table
    op.create_table(
        "saved_query_favorites",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("query_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["query_id"], ["saved_queries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "query_id"),
    )


def downgrade() -> None:
    op.drop_table("saved_query_favorites")
    op.drop_index("ix_saved_query_versions_query_id", table_name="saved_query_versions")
    op.drop_table("saved_query_versions")
    op.drop_constraint("fk_saved_queries_updated_by", "saved_queries", type_="foreignkey")
    op.drop_column("saved_queries", "updated_by")
