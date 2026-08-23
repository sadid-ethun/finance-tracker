"""Plaid investments sync: holdings and investment transactions.

Unlike /transactions/sync there is no cursor here — Plaid returns the full
current holdings each time. That makes the sync naturally idempotent: holdings
are upserted on (account, security) and positions Plaid no longer reports are
deleted, because a sold-out position must not linger at its last known value.
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.investments_transactions_get_request import (
    InvestmentsTransactionsGetRequest,
)
from plaid.model.investments_transactions_get_request_options import (
    InvestmentsTransactionsGetRequestOptions,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.money import to_minor_units
from app.models.account import Account
from app.models.investment import Holding, InvestmentTransaction, Security
from app.models.plaid_item import PlaidItem, SyncRun
from app.services.plaid import client

logger = get_logger(__name__)


def _minor(value: Any) -> int | None:
    """Plaid major-unit float -> minor units, without the float round-trip.

    Not negated: unlike spending, an investment value or price is a magnitude,
    and Plaid reports it the same way we store it.
    """
    if value is None:
        return None
    return to_minor_units(Decimal(str(value)))


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


async def _upsert_securities(
    db: AsyncSession, raw_securities: list[dict[str, Any]]
) -> dict[str, Security]:
    """Create or refresh securities, returned keyed by Plaid id."""
    by_plaid_id: dict[str, Security] = {}

    for raw in raw_securities:
        plaid_id = raw.get("security_id")
        if not plaid_id:
            continue

        security = await db.scalar(select(Security).where(Security.plaid_security_id == plaid_id))
        if security is None:
            security = Security(plaid_security_id=plaid_id, name=raw.get("name") or "Security")
            db.add(security)

        security.name = raw.get("name") or security.name
        security.ticker = raw.get("ticker_symbol")
        security.type = raw.get("type")
        security.cusip = raw.get("cusip")
        security.isin = raw.get("isin")
        security.close_price = _minor(raw.get("close_price"))
        security.close_price_as_of = _as_date(raw.get("close_price_as_of"))
        security.currency = (raw.get("iso_currency_code") or "USD")[:3]
        security.is_cash_equivalent = bool(raw.get("is_cash_equivalent"))

        by_plaid_id[plaid_id] = security

    await db.flush()
    return by_plaid_id


async def sync_item_investments(db: AsyncSession, item: PlaidItem) -> SyncRun:
    """Refresh holdings and investment transactions for one item."""
    # Read before the try. `db.rollback()` in the except block expires every
    # ORM instance in the session, so touching item.user_id there triggers a
    # lazy refresh — IO, which async SQLAlchemy cannot perform outside a
    # greenlet. That raised MissingGreenlet *from the error handler*, masking
    # the Plaid error that caused it and leaving no sync_runs row behind.
    user_id = item.user_id
    item_pk = item.id
    started_at = datetime.now(UTC)

    run = SyncRun(
        user_id=user_id,
        plaid_item_id=item_pk,
        kind="investments",
        status="running",
        started_at=started_at,
    )
    db.add(run)
    await db.flush()

    access_token = client.access_token_for(item)

    try:
        response = await client.call(
            "investments_holdings_get",
            InvestmentsHoldingsGetRequest(access_token=access_token),
        )

        securities = await _upsert_securities(db, response.get("securities", []))

        accounts = {
            a.plaid_account_id: a
            for a in (
                await db.scalars(select(Account).where(Account.plaid_item_id == item.id))
            ).all()
            if a.plaid_account_id
        }

        seen: set[tuple[Any, Any]] = set()
        added = 0

        for raw in response.get("holdings", []):
            account = accounts.get(raw.get("account_id"))
            security = securities.get(raw.get("security_id"))
            if account is None or security is None:
                continue

            holding = await db.scalar(
                select(Holding).where(
                    Holding.account_id == account.id,
                    Holding.security_id == security.id,
                )
            )
            if holding is None:
                holding = Holding(
                    user_id=item.user_id,
                    account_id=account.id,
                    security_id=security.id,
                    quantity=Decimal("0"),
                )
                db.add(holding)
                added += 1

            holding.quantity = Decimal(str(raw.get("quantity") or 0))
            # cost_basis is documented as the TOTAL cost of the position, not a
            # per-share price, so it is stored as-is and never multiplied by
            # quantity. Sandbox fixtures are internally inconsistent about this
            # (some positions report a total that implies an absurd gain), which
            # makes the per-share reading look tempting. It is wrong.
            holding.cost_basis = _minor(raw.get("cost_basis"))
            holding.institution_price = _minor(raw.get("institution_price"))
            holding.institution_value = _minor(raw.get("institution_value")) or 0
            holding.currency = (raw.get("iso_currency_code") or "USD")[:3]
            holding.as_of_date = _as_date(raw.get("institution_price_as_of")) or date.today()

            seen.add((account.id, security.id))

        # Anything Plaid stopped reporting has been sold or transferred out.
        # Leaving it would keep a stale value in the portfolio total forever.
        existing = await db.scalars(
            select(Holding).where(Holding.account_id.in_([a.id for a in accounts.values()]))
        )
        removed = 0
        for holding in existing:
            if (holding.account_id, holding.security_id) not in seen:
                await db.delete(holding)
                removed += 1

        modified = await _sync_investment_transactions(db, item, access_token, accounts)

        run.status = "success"
        run.added = added
        run.modified = modified
        run.removed = removed
        run.finished_at = datetime.now(UTC)

        item.last_successful_sync_at = datetime.now(UTC)

        await db.commit()
        logger.info(
            "plaid_investments_synced",
            item_id=str(item.id),
            holdings_added=added,
            holdings_removed=removed,
            transactions=modified,
        )

    except client.PlaidError as exc:
        await db.rollback()
        run_row = SyncRun(
            user_id=user_id,
            plaid_item_id=item_pk,
            kind="investments",
            status="error",
            started_at=started_at,
            finished_at=datetime.now(UTC),
            error_code=exc.plaid_error_code or "UNKNOWN",
            error_message=str(exc.detail),
        )
        db.add(run_row)
        await db.commit()
        logger.warning(
            "plaid_investments_sync_failed",
            item_id=str(item_pk),
            plaid_error_code=exc.plaid_error_code,
        )
        raise

    return run


async def _sync_investment_transactions(
    db: AsyncSession,
    item: PlaidItem,
    access_token: str,
    accounts: dict[str, Account],
    *,
    days: int = 730,
) -> int:
    """Fetch investment activity, paginating until Plaid stops sending more."""
    end = date.today()
    start = end - timedelta(days=days)

    total = 0
    offset = 0

    while True:
        response = await client.call(
            "investments_transactions_get",
            InvestmentsTransactionsGetRequest(
                access_token=access_token,
                start_date=start,
                end_date=end,
                options=InvestmentsTransactionsGetRequestOptions(count=500, offset=offset),
            ),
        )

        securities = await _upsert_securities(db, response.get("securities", []))
        batch = response.get("investment_transactions", [])
        if not batch:
            break

        for raw in batch:
            account = accounts.get(raw.get("account_id"))
            if account is None:
                continue

            plaid_id = raw.get("investment_transaction_id")
            existing = await db.scalar(
                select(InvestmentTransaction).where(
                    InvestmentTransaction.plaid_investment_transaction_id == plaid_id
                )
            )
            if existing is None:
                existing = InvestmentTransaction(
                    user_id=item.user_id,
                    account_id=account.id,
                    plaid_investment_transaction_id=plaid_id,
                    date=_as_date(raw.get("date")) or end,
                    name=raw.get("name") or "Investment transaction",
                    amount=0,
                )
                db.add(existing)
                total += 1

            security = securities.get(raw.get("security_id"))
            existing.security_id = security.id if security else None
            existing.date = _as_date(raw.get("date")) or existing.date
            existing.name = raw.get("name") or existing.name
            existing.type = str(raw.get("type")) if raw.get("type") else None
            existing.subtype = str(raw.get("subtype")) if raw.get("subtype") else None
            existing.quantity = (
                Decimal(str(raw["quantity"])) if raw.get("quantity") is not None else None
            )
            existing.price = _minor(raw.get("price"))
            existing.fees = _minor(raw.get("fees"))
            existing.amount = _minor(raw.get("amount")) or 0
            existing.currency = (raw.get("iso_currency_code") or "USD")[:3]

        await db.flush()

        offset += len(batch)
        if offset >= int(response.get("total_investment_transactions", offset)):
            break

    return total


async def sync_all_investments(db: AsyncSession, user_id: str) -> list[SyncRun]:
    """Refresh investments for every healthy item belonging to a user."""
    items = await db.scalars(
        select(PlaidItem).where(
            PlaidItem.user_id == user_id,
            PlaidItem.deleted_at.is_(None),
            PlaidItem.status != "error",
        )
    )

    runs: list[SyncRun] = []
    for item in items:
        try:
            runs.append(await sync_item_investments(db, item))
        except client.PlaidError:
            # An item without the investments product raises here; other
            # institutions must still sync.
            continue
    return runs


async def delete_holdings_for_item(db: AsyncSession, item: PlaidItem) -> None:
    """Remove positions when an institution is disconnected."""
    account_ids = list(
        (await db.scalars(select(Account.id).where(Account.plaid_item_id == item.id))).all()
    )
    if account_ids:
        await db.execute(delete(Holding).where(Holding.account_id.in_(account_ids)))
