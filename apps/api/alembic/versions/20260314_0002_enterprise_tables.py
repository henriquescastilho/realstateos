"""enterprise tables: agent_tasks, audit_log, dlq_items, scheduled_jobs, semantic_embeddings

Revision ID: 20260314_0002
Revises: 20260313_0001
Create Date: 2026-03-14 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260314_0002"
down_revision: str | None = "20260313_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # agent_tasks — rich agent task lifecycle tracking
    # -------------------------------------------------------------------------
    op.create_table(
        "agent_tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("agent_type", sa.String(length=50), nullable=False),
        sa.Column("agent_id", sa.String(length=100), nullable=True),
        sa.Column("task_type", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column("entity_id", sa.String(length=36), nullable=True),
        sa.Column("input_data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("output_data", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.BigInteger(), nullable=True),
        sa.Column("dlq_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("correlation_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_tasks_tenant_id", "agent_tasks", ["tenant_id"])
    op.create_index("ix_agent_tasks_agent_type", "agent_tasks", ["agent_type"])
    op.create_index("ix_agent_tasks_task_type", "agent_tasks", ["task_type"])
    op.create_index("ix_agent_tasks_status", "agent_tasks", ["status"])
    op.create_index("ix_agent_tasks_correlation_id", "agent_tasks", ["correlation_id"])
    op.create_index(
        "ix_agent_tasks_tenant_status",
        "agent_tasks",
        ["tenant_id", "status"],
    )

    # -------------------------------------------------------------------------
    # audit_log — append-only audit trail for every action
    # -------------------------------------------------------------------------
    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("actor_type", sa.String(length=20), nullable=False),
        sa.Column("actor_id", sa.String(length=100), nullable=False),
        sa.Column("agent_task_id", sa.String(length=36), nullable=True),
        sa.Column("before_state", sa.JSON(), nullable=True),
        sa.Column("after_state", sa.JSON(), nullable=True),
        sa.Column("extra_metadata", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("correlation_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_tenant_id", "audit_log", ["tenant_id"])
    op.create_index("ix_audit_log_entity_type", "audit_log", ["entity_type"])
    op.create_index("ix_audit_log_entity_id", "audit_log", ["entity_id"])
    op.create_index("ix_audit_log_agent_task_id", "audit_log", ["agent_task_id"])
    op.create_index("ix_audit_log_correlation_id", "audit_log", ["correlation_id"])
    op.create_index(
        "ix_audit_log_tenant_entity",
        "audit_log",
        ["tenant_id", "entity_type", "entity_id"],
    )

    # -------------------------------------------------------------------------
    # dlq_items — persistent dead letter queue for failed tasks
    # -------------------------------------------------------------------------
    op.create_table(
        "dlq_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("original_task_id", sa.String(length=36), nullable=True),
        sa.Column("original_task_type", sa.String(length=100), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("resolved_by", sa.String(length=100), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dlq_items_tenant_id", "dlq_items", ["tenant_id"])
    op.create_index("ix_dlq_items_original_task_id", "dlq_items", ["original_task_id"])
    op.create_index("ix_dlq_items_status", "dlq_items", ["status"])

    # -------------------------------------------------------------------------
    # scheduled_jobs — APScheduler execution history
    # -------------------------------------------------------------------------
    op.create_table(
        "scheduled_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=100), nullable=False),
        sa.Column("job_name", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="SCHEDULED"),
        sa.Column("trigger_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.BigInteger(), nullable=True),
        sa.Column("records_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scheduled_jobs_job_id", "scheduled_jobs", ["job_id"])
    op.create_index("ix_scheduled_jobs_tenant_id", "scheduled_jobs", ["tenant_id"])
    op.create_index("ix_scheduled_jobs_status", "scheduled_jobs", ["status"])

    # -------------------------------------------------------------------------
    # semantic_embeddings — pgvector embeddings for semantic search
    # Requires the vector extension (already present in docker-compose postgres).
    # Use execute_if to skip gracefully if pgvector is unavailable.
    # -------------------------------------------------------------------------
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("""
        CREATE TABLE IF NOT EXISTS semantic_embeddings (
            id          TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id   TEXT NOT NULL,
            tenant_id   TEXT NOT NULL,
            content     TEXT NOT NULL,
            embedding   vector(768),
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_semantic_embeddings_entity UNIQUE (entity_type, entity_id)
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_tenant ON semantic_embeddings (tenant_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_type ON semantic_embeddings (entity_type)"
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.execute("DROP TABLE IF EXISTS semantic_embeddings")

    op.drop_index("ix_scheduled_jobs_status", table_name="scheduled_jobs")
    op.drop_index("ix_scheduled_jobs_tenant_id", table_name="scheduled_jobs")
    op.drop_index("ix_scheduled_jobs_job_id", table_name="scheduled_jobs")
    op.drop_table("scheduled_jobs")

    op.drop_index("ix_dlq_items_status", table_name="dlq_items")
    op.drop_index("ix_dlq_items_original_task_id", table_name="dlq_items")
    op.drop_index("ix_dlq_items_tenant_id", table_name="dlq_items")
    op.drop_table("dlq_items")

    op.drop_index("ix_audit_log_tenant_entity", table_name="audit_log")
    op.drop_index("ix_audit_log_correlation_id", table_name="audit_log")
    op.drop_index("ix_audit_log_agent_task_id", table_name="audit_log")
    op.drop_index("ix_audit_log_entity_id", table_name="audit_log")
    op.drop_index("ix_audit_log_entity_type", table_name="audit_log")
    op.drop_index("ix_audit_log_tenant_id", table_name="audit_log")
    op.drop_table("audit_log")

    op.drop_index("ix_agent_tasks_tenant_status", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_correlation_id", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_status", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_task_type", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_agent_type", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_tenant_id", table_name="agent_tasks")
    op.drop_table("agent_tasks")
