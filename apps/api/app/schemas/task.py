from pydantic import BaseModel

from app.schemas.common import ORMModel


class TaskCreate(BaseModel):
    type: str
    payload: dict


class TaskRead(ORMModel):
    id: str
    tenant_id: str
    type: str
    status: str
    payload: dict
