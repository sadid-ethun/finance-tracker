"""Holdings, allocation, and portfolio performance.

Gain/loss is only meaningful where a cost basis exists. Plaid does not always
supply one, and treating a missing basis as zero would report the entire
position as profit — so unknown-basis positions are excluded from the gain
figure and counted separately instead.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.account import Account
from app.models.investment import Holding, HoldingSnapshot, InvestmentTransaction, Security

#: Plaid security types mapped to the buckets people actually think in.
ASSET_CLASS_MAP: dict[str, str] = {
    "equity": "Stocks",
    "etf": "ETFs",
    "mutual fund": "Mutual funds",
    "fixed income": "Bonds",
    "cash": "Cash",
    "derivative": "Derivatives",
    "cryptocurrency": "Crypto",
    "loan": "Loans",
    "other": "Other",
}

ASSET_CLASS_COLORS = [
    "#0f5132",
    "#3e7c59",
    "#7fa88f",
    "#c2a878",
    "#7c6a9e",
    "#5b7c99",
    "#6b7280",
]


def asset_class(security: Security) -> str:
    if security.is_cash_equivalent:
        return "Cash"
    return ASSET_CLASS_MAP.get((security.type or "other").lower(), "Other")


async def list_holdings(
    db: AsyncSession, user_id: str, *, account_id: UUID | None = None
) -> list[dict[str, Any]]:
    """Positions with market value and, where known, gain/loss."""
    stmt = (
        select(Holding, Security, Account.name)
        .join(Security, Security.id == Holding.security_id)
        .join(Account, Account.id == Holding.account_id)
        .where(Holding.user_id == user_id, Account.deleted_at.is_(None))
        .order_by(Holding.institution_value.desc())
    )
    if account_id is not None:
        stmt = stmt.where(Holding.account_id == account_id)

    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": str(h.id),
            "account_id": str(h.account_id),
            "account_name": account_name,
            "security_id": str(s.id),
            "ticker": s.ticker,
            "name": s.name,
            "asset_class": asset_class(s),
            "quantity": str(h.quantity),
            "price": h.institution_price,
            "value": h.institution_value,
            "cost_basis": h.effective_cost_basis,
            "cost_basis_is_override": h.cost_basis_override is not None,
            "plaid_cost_basis": h.cost_basis,
            "gain": (
                (h.institution_value - h.effective_cost_basis)
                if h.effective_cost_basis is not None
                else None
            ),
            "gain_percent": (
                round(
                    (h.institution_value - h.effective_cost_basis) / h.effective_cost_basis * 100, 2
                )
                if h.effective_cost_basis
                else None
            ),
            "currency": h.currency,
        }
        for h, s, account_name in rows
    ]


async def set_cost_basis_override(
    db: AsyncSession,
    user_id: str,
    holding_id: UUID,
    cost_basis: int | None,
) -> dict[str, Any]:
    """Set or clear a hand-entered cost basis for one holding.

    Written to its own column rather than over Plaid's, so a sync cannot undo
    it and the original stays visible for comparison. Passing None clears the
    correction and falls back to whatever the institution reports.
    """
    holding = await db.scalar(
        select(Holding).where(Holding.id == holding_id, Holding.user_id == user_id)
    )
    if holding is None:
        raise NotFoundError("Holding not found.")

    holding.cost_basis_override = cost_basis
    await db.commit()

    rows = await list_holdings(db, user_id, account_id=holding.account_id)
    for row in rows:
        if row["id"] == str(holding_id):
            return row
    raise NotFoundError("Holding not found.")


async def summary(db: AsyncSession, user_id: str) -> dict[str, Any]:
    """Total value, cost basis, and gain across all investment accounts."""
    rows = (
        await db.execute(
            select(
                Holding.institution_value,
                # A hand-entered basis wins over Plaid's, which is only as good
                # as the institution behind it and is sometimes simply wrong.
                func.coalesce(Holding.cost_basis_override, Holding.cost_basis).label("cost_basis"),
            )
            .join(Account, Account.id == Holding.account_id)
            .where(Holding.user_id == user_id, Account.deleted_at.is_(None))
        )
    ).all()

    total_value = sum(int(r.institution_value) for r in rows)

    # Only positions with a known basis contribute to gain; the rest would
    # otherwise look like pure profit.
    with_basis = [r for r in rows if r.cost_basis is not None]
    total_cost = sum(int(r.cost_basis) for r in with_basis)
    valued_with_basis = sum(int(r.institution_value) for r in with_basis)
    gain = valued_with_basis - total_cost

    # Day change comes from the most recent prior snapshot.
    today = date.today()
    previous = await db.scalar(
        select(func.sum(HoldingSnapshot.total_value))
        .join(Account, Account.id == HoldingSnapshot.account_id)
        .where(
            HoldingSnapshot.user_id == user_id,
            HoldingSnapshot.date < today,
            # See performance() below: snapshots outlive the accounts that
            # produced them, so a disconnected institution keeps contributing
            # to any sum that does not exclude it.
            Account.deleted_at.is_(None),
        )
        .group_by(HoldingSnapshot.date)
        .order_by(HoldingSnapshot.date.desc())
        .limit(1)
    )

    return {
        "total_value": total_value,
        "invested_value": valued_with_basis,
        "total_cost_basis": total_cost,
        "total_gain": gain,
        "total_gain_percent": round(gain / total_cost * 100, 2) if total_cost else None,
        "positions_without_cost_basis": len(rows) - len(with_basis),
        "day_change": (total_value - int(previous)) if previous is not None else None,
        "holdings_count": len(rows),
        "currency": "USD",
    }


async def allocation(
    db: AsyncSession, user_id: str, *, group_by: str = "asset_class"
) -> list[dict[str, Any]]:
    """Portfolio split by asset class, account, or individual security."""
    rows = (
        await db.execute(
            select(Holding, Security, Account.name)
            .join(Security, Security.id == Holding.security_id)
            .join(Account, Account.id == Holding.account_id)
            .where(Holding.user_id == user_id, Account.deleted_at.is_(None))
        )
    ).all()

    buckets: dict[str, int] = {}
    for holding, security, account_name in rows:
        if group_by == "account":
            key = account_name
        elif group_by == "security":
            key = security.ticker or security.name
        else:
            key = asset_class(security)
        buckets[key] = buckets.get(key, 0) + int(holding.institution_value)

    total = sum(buckets.values())
    ordered = sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)

    return [
        {
            "name": name,
            "value": value,
            "percent": round(value / total * 100, 2) if total else 0,
            "color": ASSET_CLASS_COLORS[i % len(ASSET_CLASS_COLORS)],
        }
        for i, (name, value) in enumerate(ordered)
    ]


async def performance(db: AsyncSession, user_id: str, *, days: int = 180) -> list[dict[str, Any]]:
    """Portfolio value over time, summed across live accounts per day.

    Live is the operative word. A snapshot is a historical row and outlives the
    account that produced it, so re-linking an institution — which is how the
    history window gets widened — leaves the old account's snapshots sitting
    alongside the new one's. Summing both counts the same holdings twice for
    every day the two overlapped, which drew a spike to double the real value
    and then a cliff on the day the old item was disconnected.

    The writer already excludes dead accounts, so nothing new is wrong; this is
    the read side catching up with it. Every other query in this file joins
    Account for exactly this reason, and these two did not.

    Filtering rather than deleting the rows: they are an accurate record of an
    account that existed, and the chart's job is to show the accounts that
    still do. One consequence worth knowing — history from before a re-link
    belongs to the old account and drops out of the chart with it.
    """
    since = date.today() - timedelta(days=days)

    rows = (
        await db.execute(
            select(
                HoldingSnapshot.date,
                func.sum(HoldingSnapshot.total_value).label("value"),
                func.sum(HoldingSnapshot.total_cost_basis).label("cost"),
            )
            .join(Account, Account.id == HoldingSnapshot.account_id)
            .where(
                HoldingSnapshot.user_id == user_id,
                HoldingSnapshot.date >= since,
                Account.deleted_at.is_(None),
            )
            .group_by(HoldingSnapshot.date)
            .order_by(HoldingSnapshot.date)
        )
    ).all()

    return [
        {
            "date": r.date.isoformat(),
            "value": int(r.value),
            "cost_basis": int(r.cost) if r.cost is not None else None,
        }
        for r in rows
    ]


async def list_investment_transactions(
    db: AsyncSession, user_id: str, *, limit: int = 50
) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(InvestmentTransaction, Security.ticker, Security.name)
            .join(
                Security,
                Security.id == InvestmentTransaction.security_id,
                isouter=True,
            )
            .where(InvestmentTransaction.user_id == user_id)
            .order_by(InvestmentTransaction.date.desc())
            .limit(limit)
        )
    ).all()

    return [
        {
            "id": str(t.id),
            "account_id": str(t.account_id),
            "date": t.date.isoformat(),
            "name": t.name,
            "type": t.type,
            "subtype": t.subtype,
            "ticker": ticker,
            "security_name": security_name,
            "quantity": str(t.quantity) if t.quantity is not None else None,
            "price": t.price,
            "fees": t.fees,
            "amount": t.amount,
            "currency": t.currency,
        }
        for t, ticker, security_name in rows
    ]


async def snapshot_holdings(db: AsyncSession, on: date | None = None) -> int:
    """Write today's per-account portfolio value. Idempotent."""
    from sqlalchemy.dialects.postgresql import insert

    on = on or date.today()

    rows = (
        await db.execute(
            select(
                Holding.user_id,
                Holding.account_id,
                func.sum(Holding.institution_value).label("value"),
                func.sum(Holding.cost_basis).label("cost"),
            )
            .join(Account, Account.id == Holding.account_id)
            .where(Account.deleted_at.is_(None))
            .group_by(Holding.user_id, Holding.account_id)
        )
    ).all()

    for row in rows:
        await db.execute(
            insert(HoldingSnapshot)
            .values(
                user_id=row.user_id,
                account_id=row.account_id,
                date=on,
                total_value=int(row.value or 0),
                total_cost_basis=int(row.cost) if row.cost is not None else None,
            )
            .on_conflict_do_update(
                constraint="uq_holding_snapshot_account_date",
                set_={
                    "total_value": int(row.value or 0),
                    "total_cost_basis": int(row.cost) if row.cost is not None else None,
                },
            )
        )

    await db.commit()
    return len(rows)


def quantity_to_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None
