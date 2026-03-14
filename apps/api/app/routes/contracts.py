from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.models.contract import Contract
from app.schemas.contract import ContractCreate, ContractRead
from app.services.contract_service import create_contract

router = APIRouter()


@router.post("", response_model=ContractRead, status_code=status.HTTP_201_CREATED)
def create_contract_route(
    payload: ContractCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_contract(db, current_user.tenant_id, payload)


@router.get("", response_model=list[ContractRead])
def list_contracts(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(Contract).where(Contract.tenant_id == current_user.tenant_id)).all())
