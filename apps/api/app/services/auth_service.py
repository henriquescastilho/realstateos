from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.user import User


def issue_token_for_user(db: Session, tenant_id: str, email: str) -> str | None:
    user = db.scalar(select(User).where(User.tenant_id == tenant_id, User.email == email))
    if user is None:
        return None
    return create_access_token(subject=user.id, tenant_id=user.tenant_id, role=user.role)

