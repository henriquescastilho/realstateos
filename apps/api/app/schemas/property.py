from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMModel
from app.schemas.validators import BRCEP, SafeStr


class PropertyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    address: SafeStr
    city: SafeStr
    state: SafeStr
    zip: BRCEP
    owner_id: str
    iptu_registration_number: str | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "address": "Rua das Flores, 123, Apto 45",
                    "city": "São Paulo",
                    "state": "SP",
                    "zip": "01310-100",
                    "owner_id": "550e8400-e29b-41d4-a716-446655440000",
                    "iptu_registration_number": "SP-001234567",
                }
            ]
        }
    }


class PropertyRead(ORMModel):
    id: str
    tenant_id: str
    address: str
    city: str
    state: str
    zip: str
    owner_id: str
    iptu_registration_number: str | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "770e8400-e29b-41d4-a716-446655440002",
                    "tenant_id": "org-abc123",
                    "address": "Rua das Flores, 123, Apto 45",
                    "city": "São Paulo",
                    "state": "SP",
                    "zip": "01310-100",
                    "owner_id": "550e8400-e29b-41d4-a716-446655440000",
                    "iptu_registration_number": "SP-001234567",
                }
            ]
        }
    }
