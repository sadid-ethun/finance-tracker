"""Plaid webhook receiver.

Unauthenticated by necessity — Plaid has no session — so the signature is the
only thing standing between this endpoint and the open internet. The body is
never parsed as trusted input until verify_webhook has passed.

Returns 200 as fast as possible and hands the work to the queue: Plaid retries
on non-2xx and treats slowness as failure, which would cause duplicate
deliveries (PLAN.md section 9).
"""

from typing import Any

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Header, Request
from sqlalchemy import select

from app.config import get_settings
from app.core.logging import get_logger
from app.deps import DbSession
from app.models.plaid_item import PlaidItem
from app.services.plaid import webhooks

logger = get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/plaid")
async def plaid_webhook(
    request: Request,
    db: DbSession,
    plaid_verification: str | None = Header(default=None, alias="Plaid-Verification"),
) -> dict[str, Any]:
    body = await request.body()

    # Raises 401 before the body is trusted for anything.
    payload = await webhooks.verify_webhook(body, plaid_verification)

    action = webhooks.classify(payload)
    plaid_item_id = payload.get("item_id")

    logger.info(
        "plaid_webhook_received",
        webhook_type=payload.get("webhook_type"),
        webhook_code=payload.get("webhook_code"),
        action=action,
    )

    if action == "ignore" or not plaid_item_id:
        return {"status": "ignored"}

    item = await db.scalar(
        select(PlaidItem).where(
            PlaidItem.plaid_item_id == plaid_item_id,
            PlaidItem.deleted_at.is_(None),
        )
    )
    if item is None:
        # An item we no longer track. Acknowledge so Plaid stops retrying.
        logger.info("plaid_webhook_unknown_item", plaid_item_id=plaid_item_id)
        return {"status": "unknown_item"}

    if action == "reauth":
        item.status = "login_required"
        item.last_error_code = payload.get("error", {}).get("error_code")
        await db.commit()
        return {"status": "flagged_for_reauth"}

    if action in {"sync", "new_accounts"}:
        await _enqueue_sync(str(item.id))
        return {"status": "queued"}

    return {"status": "ignored"}


async def _enqueue_sync(item_id: str) -> None:
    """Hand off to the worker.

    A queue failure must not fail the webhook: returning non-2xx would make
    Plaid retry, and the hourly safety-net sync will catch the item anyway.
    """
    settings = get_settings()
    try:
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job("sync_item", item_id)
        await pool.aclose()
    except Exception as exc:
        logger.warning("webhook_enqueue_failed", item_id=item_id, error=str(exc))
