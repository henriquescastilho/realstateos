"""JWT authentication — token issuance and request identity extraction."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.models.tenant import Tenant
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


def _create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(tz=timezone.utc) + timedelta(
        minutes=expires_minutes or settings.access_token_expire_minutes
    )
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _create_refresh_token(data: dict) -> str:
    payload = {"sub": data["sub"], "type": "refresh"}
    payload["exp"] = datetime.now(tz=timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
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


def _build_auth_response(user: User, tenant: Tenant) -> dict:
    token_data = {
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "org_id": user.tenant_id,
        "role": user.role,
        "email": user.email,
    }
    return {
        "access_token": _create_access_token(token_data),
        "refresh_token": _create_refresh_token(token_data),
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "org_id": user.tenant_id,
            "org_name": tenant.name,
        },
        "orgs": [{"id": tenant.id, "name": tenant.name}],
    }


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
    tenant_id: str | None = payload.get("tenant_id")
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
        tenant_id = payload.get("tenant_id")
        role = payload.get("role")
        email = payload.get("email")
        if all([user_id, tenant_id, role, email]):
            return CurrentUser(user_id=user_id, tenant_id=tenant_id, role=role, email=email)  # type: ignore[arg-type]
    except HTTPException:
        pass
    return None


# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    org_name: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email + password."""
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not user.check_password(payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos",
        )
    tenant = db.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Tenant not found")
    return _build_auth_response(user, tenant)


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Create a new user + tenant (org)."""
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    tenant = Tenant(name=payload.org_name)
    db.add(tenant)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        name=payload.name,
        email=payload.email,
        role="admin",
    )
    user.set_password(payload.password)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(tenant)

    return _build_auth_response(user, tenant)


@router.post("/refresh")
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new access token."""
    decoded = _decode_token(payload.refresh_token)
    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.get(User, decoded["sub"])
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_data = {
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "org_id": user.tenant_id,
        "role": user.role,
        "email": user.email,
    }
    return {"access_token": _create_access_token(token_data)}


@router.post("/token", response_model=TokenResponse)
def issue_token(payload: TokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Issue a JWT for a user identified by (tenant_id, email). Legacy/demo endpoint."""
    user = db.scalar(
        select(User).where(User.tenant_id == payload.tenant_id, User.email == payload.email)
    )
    if user is None:
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

    token_data = {
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "role": user.role,
        "email": user.email,
    }
    access_token = _create_access_token(token_data)
    return TokenResponse(access_token=access_token)
