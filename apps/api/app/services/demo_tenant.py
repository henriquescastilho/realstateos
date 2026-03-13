from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tenant import Tenant

DEMO_TENANT_NAME = "hackathon-demo"


def get_or_create_demo_tenant(db: Session) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.name == DEMO_TENANT_NAME))
    if tenant is not None:
        return tenant

    tenant = Tenant(name=DEMO_TENANT_NAME)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant
