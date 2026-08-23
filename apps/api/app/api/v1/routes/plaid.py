from typing import Annotated
from uuid import UUID

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Query, status

from app.config import get_settings
from app.core.errors import ValidationError
from app.core.logging import get_logger
from app.deps import CurrentUser, DbSession
from app.schemas.plaid import (
    ExchangeRequest,
    LinkTokenRequest,
    LinkTokenResponse,
    PlaidItemResponse,
    SyncResultResponse,
    SyncRunResponse,
)
from app.services.plaid import link, sync

logger = get_logger(__name__)

router = APIRouter(prefix="/plaid", tags=["plaid"])


async def _enqueue_investments_sync() -> None:
    """Refresh holdings shortly after a connection is made.

    Transactions arrive on their own — Plaid posts a webhook and the handler
    queues a sync. Holdings have no such trigger: the only investments sync is
    a cron at 02:20, so connecting a brokerage in the morning left the
    Investments tab empty until the small hours, which is indistinguishable
    from it being broken.

    A queue failure must not fail the connection: the account is already
    linked and the nightly cron still covers it.
    """
    settings = get_settings()
    try:
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job("sync_investments")
        await pool.aclose()
    except Exception as exc:
        logger.warning("investments_enqueue_failed", error=str(exc))


@router.post("/link-token", response_model=LinkTokenResponse)
async def create_link_token(
    payload: LinkTokenRequest, user: CurrentUser, db: DbSession
) -> LinkTokenResponse:
    """Create a Link token.

    `mode="update"` re-authenticates an existing connection rather than
    creating a duplicate one.
    """
    if payload.mode == "update" and payload.item_id is None:
        raise ValidationError("Update mode requires an item_id.")

    token = await link.create_link_token(
        user.id,
        item_id=payload.item_id if payload.mode == "update" else None,
        db=db,
    )
    return LinkTokenResponse(link_token=token)


@router.post("/exchange", response_model=PlaidItemResponse, status_code=status.HTTP_201_CREATED)
async def exchange_public_token(
    payload: ExchangeRequest, user: CurrentUser, db: DbSession
) -> PlaidItemResponse:
    """Exchange Link's public token and import the institution's accounts."""
    item = await link.exchange_public_token(
        db,
        user.id,
        public_token=payload.public_token,
        institution_id=payload.institution_id,
        institution_name=payload.institution_name,
    )
    await _enqueue_investments_sync()
    return PlaidItemResponse.model_validate(item)


@router.get("/items", response_model=list[PlaidItemResponse])
async def list_items(user: CurrentUser, db: DbSession) -> list[PlaidItemResponse]:
    items = await link.list_items(db, user.id)
    return [PlaidItemResponse.model_validate(i) for i in items]


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item(item_id: UUID, user: CurrentUser, db: DbSession) -> None:
    """Disconnect an institution, telling Plaid to release the token first."""
    await link.remove_item(db, user.id, item_id)


@router.post("/items/{item_id}/sync", response_model=SyncResultResponse)
async def sync_item(item_id: UUID, user: CurrentUser, db: DbSession) -> SyncResultResponse:
    """Force a sync now, rather than waiting for a webhook or the hourly job."""
    run = await sync.sync_item_by_id(db, user.id, item_id)
    return SyncResultResponse(
        added=run.added, modified=run.modified, removed=run.removed, status=run.status
    )


@router.get("/sync-runs", response_model=list[SyncRunResponse])
async def list_sync_runs(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[SyncRunResponse]:
    """Recent sync history, so a silently failing connection is visible."""
    runs = await sync.recent_sync_runs(db, user.id, limit=limit)
    return [SyncRunResponse.model_validate(r) for r in runs]
