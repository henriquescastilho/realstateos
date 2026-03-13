from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.tenant import TenantBootstrapResponse, TenantCreate

router = APIRouter()


@router.post("", response_model=TenantBootstrapResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreate, db: Session = Depends(get_db)) -> TenantBootstrapResponse:
    tenant = Tenant(name=payload.name)
    db.add(tenant)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        name=payload.admin_name,
        email=payload.admin_email,
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(tenant)
    db.refresh(user)

    return TenantBootstrapResponse(tenant=tenant, admin_user=user)

