"""arq worker: background sync and scheduled jobs.

Same image as the API, different entrypoint (PLAN.md section 12), so there is
no chance of the two drifting apart in dependencies.

Every job is idempotent. Running one twice must leave the database in the same
state as running it once — snapshots upsert, transactions dedupe on
plaid_transaction_id, and the sync cursor makes replays no-ops.
"""

from typing import Any, ClassVar

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import select

from app.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import SessionLocal
from app.models.plaid_item import PlaidItem
from app.services import dashboard_service
from app.services.plaid import client, sync

settings = get_settings()
configure_logging(debug=settings.debug)
logger = get_logger(__name__)


async def sync_item(ctx: dict[str, Any], item_id: str) -> dict[str, int] | None:
    """Sync one connection. Triggered by a webhook or a manual refresh."""
    from uuid import UUID

    async with SessionLocal() as db:
        item = await db.get(PlaidItem, UUID(item_id))
        if item is None or item.deleted_at is not None:
            logger.info("sync_item_skipped", item_id=item_id, reason="missing")
            return None

        try:
            run = await sync.sync_item_transactions(db, item)
        except client.PlaidError:
            # Already recorded against the item and a sync_runs row.
            return None

        return {"added": run.added, "modified": run.modified, "removed": run.removed}


async def sync_all_items(ctx: dict[str, Any]) -> int:
    """Hourly safety net.

    Webhooks are the primary trigger, but they can be missed — a dropped
    delivery would otherwise mean silently stale data forever.
    """
    async with SessionLocal() as db:
        items = list(
            (
                await db.scalars(
                    select(PlaidItem).where(
                        PlaidItem.deleted_at.is_(None),
                        PlaidItem.status.in_(("good", "pending_expiration")),
                    )
                )
            ).all()
        )

    synced = 0
    for item in items:
        await sync_item(ctx, str(item.id))
        synced += 1

    logger.info("sync_all_items_complete", items=synced)
    return synced


async def refresh_item_health(ctx: dict[str, Any]) -> int:
    """Flag connections that need re-authentication."""
    async with SessionLocal() as db:
        stale = list(
            (
                await db.scalars(
                    select(PlaidItem).where(
                        PlaidItem.deleted_at.is_(None),
                        PlaidItem.status == "login_required",
                    )
                )
            ).all()
        )

    if stale:
        logger.warning(
            "plaid_items_need_reauth",
            count=len(stale),
            items=[str(i.id) for i in stale],
        )
    return len(stale)


async def snapshot_net_worth(ctx: dict[str, Any]) -> int:
    """Nightly: record each user's net worth for the day.

    Idempotent — re-running updates the day's row rather than adding another,
    so a retry after a partial failure is safe.
    """
    async with SessionLocal() as db:
        count = await dashboard_service.snapshot_all_users(db)
    logger.info("net_worth_snapshots_written", users=count)
    return count


async def snapshot_balances(ctx: dict[str, Any]) -> int:
    """Nightly: record each account's balance, upserted per (account, date)."""
    async with SessionLocal() as db:
        count = await dashboard_service.snapshot_account_balances(db)
    logger.info("balance_snapshots_written", accounts=count)
    return count


async def startup(ctx: dict[str, Any]) -> None:
    logger.info("worker_starting", environment=settings.environment)


async def shutdown(ctx: dict[str, Any]) -> None:
    logger.info("worker_stopping")


class WorkerSettings:
    """arq entrypoint: `arq app.workers.main.WorkerSettings`."""

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions: ClassVar[list[Any]] = [
        sync_item,
        sync_all_items,
        refresh_item_health,
        snapshot_net_worth,
        snapshot_balances,
    ]
    cron_jobs: ClassVar[list[Any]] = [
        # Safety net for missed webhooks.
        cron(sync_all_items, minute=7),
        # Daily health check, 06:00.
        cron(refresh_item_health, hour=6, minute=0),
        # Snapshots run before dawn so the chart is current each morning.
        # Balances first: net worth is derived from them.
        cron(snapshot_balances, hour=2, minute=0),
        cron(snapshot_net_worth, hour=2, minute=15),
    ]
    on_startup = startup
    on_shutdown = shutdown
    max_tries = 3
    job_timeout = 300
    keep_result = 3600
