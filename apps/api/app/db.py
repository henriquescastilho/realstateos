from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import QueuePool

from app.config import settings


class Base(DeclarativeBase):
    pass


def _build_engine():
    """Build the SQLAlchemy engine with production-grade connection pool settings."""
    return create_engine(
        settings.database_url,
        future=True,
        poolclass=QueuePool,
        pool_size=20,           # Max persistent connections
        max_overflow=10,        # Extra connections when pool is exhausted
        pool_timeout=30,        # Seconds to wait before raising TimeoutError
        pool_recycle=3600,      # Recycle connections after 1 hour (prevents stale connections)
        pool_pre_ping=True,     # Verify connection liveness before use
        echo=False,             # Set True for SQL query logging in dev
    )


engine = _build_engine()


# ---------------------------------------------------------------------------
# Pool event listeners for observability
# ---------------------------------------------------------------------------

@event.listens_for(engine, "connect")
def _on_connect(dbapi_connection, connection_record):
    """Log new physical connections (pool expansion)."""
    import logging  # noqa: PLC0415
    logging.getLogger("app.db.pool").debug("New DB connection established: %s", id(dbapi_connection))


@event.listens_for(engine, "checkout")
def _on_checkout(dbapi_connection, connection_record, connection_proxy):
    """Log connection checkouts from pool."""
    import logging  # noqa: PLC0415
    logging.getLogger("app.db.pool").debug("DB connection checked out: %s", id(dbapi_connection))


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_pool_status() -> dict:
    """Return current connection pool metrics for the /health endpoint."""
    pool = engine.pool
    return {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalid_count() if hasattr(pool, "invalid_count") else None,
    }


def init_db() -> None:
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)

