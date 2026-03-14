"""Webhook endpoint management API.

Endpoints:
    POST   /webhooks           Register a new webhook endpoint
    GET    /webhooks           List registered webhook endpoints (paginated)
    GET    /webhooks/{id}      Get a single webhook endpoint
    DELETE /webhooks/{id}      Deactivate (soft-delete) a webhook endpoint
    POST   /webhooks/test      Send a test ping to a registered endpoint
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.middleware.tenant import OrgContext, get_current_org
from app.models.webhook import WebhookEndpoint
from app.openapi import AUTH_RESPONSES, RESPONSES_404, RESPONSES_422
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.schemas.webhook import WebhookCreate, WebhookRead
from app.services.webhook_service import dispatch_webhook_event

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_SECRET_BYTES = 32  # 256-bit HMAC secret


def _get_webhook_or_404(db: Session, webhook_id: str, tenant_id: str) -> WebhookEndpoint:
    ep = db.scalar(
        select(WebhookEndpoint).where(
            WebhookEndpoint.id == webhook_id,
            WebhookEndpoint.tenant_id == tenant_id,
            WebhookEndpoint.deleted_at.is_(None),
        )
    )
    if ep is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook endpoint not found")
    return ep


@router.post(
    "",
    response_model=WebhookRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register webhook endpoint",
    description=(
        "Register a new HTTP endpoint to receive event notifications. "
        "A 256-bit HMAC secret is generated and returned **once** in the response — "
        "store it securely. It will not be returned again. "
        "Every delivery includes the header `X-RealstateOS-Signature: sha256=<hmac>` "
        "computed with this secret over the raw request body."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_422},
)
def register_webhook(
    payload: WebhookCreate,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> dict:
    secret = secrets.token_hex(_SECRET_BYTES)
    ep = WebhookEndpoint(
        tenant_id=org.tenant_id,
        url=str(payload.url),
        events=payload.events,
        secret=secret,
        is_active=True,
        description=payload.description,
    )
    db.add(ep)
    db.commit()
    db.refresh(ep)

    # Return the secret once — callers must save it; it won't be returned again
    result = WebhookRead.model_validate(ep).model_dump()
    result["secret"] = secret  # only returned at creation time
    return result


@router.get(
    "",
    response_model=PaginatedResponse[WebhookRead],
    summary="List webhook endpoints",
    description=(
        "Return all active webhook endpoints for the authenticated tenant, paginated. "
        "Secrets are masked in list responses."
    ),
    responses={**AUTH_RESPONSES},
)
def list_webhooks(
    p: PaginationParams = Depends(),
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> PaginatedResponse[WebhookRead]:
    from sqlalchemy import func  # noqa: PLC0415

    base = select(WebhookEndpoint).where(
        WebhookEndpoint.tenant_id == org.tenant_id,
        WebhookEndpoint.deleted_at.is_(None),
    )
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = list(db.scalars(base.order_by(WebhookEndpoint.created_at.desc()).offset(p.offset).limit(p.limit)).all())
    return PaginatedResponse.build(items=items, total=total or 0, params=p)


@router.get(
    "/{webhook_id}",
    response_model=WebhookRead,
    summary="Get webhook endpoint",
    description="Retrieve a single webhook endpoint by ID. Secret is not returned.",
    responses={**AUTH_RESPONSES, **RESPONSES_404},
)
def get_webhook(
    webhook_id: str,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> WebhookEndpoint:
    return _get_webhook_or_404(db, webhook_id, org.tenant_id)


@router.delete(
    "/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate webhook endpoint",
    description=(
        "Soft-delete a webhook endpoint. "
        "The endpoint will stop receiving events immediately. "
        "This action cannot be undone via the API."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404},
)
def delete_webhook(
    webhook_id: str,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> None:
    ep = _get_webhook_or_404(db, webhook_id, org.tenant_id)
    ep.deleted_at = datetime.now(UTC)
    ep.is_active = False
    db.add(ep)
    db.commit()


@router.post(
    "/{webhook_id}/test",
    status_code=status.HTTP_200_OK,
    summary="Send test ping to webhook endpoint",
    description=(
        "Send a `ping` test event to the registered endpoint to verify it is reachable. "
        "Returns `{\"delivered\": true}` if the endpoint returned HTTP 2xx, "
        "`{\"delivered\": false}` otherwise (check server logs for details)."
    ),
    responses={**AUTH_RESPONSES, **RESPONSES_404},
)
def test_webhook(
    webhook_id: str,
    org: OrgContext = Depends(get_current_org),
    db: Session = Depends(get_db),
) -> dict:
    _get_webhook_or_404(db, webhook_id, org.tenant_id)
    delivered = dispatch_webhook_event(
        db=db,
        tenant_id=org.tenant_id,
        event="ping",
        data={"webhook_id": webhook_id, "message": "Test ping from Real Estate OS"},
    )
    return {"delivered": delivered > 0}
