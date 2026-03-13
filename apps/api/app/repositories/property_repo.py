from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.property import Property


def list_properties_for_tenant(db: Session, tenant_id: str) -> list[Property]:
    statement = select(Property).where(Property.tenant_id == tenant_id).order_by(Property.address.asc())
    return list(db.scalars(statement).all())
