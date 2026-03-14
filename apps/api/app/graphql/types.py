"""Strawberry GraphQL type definitions.

Types mirror the SQLAlchemy models but are decoupled — resolvers map ORM
objects to these types, keeping the GraphQL schema stable even if the DB
schema changes.
"""

import strawberry
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


@strawberry.type(description="A rental contract between a property owner and a renter.")
class ContractType:
    id: str
    tenant_id: str
    property_id: str
    renter_id: str
    start_date: date
    end_date: date
    monthly_rent: str  # Decimal serialized as string for precision
    due_day: int

    @classmethod
    def from_orm(cls, obj) -> "ContractType":  # type: ignore[no-untyped-def]
        return cls(
            id=obj.id,
            tenant_id=obj.tenant_id,
            property_id=obj.property_id,
            renter_id=obj.renter_id,
            start_date=obj.start_date,
            end_date=obj.end_date,
            monthly_rent=str(obj.monthly_rent),
            due_day=obj.due_day,
        )


@strawberry.type(description="A billing charge line item for a contract.")
class ChargeType:
    id: str
    tenant_id: str
    contract_id: str
    property_id: str
    type: str
    description: str
    amount: str  # Decimal as string
    due_date: date
    status: str
    source: str

    @classmethod
    def from_orm(cls, obj) -> "ChargeType":  # type: ignore[no-untyped-def]
        return cls(
            id=obj.id,
            tenant_id=obj.tenant_id,
            contract_id=obj.contract_id,
            property_id=obj.property_id,
            type=obj.type,
            description=obj.description,
            amount=str(obj.amount),
            due_date=obj.due_date,
            status=obj.status,
            source=obj.source,
        )


@strawberry.type(description="An agent task record (billing, payment, maintenance, etc.).")
class TaskType:
    id: str
    tenant_id: str
    type: str
    status: str
    created_at: Optional[datetime]
    # payload is surfaced as a JSON string to avoid complex nested types
    payload_json: str

    @classmethod
    def from_orm(cls, obj) -> "TaskType":  # type: ignore[no-untyped-def]
        import json  # noqa: PLC0415

        return cls(
            id=obj.id,
            tenant_id=obj.tenant_id,
            type=obj.type,
            status=obj.status,
            created_at=getattr(obj, "created_at", None),
            payload_json=json.dumps(obj.payload or {}, default=str),
        )


@strawberry.input(description="Filter for listing contracts.")
class ContractFilter:
    property_id: Optional[str] = None
    renter_id: Optional[str] = None


@strawberry.input(description="Filter for listing charges.")
class ChargeFilter:
    contract_id: Optional[str] = None
    status: Optional[str] = None


@strawberry.input(description="Filter for listing agent tasks.")
class TaskFilter:
    status: Optional[str] = None
    type: Optional[str] = None
