from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.auth import TokenRequest, TokenResponse
from app.services.auth_service import issue_token_for_user

router = APIRouter()


@router.post("/token", response_model=TokenResponse)
def token_exchange(payload: TokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    access_token = issue_token_for_user(db, payload.tenant_id, payload.email)
    if access_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid tenant or email.")
    return TokenResponse(access_token=access_token)

