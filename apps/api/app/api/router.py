from fastapi import APIRouter

from app.api.v1 import auth, charges, contracts, documents, owners, properties, renters, tasks, tenants

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(owners.router, prefix="/owners", tags=["owners"])
api_router.include_router(renters.router, prefix="/renters", tags=["renters"])
api_router.include_router(properties.router, prefix="/properties", tags=["properties"])
api_router.include_router(contracts.router, prefix="/contracts", tags=["contracts"])
api_router.include_router(charges.router, prefix="/charges", tags=["charges"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
