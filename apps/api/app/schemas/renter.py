from pydantic import BaseModel, EmailStr

from app.schemas.common import ORMModel


class RenterCreate(BaseModel):
    name: str
    document: str
    email: EmailStr
    phone: str


class RenterRead(ORMModel):
    id: str
    tenant_id: str
    name: str
    document: str
    email: str
    phone: str
