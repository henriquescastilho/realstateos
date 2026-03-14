from pydantic import BaseModel, EmailStr

from app.schemas.common import ORMModel
from app.schemas.validators import BRDocument, BRPhone, SafeStr


class OwnerCreate(BaseModel):
    name: SafeStr
    document: BRDocument
    email: EmailStr
    phone: BRPhone

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "João da Silva",
                    "document": "529.982.247-25",
                    "email": "joao.silva@email.com.br",
                    "phone": "(11) 99999-1234",
                }
            ]
        }
    }


class OwnerRead(ORMModel):
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
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "tenant_id": "org-abc123",
                    "name": "João da Silva",
                    "document": "529.982.247-25",
                    "email": "joao.silva@email.com.br",
                    "phone": "(11) 99999-1234",
                }
            ]
        }
    }
