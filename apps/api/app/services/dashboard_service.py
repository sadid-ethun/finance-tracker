"""Dashboard aggregations.

Every query here shares one predicate, and getting it wrong is how a finance
app quietly lies to you:

  - **deleted rows** are excluded (soft delete)
  - **hidden rows** are excluded
  - **split parents** are excluded — their children carry the real amounts, so
    counting both double-counts the transaction
  - **transfers** are excluded from income and spending — moving money between
    your own accounts is neither, and counting it inflates both sides

`_spendable()` is that predicate, applied everywhere, so the rule lives in one
place rather than being re-derived per query.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import NetWorthSnapshot
from app.models.category import Category
from app.models.transaction import Transaction
from app.services.account_service import summarize_balances

#: Chart ranges the UI offers, in days. None means "everything".
#:
#: "ytd" is absent because it is not a fixed number of days — it is the
#: distance to January 1st, which changes daily. Resolved in
#: `_range_start` instead.
RANGE_DAYS: dict[str, int | None] = {
    "1m": 30,
    "3m": 90,
    "6m": 182,
    "1y": 365,
    "all": None,
}


def _range_start(range_key: str) -> date | None:
    """The earliest date a range covers, or None for everything."""
    if range_key == "ytd":
        return date(date.today().year, 1, 1)

    days = RANGE_DAYS.get(range_key, 182)
    return None if days is None else date.today() - timedelta(days=days)


def _transfer_category_ids(user_id: str) -> Select[tuple[Any]]:
    """Categories whose kind is 'transfer' (Transfer, Credit Card Payment...)."""
    return select(Category.id).where(Category.user_id == user_id, Category.kind == "transfer")


def _spendable(user_id: str) -> list[ColumnElement[bool]]:
    """The shared predicate for every money aggregation."""
    return [
        Transaction.user_id == user_id,
        Transaction.deleted_at.is_(None),
        Transaction.is_hidden.is_(False),
        # Split parents are containers; children hold the amounts.
        Transaction.is_split.is_(False),
        # Detected or manually linked internal movement.
        Transaction.is_transfer.is_(False),
        # Also exclude anything categorized as a transfer even when detection
        # never paired it. A credit-card payment is the clearest case: counting
        # it as spending double-counts the purchases it settles. The NULL arm is
        # required because `NOT IN` yields NULL for uncategorized rows, which
        # would silently drop them.
        or_(
            Transaction.category_id.is_(None),
            Transaction.category_id.not_in(_transfer_category_ids(user_id)),
        ),
    ]


def shift_months(anchor: date, delta: int) -> date:
    """Move `delta` calendar months from `anchor`, returning the 1st.

    Day-based arithmetic cannot do this: subtracting 31*n days overshoots on
    short months, which silently yields one more bucket than asked for.
    """
    total = anchor.year * 12 + (anchor.month - 1) + delta
    return date(total // 12, total % 12 + 1, 1)


def month_bounds(month: date) -> tuple[date, date]:
    """First and last day of the month containing `month`."""
    start = month.replace(day=1)
    next_month = (start + timedelta(days=32)).replace(day=1)
    return start, next_month - timedelta(days=1)


@dataclass(slots=True)
class MonthTotals:
    income: int
    spending: int

    @property
    def net(self) -> int:
        return self.income - self.spending


async def month_totals(db: AsyncSession, user_id: str, month: date) -> MonthTotals:
    """Income and spending for one month, both returned positive."""
    start, end = month_bounds(month)

    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0).label(
                    "income"
                ),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0).label(
                    "spending"
                ),
            ).where(*_spendable(user_id), Transaction.date >= start, Transaction.date <= end)
        )
    ).one()

    # Spending is stored negative; report it as a positive magnitude.
    return MonthTotals(income=int(row.income), spending=abs(int(row.spending)))


async def spending_by_category(
    db: AsyncSession, user_id: str, month: date, *, limit: int = 8
) -> list[dict[str, Any]]:
    """Spending grouped by category for one month, largest first."""
    start, end = month_bounds(month)

    rows = (
        await db.execute(
            select(
                Transaction.category_id,
                Category.name,
                Category.color,
                func.sum(Transaction.amount).label("total"),
            )
            .join(Category, Category.id == Transaction.category_id, isouter=True)
            .where(
                *_spendable(user_id),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.amount < 0,
            )
            .group_by(Transaction.category_id, Category.name, Category.color)
            .order_by(func.sum(Transaction.amount))
        )
    ).all()

    results = [
        {
            "category_id": str(r.category_id) if r.category_id else None,
            "name": r.name or "Uncategorized",
            "color": r.color,
            "amount": abs(int(r.total)),
        }
        for r in rows
    ]

    if len(results) <= limit:
        return results

    # Collapse the tail so the donut stays readable.
    head, tail = results[:limit], results[limit:]
    head.append(
        {
            "category_id": None,
            "name": "Other",
            "color": "#6b7280",
            "amount": sum(int(r["amount"]) for r in tail),
        }
    )
    return head


async def cash_flow(db: AsyncSession, user_id: str, *, months: int = 6) -> list[dict[str, Any]]:
    """Income and spending per month for the trailing window."""
    today = date.today()
    start = shift_months(today, -(months - 1))

    month_col = func.date_trunc("month", Transaction.date).label("month")
    rows = (
        await db.execute(
            select(
                month_col,
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0).label(
                    "income"
                ),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0).label(
                    "spending"
                ),
            )
            .where(*_spendable(user_id), Transaction.date >= start)
            .group_by(month_col)
            .order_by(month_col)
        )
    ).all()

    by_month = {r.month.date().replace(day=1): (int(r.income), abs(int(r.spending))) for r in rows}

    # Emit every month in the window, including empty ones, so the chart has no
    # gaps and the x-axis stays evenly spaced.
    series: list[dict[str, Any]] = []
    cursor = start
    while cursor <= today.replace(day=1):
        income, spending = by_month.get(cursor, (0, 0))
        series.append(
            {
                "month": cursor.isoformat(),
                "income": income,
                "spending": spending,
                "net": income - spending,
            }
        )
        cursor = shift_months(cursor, 1)

    return series


async def net_worth_series(
    db: AsyncSession, user_id: str, *, range_key: str = "6m"
) -> list[dict[str, Any]]:
    """Historical net worth from daily snapshots."""
    stmt = select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user_id)

    start = _range_start(range_key)
    if start is not None:
        stmt = stmt.where(NetWorthSnapshot.date >= start)

    snapshots: Sequence[NetWorthSnapshot] = (
        await db.scalars(stmt.order_by(NetWorthSnapshot.date))
    ).all()

    return [
        {
            "date": s.date.isoformat(),
            "net_worth": s.net_worth,
            "assets": s.assets,
            "liabilities": s.liabilities,
        }
        for s in snapshots
    ]


async def dashboard_summary(
    db: AsyncSession, user_id: str, month: date | None = None
) -> dict[str, Any]:
    """Everything the dashboard header needs, in one round trip.

    Purpose-built rather than composed from generic endpoints client-side:
    mobile-first means minimising round trips (PLAN.md section 7).
    """
    month = month or date.today()
    balances = await summarize_balances(db, user_id)
    totals = await month_totals(db, user_id, month)

    previous_month = (month.replace(day=1) - timedelta(days=1)).replace(day=1)
    previous = await month_totals(db, user_id, previous_month)

    # Yesterday's snapshot, for the change indicator under the headline figure.
    prior = await db.scalar(
        select(NetWorthSnapshot)
        .where(
            NetWorthSnapshot.user_id == user_id,
            NetWorthSnapshot.date < date.today(),
        )
        .order_by(NetWorthSnapshot.date.desc())
        .limit(1)
    )

    return {
        **balances,
        "month": month.replace(day=1).isoformat(),
        "monthly_income": totals.income,
        "monthly_spending": totals.spending,
        "monthly_net": totals.net,
        "previous_month_income": previous.income,
        "previous_month_spending": previous.spending,
        "net_worth_change": (balances["net_worth"] - prior.net_worth if prior else None),
        "currency": "USD",
    }


async def write_net_worth_snapshot(
    db: AsyncSession, user_id: str, on: date | None = None
) -> NetWorthSnapshot:
    """Record today's net worth. Idempotent — re-running updates in place."""
    on = on or date.today()
    balances = await summarize_balances(db, user_id)

    snapshot = await db.scalar(
        select(NetWorthSnapshot).where(
            NetWorthSnapshot.user_id == user_id, NetWorthSnapshot.date == on
        )
    )

    if snapshot is None:
        snapshot = NetWorthSnapshot(user_id=user_id, date=on, **_snapshot_fields(balances))
        db.add(snapshot)
    else:
        for field, value in _snapshot_fields(balances).items():
            setattr(snapshot, field, value)

    await db.commit()
    await db.refresh(snapshot)
    return snapshot


def _snapshot_fields(balances: dict[str, int]) -> dict[str, int]:
    return {
        "assets": balances["assets"],
        "liabilities": balances["liabilities"],
        "net_worth": balances["net_worth"],
        "cash": balances["cash"],
        "investments": balances["investments"],
        "credit": balances["credit"],
    }


async def backfill_net_worth(db: AsyncSession, user_id: str, *, days: int = 90) -> int:
    """Reconstruct history by walking transactions backwards from today.

    Approximate by construction: it assumes current balances minus subsequent
    activity, so it cannot know about balance changes that produced no
    transaction. The UI labels reconstructed points accordingly. Without it the
    net-worth chart is a single dot until the nightly job has run for a month.
    """
    today = date.today()
    balances = await summarize_balances(db, user_id)
    running = balances["net_worth"]

    # Net movement per day, most recent first.
    rows = (
        await db.execute(
            select(Transaction.date, func.sum(Transaction.amount).label("delta"))
            .where(*_spendable(user_id), Transaction.date > today - timedelta(days=days))
            .group_by(Transaction.date)
            .order_by(Transaction.date.desc())
        )
    ).all()
    deltas = {r.date: int(r.delta) for r in rows}

    written = 0
    for offset in range(days):
        on = today - timedelta(days=offset)

        exists = await db.scalar(
            select(NetWorthSnapshot.id).where(
                NetWorthSnapshot.user_id == user_id, NetWorthSnapshot.date == on
            )
        )
        if exists is None:
            db.add(
                NetWorthSnapshot(
                    user_id=user_id,
                    date=on,
                    assets=max(running, 0),
                    liabilities=max(-running, 0) if running < 0 else balances["liabilities"],
                    net_worth=running,
                    cash=balances["cash"],
                    investments=balances["investments"],
                    credit=balances["credit"],
                )
            )
            written += 1

        # Step back a day: undo that day's net movement.
        running -= deltas.get(on, 0)

    await db.commit()
    return written


async def snapshot_all_users(db: AsyncSession) -> int:
    """Write today's snapshot for every user. Called by the nightly job."""
    from app.models.user import User

    user_ids = list((await db.scalars(select(User.id))).all())
    for user_id in user_ids:
        await write_net_worth_snapshot(db, user_id)
    return len(user_ids)


async def snapshot_account_balances(db: AsyncSession, on: date | None = None) -> int:
    """Write today's per-account balance rows. Idempotent per (account, date)."""
    from sqlalchemy.dialects.postgresql import insert

    from app.models.account import Account, AccountBalanceSnapshot

    on = on or date.today()
    accounts = list((await db.scalars(select(Account).where(Account.deleted_at.is_(None)))).all())

    for account in accounts:
        stmt = (
            insert(AccountBalanceSnapshot)
            .values(
                account_id=account.id,
                date=on,
                balance_current=account.balance_current,
                balance_available=account.balance_available,
            )
            .on_conflict_do_update(
                constraint="uq_balance_snapshot_account_date",
                set_={
                    "balance_current": account.balance_current,
                    "balance_available": account.balance_available,
                },
            )
        )
        await db.execute(stmt)

    await db.commit()
    return len(accounts)
