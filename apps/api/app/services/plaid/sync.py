"""Transaction sync via /transactions/sync.

Uses `/transactions/sync`, not `/transactions/get`. Sync returns a cursor plus
explicit added/modified/removed sets and handles the pending→posted transition
correctly; `/get` does not, and using it here would be a slow-motion
correctness disaster (PLAN.md section 9).

Two invariants govern this module:

1. **The cursor and its data commit together.** If the cursor advances but the
   rows do not, those transactions are lost forever — Plaid will never send
   them again. Everything is staged and committed once, at the end.

2. **User edits are never clobbered.** A `modified` payload refreshes the
   bank's own fields, but `category_source='user'`, notes, splits, and budget
   exclusions belong to the user and survive every sync.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from plaid.model.transactions_sync_request import TransactionsSyncRequest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.account import Account
from app.models.plaid_item import PlaidItem, SyncRun
from app.models.rule import Rule
from app.models.transaction import Transaction
from app.services.categorization import categorize
from app.services.category_service import ensure_categories
from app.services.plaid import client
from app.services.plaid.mappers import map_transaction
from app.services.transfer_service import detect_transfers

logger = get_logger(__name__)

#: Plaid caps a sync page at 500.
PAGE_SIZE = 500
#: Stop rather than loop forever if a cursor never settles.
MAX_PAGES = 60

#: Fields the bank owns. Everything else on a transaction belongs to the user.
BANK_OWNED_FIELDS = (
    "amount",
    "currency",
    "date",
    "authorized_date",
    "name",
    "merchant_name",
    "plaid_pfc_primary",
    "plaid_pfc_detailed",
    "pending",
    "pending_plaid_transaction_id",
    "location_city",
    "location_region",
    "payment_channel",
)


async def sync_item_transactions(db: AsyncSession, item: PlaidItem) -> SyncRun:
    """Drain Plaid's sync feed for one item and persist it atomically."""
    # The default taxonomy is seeded lazily on first read of /categories. A user
    # who connects a bank before ever opening the app would otherwise have no
    # categories for Plaid's taxonomy to map onto, and every imported
    # transaction would land uncategorized with no second chance — a sync only
    # categorizes each row once.
    #
    # Deliberately before the SyncRun below: this commits, and it must not do so
    # inside the transaction that carries the cursor and its rows.
    await ensure_categories(db, item.user_id)

    # Captured while the instance is still live. The except block below runs
    # after a rollback, which expires every ORM object in the session; reading
    # item.id there would lazy-load and raise MissingGreenlet from inside the
    # error handler, losing the Plaid error it was meant to record.
    user_id = item.user_id
    item_pk = item.id
    run_started_at = datetime.now(UTC)

    run = SyncRun(
        user_id=user_id,
        plaid_item_id=item_pk,
        kind="transactions",
        status="running",
        started_at=run_started_at,
    )
    db.add(run)
    await db.flush()

    access_token = client.access_token_for(item)
    cursor = item.transactions_cursor

    added: list[dict[str, Any]] = []
    modified: list[dict[str, Any]] = []
    removed: list[str] = []

    try:
        for _ in range(MAX_PAGES):
            request_kwargs: dict[str, Any] = {
                "access_token": access_token,
                "count": PAGE_SIZE,
            }
            if cursor:
                request_kwargs["cursor"] = cursor

            page = await client.call("transactions_sync", TransactionsSyncRequest(**request_kwargs))

            added.extend(page.get("added", []))
            modified.extend(page.get("modified", []))
            removed.extend(r.get("transaction_id") for r in page.get("removed", []) if r)

            cursor = page.get("next_cursor")
            if not page.get("has_more"):
                break

        counts = await _persist(db, item, added, modified, removed)

        # The cursor moves only here, in the same transaction as the rows above.
        item.transactions_cursor = cursor
        item.last_successful_sync_at = datetime.now(UTC)
        item.status = "good"
        item.last_error_code = None
        item.last_error_message = None

        run.status = "success"
        run.added = counts["added"]
        run.modified = counts["modified"]
        run.removed = counts["removed"]
        run.finished_at = datetime.now(UTC)

        await db.commit()

        logger.info("plaid_sync_complete", item_id=str(item.id), **counts)

    except client.PlaidError as exc:
        await db.rollback()
        # Identifiers, not the ORM instance: rollback has expired `item`, so
        # reading an attribute off it here would lazy-load and raise
        # MissingGreenlet from inside the error handler.
        await _record_failure(db, item_pk, user_id, run_started_at, exc)
        raise

    # Transfer pairing runs after the data lands, so both sides of a movement
    # are present before we look for pairs.
    if run.added or run.modified:
        await detect_transfers(db, item.user_id, since_days=30)

    return run


async def _persist(
    db: AsyncSession,
    item: PlaidItem,
    added: list[dict[str, Any]],
    modified: list[dict[str, Any]],
    removed: list[str],
) -> dict[str, int]:
    accounts = {
        a.plaid_account_id: a
        for a in (await db.scalars(select(Account).where(Account.plaid_item_id == item.id))).all()
        if a.plaid_account_id
    }

    rules = list(
        (
            await db.scalars(
                select(Rule)
                .where(Rule.user_id == item.user_id, Rule.is_active.is_(True))
                .order_by(Rule.priority, Rule.created_at)
            )
        ).all()
    )

    counts = {"added": 0, "modified": 0, "removed": 0}

    for raw in added + modified:
        mapped = map_transaction(raw)
        account = accounts.get(mapped.pop("plaid_account_id"))
        if account is None:
            # An account we do not track (or one added since the last import).
            continue

        existing = await db.scalar(
            select(Transaction).where(
                Transaction.plaid_transaction_id == mapped["plaid_transaction_id"]
            )
        )

        if existing is None:
            transaction = Transaction(user_id=item.user_id, account_id=account.id, **mapped)
            await categorize(db, item.user_id, transaction, rules=rules)
            db.add(transaction)
            counts["added"] += 1
        else:
            # Refresh only what the bank owns; the user's edits stay put.
            for field in BANK_OWNED_FIELDS:
                if field in mapped:
                    setattr(existing, field, mapped[field])

            if existing.category_source != "user":
                await categorize(db, item.user_id, existing, rules=rules)

            existing.deleted_at = None
            counts["modified"] += 1

    if removed:
        stale = await db.scalars(
            select(Transaction).where(
                Transaction.plaid_transaction_id.in_(removed),
                Transaction.user_id == item.user_id,
            )
        )
        now = datetime.now(UTC)
        for transaction in stale:
            transaction.deleted_at = now
            counts["removed"] += 1

    return counts


async def _record_failure(
    db: AsyncSession,
    item_pk: Any,
    user_id: str,
    run_started_at: datetime,
    exc: client.PlaidError,
) -> None:
    """Persist the failure so a broken connection is visible, not silent.

    Takes plain identifiers rather than the ORM instances: the caller has just
    rolled back, which expires them, and any attribute read would attempt IO
    where async SQLAlchemy cannot do it.
    """
    code = exc.plaid_error_code or "UNKNOWN"

    fresh_item = await db.get(PlaidItem, item_pk)
    if fresh_item is not None:
        if code in client.REAUTH_ERROR_CODES:
            fresh_item.status = "login_required"
        elif code not in client.TRANSIENT_ERROR_CODES:
            fresh_item.status = "error"
        fresh_item.last_error_code = code
        fresh_item.last_error_message = str(exc.detail)

    db.add(
        SyncRun(
            user_id=user_id,
            plaid_item_id=item_pk,
            kind="transactions",
            status="error",
            started_at=run_started_at,
            finished_at=datetime.now(UTC),
            error_code=code,
            error_message=str(exc.detail),
        )
    )
    await db.commit()

    logger.warning("plaid_sync_failed", item_id=str(item_pk), plaid_error_code=code)


async def sync_user(db: AsyncSession, user_id: str) -> list[SyncRun]:
    """Sync every healthy connection for a user."""
    # Ids, then a fresh fetch per iteration — see sync_all_investments. A
    # rollback inside one item expires every instance in the session, so
    # iterating ORM objects here means the second item dies on an expired
    # attribute rather than syncing.
    item_ids = list(
        (
            await db.scalars(
                select(PlaidItem.id).where(
                    PlaidItem.user_id == user_id,
                    PlaidItem.deleted_at.is_(None),
                    PlaidItem.status != "error",
                )
            )
        ).all()
    )

    runs: list[SyncRun] = []
    for item_id in item_ids:
        item = await db.get(PlaidItem, item_id)
        if item is None:
            continue
        try:
            runs.append(await sync_item_transactions(db, item))
        except client.PlaidError:
            # Already recorded; one broken institution must not stop the others.
            continue
    return runs


async def recent_sync_runs(db: AsyncSession, user_id: str, *, limit: int = 20) -> list[SyncRun]:
    return list(
        (
            await db.scalars(
                select(SyncRun)
                .where(SyncRun.user_id == user_id)
                .order_by(SyncRun.started_at.desc())
                .limit(limit)
            )
        ).all()
    )


async def sync_item_by_id(db: AsyncSession, user_id: str, item_id: UUID) -> SyncRun:
    from app.services.plaid.link import get_item

    item = await get_item(db, user_id, item_id)
    return await sync_item_transactions(db, item)
