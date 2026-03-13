from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_context, get_db
from app.core.tenant import RequestContext
from app.models.contract import Contract
from app.schemas.contract import ContractCreate, ContractRead
from app.services.contract_service import create_contract

router = APIRouter()


@router.post("", response_model=ContractRead, status_code=status.HTTP_201_CREATED)
def create_contract_route(
    payload: ContractCreate,
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return create_contract(db, context.tenant_id, payload)


@router.get("", response_model=list[ContractRead])
def list_contracts(
    db: Session = Depends(get_db),
    context: Annotated[RequestContext, Depends(get_current_context)] = None,
):
    return list(db.scalars(select(Contract).where(Contract.tenant_id == context.tenant_id)).all())

