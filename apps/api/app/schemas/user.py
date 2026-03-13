from app.schemas.common import ORMModel


class UserRead(ORMModel):
    id: str
    tenant_id: str
    name: str
    email: str
    role: str
