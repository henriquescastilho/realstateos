from collections.abc import Generator

from sqlalchemy.orm import Session

from app.db import get_db as db_session_dependency


def get_db() -> Generator[Session, None, None]:
    yield from db_session_dependency()
