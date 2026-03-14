"""
Integration test fixtures using testcontainers.

Requirements:
  pip install testcontainers[postgres,redis]

Tests in this package are skipped automatically when:
  - testcontainers is not installed, OR
  - Docker daemon is not reachable.

Run only integration tests:
  pytest apps/api/tests/integration/ -v -m integration
"""
from __future__ import annotations

import os
import pytest

# ---------------------------------------------------------------------------
# Guard: skip entire suite if testcontainers is not installed or Docker is down
# ---------------------------------------------------------------------------
testcontainers = pytest.importorskip(
    "testcontainers",
    reason="testcontainers not installed — pip install 'testcontainers[postgres,redis]'",
)


def _docker_available() -> bool:
    """Return True if the Docker daemon is reachable."""
    try:
        import docker  # type: ignore[import]
        client = docker.from_env(timeout=3)
        client.ping()
        return True
    except Exception:
        return False


DOCKER_AVAILABLE = _docker_available()
skip_no_docker = pytest.mark.skipif(
    not DOCKER_AVAILABLE,
    reason="Docker daemon not reachable — skipping integration tests",
)


# ---------------------------------------------------------------------------
# Session-scoped containers
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def pg_container():
    """Start a PostgreSQL container for the session and yield connection URL."""
    from testcontainers.postgres import PostgresContainer  # type: ignore[import]

    with PostgresContainer(
        "postgres:16-alpine",
        dbname="reos_test",
        username="reos",
        password="reos_secret",
    ) as pg:
        yield pg


@pytest.fixture(scope="session")
def redis_container():
    """Start a Redis container for the session and yield (host, port)."""
    from testcontainers.redis import RedisContainer  # type: ignore[import]

    with RedisContainer("redis:7-alpine") as redis:
        yield redis


# ---------------------------------------------------------------------------
# Per-test DB engine + session
# ---------------------------------------------------------------------------

@pytest.fixture()
def pg_engine(pg_container):
    """
    Create a SQLAlchemy engine bound to the real PostgreSQL container.
    Drops and recreates all tables around each test for isolation.
    """
    from sqlalchemy import create_engine, text

    import app.models  # noqa: F401 — registers ORM classes
    from app.db import Base

    url = pg_container.get_connection_url().replace("psycopg2", "psycopg2")
    # psycopg[binary] uses "postgresql+psycopg", testcontainers returns psycopg2 dialect
    # normalise to the synchronous psycopg2 driver that is always present via psycopg[binary]
    engine = create_engine(url, pool_pre_ping=True)

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    yield engine

    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def pg_session(pg_engine):
    """Transactional session — rolls back after each test for speed."""
    from sqlalchemy.orm import sessionmaker

    Session = sessionmaker(bind=pg_engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# ---------------------------------------------------------------------------
# Redis client fixture
# ---------------------------------------------------------------------------

@pytest.fixture()
def redis_client(redis_container):
    """Return a redis.Redis client connected to the container."""
    import redis as redis_lib  # type: ignore[import]

    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    client = redis_lib.Redis(host=host, port=int(port), decode_responses=True)
    yield client
    client.flushall()
    client.close()


# ---------------------------------------------------------------------------
# Shared domain fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def domain_graph(pg_session):
    """
    Minimal tenant + owner + renter + property + contract graph
    committed to the real PostgreSQL DB.
    """
    from datetime import date
    from decimal import Decimal

    from app.models.charge import Charge  # noqa: F401
    from app.models.contract import Contract
    from app.models.owner import Owner
    from app.models.property import Property
    from app.models.renter import Renter
    from app.models.tenant import Tenant

    tenant = Tenant(name="Integration Tenant")
    owner = Owner(
        tenant=tenant,
        name="Owner Integration",
        document="11144477735",
        email="owner@integration.test",
        phone="11000000001",
    )
    renter = Renter(
        tenant=tenant,
        name="Renter Integration",
        document="52998224725",
        email="renter@integration.test",
        phone="11000000002",
    )
    prop = Property(
        tenant=tenant,
        owner=owner,
        address="Av. Paulista, 1000",
        city="São Paulo",
        state="SP",
        zip="01311-100",
    )
    contract = Contract(
        tenant=tenant,
        property=prop,
        renter=renter,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        monthly_rent=Decimal("3500.00"),
        due_day=10,
    )
    pg_session.add_all([tenant, owner, renter, prop, contract])
    pg_session.commit()
    for obj in [tenant, owner, renter, prop, contract]:
        pg_session.refresh(obj)

    return {
        "tenant": tenant,
        "owner": owner,
        "renter": renter,
        "property": prop,
        "contract": contract,
    }
