"""
Conftest for agent tests — sets up a lightweight SQLite in-memory database
without importing app.main (avoids email-validator and other heavy deps).
"""

from __future__ import annotations

import os

# Must be set before any app module import triggers engine creation
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers all ORM mappers
import app.db as _app_db
from app.db import Base

# Patch the module-level engine and SessionLocal to use the same in-memory SQLite
# so that tool methods that call SessionLocal() internally work without PostgreSQL.
_test_engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    future=True,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSessionLocal = sessionmaker(bind=_test_engine, autoflush=False, autocommit=False, future=True)
Base.metadata.create_all(bind=_test_engine)

# Redirect the module-level references so all tool internals hit the same DB
_app_db.engine = _test_engine
_app_db.SessionLocal = _TestSessionLocal


@pytest.fixture()
def db_session():
    session = _TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
