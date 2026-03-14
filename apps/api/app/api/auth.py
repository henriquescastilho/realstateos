from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

router = APIRouter(prefix="/auth", tags=["auth"])


class CurrentUser(BaseModel):
    """Authenticated user context injected into route handlers."""

    user_id: str
    tenant_id: str
    email: str
    role: str

    model_config = {"frozen": True}


class TokenRequest(BaseModel):
    tenant_id: str
    email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "email": user.email,
        "role": user.role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> CurrentUser:
    """FastAPI dependency — extracts and validates the JWT, returns CurrentUser."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id: str | None = payload.get("sub")
        tenant_id: str | None = payload.get("tenant_id")
        email: str | None = payload.get("email")
        role: str | None = payload.get("role")
        if user_id is None or tenant_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    return CurrentUser(
        user_id=user_id,
        tenant_id=tenant_id,
        email=email or "",
        role=role or "user",
    )


@router.post("/token", response_model=TokenResponse)
def login(body: TokenRequest, db: Session = Depends(get_db)):
    """Issue a JWT for an existing user (identified by tenant_id + email)."""
    user = db.scalar(
        select(User).where(
            User.tenant_id == body.tenant_id,
            User.email == body.email,
        )
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    token = create_access_token(user)
    return TokenResponse(access_token=token)
