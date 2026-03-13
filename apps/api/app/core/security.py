from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings


def create_access_token(subject: str, tenant_id: str, role: str) -> str:
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": subject, "tenant_id": tenant_id, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
