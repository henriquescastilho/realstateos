from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.deps import get_db
from app.models.charge import Charge
from app.models.contract import Contract
from app.models.document import Document
from app.models.owner import Owner
from app.models.property import Property
from app.models.renter import Renter
from app.models.task import Task

router = APIRouter()


@router.post(
    "/reset",
    summary="Reset demo data",
    description=(
        "**Development / demo only.** Deletes all data for the authenticated tenant. "
        "Removes owners, renters, properties, contracts, charges, documents, and tasks. "
        "This operation is irreversible — use only in development or demo environments."
    ),
)
def reset_demo(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tid = current_user.tenant_id
    db.execute(delete(Charge).where(Charge.tenant_id == tid))
    db.execute(delete(Document).where(Document.tenant_id == tid))
    db.execute(delete(Task).where(Task.tenant_id == tid))
    db.execute(delete(Contract).where(Contract.tenant_id == tid))
    db.execute(delete(Property).where(Property.tenant_id == tid))
    db.execute(delete(Renter).where(Renter.tenant_id == tid))
    db.execute(delete(Owner).where(Owner.tenant_id == tid))
    db.commit()
    return {"reset": True, "tenant_id": tid}
