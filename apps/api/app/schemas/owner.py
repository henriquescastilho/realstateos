from pydantic import BaseModel, EmailStr

from app.schemas.common import ORMModel


class OwnerCreate(BaseModel):
    name: str
    document: str
    email: EmailStr
    phone: str


class OwnerRead(ORMModel):
    id: str
    tenant_id: str
    name: str
    document: str
    email: str
    phone: str

