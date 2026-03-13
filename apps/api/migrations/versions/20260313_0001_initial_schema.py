"""initial schema

Revision ID: 20260313_0001
Revises:
Create Date: 2026-03-13 14:30:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260313_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "users",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])

    op.create_table(
        "owners",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("document", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_owners_tenant_id", "owners", ["tenant_id"])

    op.create_table(
        "tenants_renters",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("document", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenants_renters_tenant_id", "tenants_renters", ["tenant_id"])

    op.create_table(
        "properties",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("state", sa.String(length=2), nullable=False),
        sa.Column("zip", sa.String(length=20), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("iptu_registration_number", sa.String(length=100), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["owners.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_properties_owner_id", "properties", ["owner_id"])
    op.create_index("ix_properties_tenant_id", "properties", ["tenant_id"])

    op.create_table(
        "contracts",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("renter_id", sa.String(length=36), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("monthly_rent", sa.Numeric(12, 2), nullable=False),
        sa.Column("due_day", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.ForeignKeyConstraint(["renter_id"], ["tenants_renters.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contracts_property_id", "contracts", ["property_id"])
    op.create_index("ix_contracts_renter_id", "contracts", ["renter_id"])
    op.create_index("ix_contracts_tenant_id", "contracts", ["tenant_id"])

    op.create_table(
        "charges",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("contract_id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"]),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_charges_contract_id", "charges", ["contract_id"])
    op.create_index("ix_charges_due_date", "charges", ["due_date"])
    op.create_index("ix_charges_property_id", "charges", ["property_id"])
    op.create_index("ix_charges_tenant_id", "charges", ["tenant_id"])

    op.create_table(
        "documents",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=False),
        sa.Column("parsed_data", sa.JSON(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documents_property_id", "documents", ["property_id"])
    op.create_index("ix_documents_tenant_id", "documents", ["tenant_id"])

    op.create_table(
        "tasks",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_tenant_id", "tasks", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_tasks_tenant_id", table_name="tasks")
    op.drop_table("tasks")
    op.drop_index("ix_documents_tenant_id", table_name="documents")
    op.drop_index("ix_documents_property_id", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_charges_tenant_id", table_name="charges")
    op.drop_index("ix_charges_property_id", table_name="charges")
    op.drop_index("ix_charges_due_date", table_name="charges")
    op.drop_index("ix_charges_contract_id", table_name="charges")
    op.drop_table("charges")
    op.drop_index("ix_contracts_tenant_id", table_name="contracts")
    op.drop_index("ix_contracts_renter_id", table_name="contracts")
    op.drop_index("ix_contracts_property_id", table_name="contracts")
    op.drop_table("contracts")
    op.drop_index("ix_properties_tenant_id", table_name="properties")
    op.drop_index("ix_properties_owner_id", table_name="properties")
    op.drop_table("properties")
    op.drop_index("ix_tenants_renters_tenant_id", table_name="tenants_renters")
    op.drop_table("tenants_renters")
    op.drop_index("ix_owners_tenant_id", table_name="owners")
    op.drop_table("owners")
    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_table("users")
    op.drop_table("tenants")
