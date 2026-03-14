"""fulltext search: tsvector columns and GIN indexes on contracts and tasks

Revision ID: 20260314_0003
Revises: 20260314_0002
Create Date: 2026-03-14 01:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260314_0003"
down_revision: str | None = "20260314_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # contracts — full-text search on address content + description fields
    # -------------------------------------------------------------------------
    op.execute("""
        ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('portuguese',
                coalesce(property_id, '') || ' ' ||
                coalesce(renter_id, '')
            )
        ) STORED
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_contracts_fts ON contracts USING GIN (search_vector)"
    )

    # -------------------------------------------------------------------------
    # tasks — full-text search on task type
    # -------------------------------------------------------------------------
    op.execute("""
        ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('portuguese', coalesce(type, '') || ' ' || coalesce(status, ''))
        ) STORED
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_fts ON tasks USING GIN (search_vector)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_tasks_fts")
    op.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS search_vector")

    op.execute("DROP INDEX IF EXISTS idx_contracts_fts")
    op.execute("ALTER TABLE contracts DROP COLUMN IF EXISTS search_vector")
