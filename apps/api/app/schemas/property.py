from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMModel


class PropertyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    address: str
    city: str
    state: str
    zip: str
    owner_id: str
    iptu_registration_number: str | None = None


class PropertyRead(ORMModel):
    id: str
    tenant_id: str
    address: str
    city: str
    state: str
    zip: str
    owner_id: str
    iptu_registration_number: str | None = None
