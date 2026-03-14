from collections.abc import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.db import Base
from app.main import app
from app.models.tenant import Tenant
from app.models.user import User

TEST_TENANT_ID = "test-tenant-id"
TEST_USER_ID = "test-user-id"
TEST_EMAIL = "test@example.com"


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    session = testing_session_local()

    # Seed test tenant and user
    tenant = Tenant(id=TEST_TENANT_ID, name="test-tenant")
    session.add(tenant)
    user = User(id=TEST_USER_ID, tenant_id=TEST_TENANT_ID, name="Test User", email=TEST_EMAIL, role="admin")
    session.add(user)
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_current_user() -> CurrentUser:
    return CurrentUser(
        user_id=TEST_USER_ID,
        tenant_id=TEST_TENANT_ID,
        email=TEST_EMAIL,
        role="admin",
    )


@pytest.fixture
def client(db_session: Session, test_current_user: CurrentUser):
    def override_get_db():
        yield db_session

    def override_get_current_user():
        return test_current_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        from fastapi.testclient import TestClient

        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
