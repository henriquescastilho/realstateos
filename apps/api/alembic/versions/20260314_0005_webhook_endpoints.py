"""create webhook_endpoints table

Revision ID: 20260314_0005
Revises: 20260314_0004
Create Date: 2026-03-14 06:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260314_0005"
down_revision: str | None = "20260314_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("events", sa.Text, nullable=False, server_default="*"),
        sa.Column("secret", sa.String(128), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True, index=True),
    )
    op.create_index(
        "ix_webhook_endpoints_tenant_active",
        "webhook_endpoints",
        ["tenant_id", "is_active"],
    )


def downgrade() -> None:
    op.drop_index("ix_webhook_endpoints_tenant_active", table_name="webhook_endpoints")
    op.drop_table("webhook_endpoints")
