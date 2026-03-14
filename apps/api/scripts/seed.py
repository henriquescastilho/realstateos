"""Database seeder for Real Estate OS.

Generates realistic Brazilian real estate data:
- 5 organizations (tenants)
- ~10 owners per org (50 total)
- ~10 properties per org (50 total)
- ~40 contracts per org (200 total)
- 24 months of billing history per contract
- Payment records (80% paid, 10% partial, 10% pending)
- Maintenance tickets (3-5 per property)
- Agent task records

Used for demo environments and load testing.

Usage:
    python -m scripts.seed [--clear]

    --clear: Drop all tenant data before re-seeding (destructive!)
"""
from __future__ import annotations

import argparse
import logging
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

# Ensure the project root is on sys.path when running as a script
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: F401 — registers all models with Base
from app.db import SessionLocal
from app.models.charge import Charge
from app.models.contract import Contract
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.task import Task
from app.models.tenant import Tenant
from app.models.user import User

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("seed")

# ---------------------------------------------------------------------------
# Static Brazilian data pools
# ---------------------------------------------------------------------------

_FIRST_NAMES = [
    "Ana", "Carlos", "Maria", "João", "Fernanda", "Ricardo", "Juliana", "Pedro",
    "Camila", "Lucas", "Beatriz", "Felipe", "Amanda", "Rafael", "Larissa", "Bruno",
    "Mariana", "Diego", "Patrícia", "Eduardo",
]
_LAST_NAMES = [
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves",
    "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida",
]
_CITIES = [
    ("São Paulo", "SP", "01310"),
    ("Campinas", "SP", "13010"),
    ("Santos", "SP", "11010"),
    ("Ribeirão Preto", "SP", "14010"),
    ("Sorocaba", "SP", "18010"),
    ("Rio de Janeiro", "RJ", "20040"),
    ("Niterói", "RJ", "24020"),
    ("Belo Horizonte", "MG", "30110"),
    ("Curitiba", "PR", "80010"),
    ("Porto Alegre", "RS", "90010"),
]
_STREET_TYPES = ["Rua", "Avenida", "Alameda", "Travessa", "Praça"]
_STREET_NAMES = [
    "das Flores", "dos Pinheiros", "do Sol", "Brasil", "São Paulo",
    "Presidente Vargas", "Independência", "Tiradentes", "do Comércio",
    "das Acácias", "das Palmeiras", "XV de Novembro",
]
_MAINTENANCE_DESCRIPTIONS = [
    "Vazamento na torneira da cozinha",
    "Infiltração no teto do quarto principal",
    "Porta com problema de fechadura",
    "Chuveiro elétrico com defeito",
    "Janela com vedação quebrada",
    "Pintura com umidade e bolhas",
    "Tomada elétrica sem funcionamento",
    "Problema na fiação elétrica do banheiro",
    "Calha entupida causando transbordamento",
    "Rachadura na parede da sala",
    "Piso com telha solta no banheiro",
    "Desentupimento do esgoto",
]
_ORG_NAMES = [
    "Imobiliária Alpha Ltda",
    "Beta Gestão Imobiliária",
    "Gamma Properties",
    "Delta Imóveis",
    "Epsilon Real Estate",
]

rng = random.Random(42)  # fixed seed for reproducibility


def _rand_cpf() -> str:
    n = [rng.randint(0, 9) for _ in range(9)]
    d1 = (10 * n[0] + 9 * n[1] + 8 * n[2] + 7 * n[3] + 6 * n[4]
          + 5 * n[5] + 4 * n[6] + 3 * n[7] + 2 * n[8]) % 11
    d1 = 0 if d1 < 2 else 11 - d1
    n.append(d1)
    d2 = (11 * n[0] + 10 * n[1] + 9 * n[2] + 8 * n[3] + 7 * n[4]
          + 6 * n[5] + 5 * n[6] + 4 * n[7] + 3 * n[8] + 2 * n[9]) % 11
    d2 = 0 if d2 < 2 else 11 - d2
    n.append(d2)
    return "".join(str(d) for d in n)


def _rand_name() -> str:
    return f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}"


def _rand_email(name: str, org_suffix: str) -> str:
    slug = name.lower().replace(" ", ".").replace("ã", "a").replace("é", "e").replace("ó", "o")
    return f"{slug}@{org_suffix}.com.br"


def _rand_phone() -> str:
    ddd = rng.choice([11, 21, 31, 41, 51, 61, 71, 81, 85, 91])
    return f"({ddd}) 9{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}"


def _rand_address() -> tuple[str, str, str, str]:
    city, state, zip_prefix = rng.choice(_CITIES)
    street = f"{rng.choice(_STREET_TYPES)} {rng.choice(_STREET_NAMES)}, {rng.randint(1, 999)}"
    zip_code = f"{zip_prefix}-{rng.randint(0, 9)}{rng.randint(0, 9)}{rng.randint(0, 9)}"
    return street, city, state, zip_code


def _rand_rent() -> Decimal:
    # BR market: R$1.500 - R$8.000
    return Decimal(str(rng.randint(150, 800) * 10))


def _rand_due_day() -> int:
    return rng.choice([5, 10, 15, 20, 25])


# ---------------------------------------------------------------------------
# Seeding functions
# ---------------------------------------------------------------------------


def _seed_tenant(db, name: str) -> Tenant:
    t = Tenant(id=str(uuid4()), name=name)
    db.add(t)
    db.flush()
    return t


def _seed_owners(db, tenant_id: str, count: int = 10) -> list[Owner]:
    suffix = f"org{tenant_id[:4]}"
    owners = []
    for _ in range(count):
        name = _rand_name()
        o = Owner(
            tenant_id=tenant_id,
            name=name,
            document=_rand_cpf(),
            email=_rand_email(name, suffix),
            phone=_rand_phone(),
        )
        db.add(o)
        owners.append(o)
    db.flush()
    return owners


def _seed_renters(db, tenant_id: str, count: int = 50) -> list[Renter]:
    suffix = f"renter{tenant_id[:4]}"
    renters = []
    for _ in range(count):
        name = _rand_name()
        r = Renter(
            tenant_id=tenant_id,
            name=name,
            document=_rand_cpf(),
            email=_rand_email(name, suffix),
            phone=_rand_phone(),
        )
        db.add(r)
        renters.append(r)
    db.flush()
    return renters


def _seed_properties(db, tenant_id: str, owners: list[Owner], count: int = 10) -> list[Property]:
    properties = []
    for i in range(count):
        street, city, state, zip_code = _rand_address()
        p = Property(
            tenant_id=tenant_id,
            owner_id=rng.choice(owners).id,
            address=street,
            city=city,
            state=state,
            zip=zip_code,
            iptu_registration_number=f"IPTU-{rng.randint(100000, 999999)}",
        )
        db.add(p)
        properties.append(p)
    db.flush()
    return properties


def _seed_contracts(
    db,
    tenant_id: str,
    properties: list[Property],
    renters: list[Renter],
    count: int = 40,
) -> list[Contract]:
    today = date.today()
    two_years_ago = today - timedelta(days=730)
    contracts = []

    for _ in range(count):
        # Spread start dates over the past 2 years
        days_offset = rng.randint(0, 700)
        start = two_years_ago + timedelta(days=days_offset)
        end = start + timedelta(days=rng.choice([365, 730, 365 * 3]))
        c = Contract(
            tenant_id=tenant_id,
            property_id=rng.choice(properties).id,
            renter_id=rng.choice(renters).id,
            start_date=start,
            end_date=end,
            monthly_rent=_rand_rent(),
            due_day=_rand_due_day(),
        )
        db.add(c)
        contracts.append(c)
    db.flush()
    return contracts


def _seed_billing_history(db, tenant_id: str, contracts: list[Contract]) -> int:
    """Generate 24 months of charges + payment records for each contract."""
    today = date.today()
    total_charges = 0

    for contract in contracts:
        # Generate monthly charges from contract start until today (max 24 months)
        current = contract.start_date.replace(day=1)
        cutoff = today.replace(day=1)
        months_generated = 0

        while current <= cutoff and months_generated < 24:
            due = date(current.year, current.month, contract.due_day)

            # Determine payment status
            roll = rng.random()
            if due < today:
                if roll < 0.80:
                    status = "paid"
                elif roll < 0.90:
                    status = "partial"
                else:
                    status = "pending"
            else:
                status = "pending"

            charge = Charge(
                tenant_id=tenant_id,
                property_id=contract.property_id,
                contract_id=contract.id,
                type="RENT",
                description=f"Monthly rent {current.strftime('%Y-%m')}",
                amount=contract.monthly_rent,
                due_date=due,
                source="SYSTEM",
                status=status,
            )
            db.add(charge)
            total_charges += 1

            # Advance to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
            months_generated += 1

    db.flush()
    return total_charges


def _seed_maintenance_tickets(db, tenant_id: str, properties: list[Property], per_property: int = 4) -> int:
    """Create maintenance task records for each property."""
    today = date.today()
    total = 0

    for prop in properties:
        for _ in range(rng.randint(2, per_property)):
            days_ago = rng.randint(1, 365)
            created_date = today - timedelta(days=days_ago)
            statuses = ["DONE", "DONE", "DONE", "PENDING", "ESCALATED"]
            status = rng.choice(statuses)
            description = rng.choice(_MAINTENANCE_DESCRIPTIONS)

            task = Task(
                tenant_id=tenant_id,
                type="MAINTENANCE_TICKET",
                status=status,
                payload={
                    "property_id": prop.id,
                    "description": description,
                    "priority": rng.choice(["LOW", "MEDIUM", "HIGH"]),
                    "estimated_cost": str(rng.randint(200, 5000)),
                    "created_date": created_date.isoformat(),
                    "message": description,
                },
            )
            db.add(task)
            total += 1

    db.flush()
    return total


def _seed_agent_tasks(db, tenant_id: str, count: int = 20) -> None:
    """Seed a sample of agent task records for the ops dashboard."""
    task_types = [
        "MONTHLY_BILLING", "PAYMENT_RECONCILIATION", "CONTRACT_ONBOARDING",
        "PORTFOLIO_REPORT", "PAYMENT_REMINDER", "OVERDUE_ESCALATION",
    ]
    statuses = ["DONE", "DONE", "DONE", "DONE", "FAILED", "ESCALATED", "PENDING"]

    for _ in range(count):
        task = Task(
            tenant_id=tenant_id,
            type=rng.choice(task_types),
            status=rng.choice(statuses),
            payload={
                "message": "Seeded task record",
                "seeded": True,
            },
        )
        db.add(task)
    db.flush()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def seed(clear: bool = False) -> None:
    db = SessionLocal()
    try:
        if clear:
            logger.warning("Clearing all tenant data...")
            from sqlalchemy import delete  # noqa: PLC0415
            for model in [Task, Charge, Contract, Property, Renter, Owner, User, Tenant]:
                db.execute(delete(model))
            db.commit()
            logger.info("All tenant data cleared.")

        logger.info("Seeding %d organizations...", len(_ORG_NAMES))
        total_charges = 0
        total_maintenance = 0

        for org_name in _ORG_NAMES:
            tenant = _seed_tenant(db, org_name)
            logger.info("  Tenant: %s (%s)", org_name, tenant.id)

            owners = _seed_owners(db, tenant.id, count=10)
            renters = _seed_renters(db, tenant.id, count=50)
            properties = _seed_properties(db, tenant.id, owners, count=10)
            contracts = _seed_contracts(db, tenant.id, properties, renters, count=40)
            charges = _seed_billing_history(db, tenant.id, contracts)
            maintenance = _seed_maintenance_tickets(db, tenant.id, properties)
            _seed_agent_tasks(db, tenant.id)

            total_charges += charges
            total_maintenance += maintenance
            logger.info(
                "    → %d owners, %d renters, %d properties, %d contracts, "
                "%d charges, %d maintenance tickets",
                len(owners), len(renters), len(properties), len(contracts),
                charges, maintenance,
            )

        db.commit()
        logger.info(
            "Seed complete: %d orgs, 50 properties, 200 contracts, %d charges, %d maintenance tickets",
            len(_ORG_NAMES), total_charges, total_maintenance,
        )
    except Exception:
        db.rollback()
        logger.exception("Seed failed — rolling back")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Real Estate OS demo data")
    parser.add_argument("--clear", action="store_true", help="Clear existing data before seeding")
    args = parser.parse_args()
    seed(clear=args.clear)
