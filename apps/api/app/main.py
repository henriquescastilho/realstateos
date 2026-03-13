from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.router import hackathon_router

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(hackathon_router)
app.include_router(hackathon_router, prefix="/api")


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
