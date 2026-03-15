from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.common import ORMModel
from app.schemas.validators import BRDocument, BRPhone, SafeStr


class RenterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: SafeStr
    document: BRDocument
    email: EmailStr
    phone: BRPhone

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Maria Oliveira",
                    "document": "111.444.777-35",
                    "email": "maria.oliveira@email.com.br",
                    "phone": "(21) 98888-5678",
                }
            ]
        }
    }


class RenterRead(ORMModel):
    id: str
    tenant_id: str
    name: str
    document: str
    email: str
    phone: str

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "660e8400-e29b-41d4-a716-446655440001",
                    "tenant_id": "org-abc123",
                    "name": "Maria Oliveira",
                    "document": "111.444.777-35",
                    "email": "maria.oliveira@email.com.br",
                    "phone": "(21) 98888-5678",
                }
            ]
        }
    }
