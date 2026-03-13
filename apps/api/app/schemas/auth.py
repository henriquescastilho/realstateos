from pydantic import BaseModel, EmailStr


class TokenRequest(BaseModel):
    tenant_id: str
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
