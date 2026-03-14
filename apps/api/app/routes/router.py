from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.routes import charges, contracts, demo, documents, owners, properties, renters, tasks

hackathon_router = APIRouter()
hackathon_router.include_router(auth_router)
hackathon_router.include_router(owners.router, prefix="/owners", tags=["owners"])
hackathon_router.include_router(renters.router, prefix="/renters", tags=["renters"])
hackathon_router.include_router(properties.router, prefix="/properties", tags=["properties"])
hackathon_router.include_router(contracts.router, prefix="/contracts", tags=["contracts"])
hackathon_router.include_router(charges.router, prefix="/charges", tags=["charges"])
hackathon_router.include_router(documents.router, prefix="/documents", tags=["documents"])
hackathon_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
hackathon_router.include_router(demo.router, prefix="/demo", tags=["demo"])
