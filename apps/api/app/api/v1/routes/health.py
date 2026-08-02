from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.logging import get_logger
from app.db.session import get_db

logger = get_logger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str


class ReadyResponse(BaseModel):
    status: Literal["ready", "degraded"]
    database: bool


@router.get("/health", response_model=HealthResponse)
async def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Liveness: is the process up. Must not touch external dependencies."""
    return HealthResponse(
        status="ok",
        service="api",
        version=settings.version,
        environment=settings.environment,
    )


@router.get("/health/ready", response_model=ReadyResponse)
async def ready(db: Annotated[AsyncSession, Depends(get_db)]) -> ReadyResponse:
    """Readiness: can the process actually serve traffic."""
    database_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        logger.warning("readiness_check_failed", dependency="database", exc_info=True)
        database_ok = False

    return ReadyResponse(
        status="ready" if database_ok else "degraded",
        database=database_ok,
    )
