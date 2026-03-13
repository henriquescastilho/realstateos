from pydantic import BaseModel, EmailStr

from app.schemas.common import ORMModel


class TenantCreate(BaseModel):
    name: str
    admin_name: str
    admin_email: EmailStr


class TenantRead(ORMModel):
    id: str
    name: str


class TenantBootstrapResponse(BaseModel):
    tenant: TenantRead
    admin_user: "UserRead"


from app.schemas.user import UserRead  # noqa: E402

TenantBootstrapResponse.model_rebuild()
