from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.common import ORMModel
from app.schemas.validators import BRDocument, BRPhone, SafeStr


class RenterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: SafeStr
    document: BRDocument
    email: EmailStr
    phone: BRPhone


class RenterRead(ORMModel):
    id: str
    tenant_id: str
    name: str
    document: str
    email: str
    phone: str
