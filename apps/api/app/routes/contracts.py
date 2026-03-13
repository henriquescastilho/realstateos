from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.contract import Contract
from app.schemas.contract import ContractCreate, ContractRead
from app.services.contract_service import create_contract
from app.services.demo_tenant import get_or_create_demo_tenant

router = APIRouter()


@router.post("", response_model=ContractRead, status_code=status.HTTP_201_CREATED)
def create_contract_route(payload: ContractCreate, db: Session = Depends(get_db)):
    demo_tenant = get_or_create_demo_tenant(db)
    return create_contract(db, demo_tenant.id, payload)


@router.get("", response_model=list[ContractRead])
def list_contracts(db: Session = Depends(get_db)):
    demo_tenant = get_or_create_demo_tenant(db)
    return list(db.scalars(select(Contract).where(Contract.tenant_id == demo_tenant.id)).all())
