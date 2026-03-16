"""JWT authentication — token issuance and request identity extraction."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.models.user import User
from app.schemas.auth import TokenRequest, TokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    user_id: str
    tenant_id: str
    role: str
    email: str


def _create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(tz=timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """FastAPI dependency — resolves JWT to CurrentUser or raises 401."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_token(credentials.credentials)
    user_id: str | None = payload.get("sub")
    tenant_id: str | None = payload.get("tenant_id") or payload.get("org_id")
    role: str | None = payload.get("role")
    email: str | None = payload.get("email")
    if not all([user_id, tenant_id, role, email]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token")
    return CurrentUser(user_id=user_id, tenant_id=tenant_id, role=role, email=email)  # type: ignore[arg-type]


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser | None:
    """Like get_current_user but returns None instead of raising for unauthenticated requests."""
    if credentials is None:
        return None
    try:
        payload = _decode_token(credentials.credentials)
        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id") or payload.get("org_id")
        role = payload.get("role")
        email = payload.get("email")
        if all([user_id, tenant_id, role, email]):
            return CurrentUser(user_id=user_id, tenant_id=tenant_id, role=role, email=email)  # type: ignore[arg-type]
    except HTTPException:
        pass
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/token", response_model=TokenResponse)
def issue_token(payload: TokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Issue a JWT for a user identified by (tenant_id, email).

    For the hackathon demo the user record is auto-created if missing.
    In production this would validate credentials properly.
    """
    user = db.scalar(
        select(User).where(User.tenant_id == payload.tenant_id, User.email == payload.email)
    )
    if user is None:
        # Auto-provision demo user — remove in production
        from app.models.tenant import Tenant  # noqa: PLC0415

        tenant = db.get(Tenant, payload.tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        user = User(
            tenant_id=payload.tenant_id,
            email=payload.email,
            name=payload.email.split("@")[0],
            role="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Auto-provisioned demo user %s for tenant %s", user.email, user.tenant_id)

    token_data = {
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "role": user.role,
        "email": user.email,
    }
    access_token = _create_access_token(token_data)
    return TokenResponse(access_token=access_token)
