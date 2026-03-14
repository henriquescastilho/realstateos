"""soft delete: add deleted_at column to contracts, properties, renters, owners

Revision ID: 20260314_0004
Revises: 20260314_0003
Create Date: 2026-03-14 02:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260314_0004"
down_revision: str | None = "20260314_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Tables that get soft-delete support
_TABLES = ["contracts", "properties", "tenants_renters", "owners"]


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "deleted_at")
