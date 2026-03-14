from pydantic import BaseModel, EmailStr

from app.schemas.common import ORMModel
from app.schemas.validators import BRDocument, BRPhone, SafeStr


class OwnerCreate(BaseModel):
    name: SafeStr
    document: BRDocument
    email: EmailStr
    phone: BRPhone


class OwnerRead(ORMModel):
    id: str
    tenant_id: str
    name: str
    document: str
    email: str
    phone: str
