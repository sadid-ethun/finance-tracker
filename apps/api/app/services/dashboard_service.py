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

from app.core.money import net_worth_contribution
from app.models.account import Account, AccountBalanceSnapshot, NetWorthSnapshot
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
    """Historical net worth, summed per day from per-account balances.

    Derived rather than read. net_worth_snapshots holds one pre-aggregated
    total per user per day, which cannot be corrected after the fact: if two
    items for the same institution were connected at once, that day's row is a
    true record of a doubled balance with no account attribution left to
    filter. Disconnecting the duplicate does not repair it, and the backfill
    skips days that already have a row, so the wrong figure is permanent.

    account_balance_snapshots holds the same history one row per account, so
    the total can be recomputed from whichever accounts are live *now*. Remove
    a duplicated institution and every day it touched corrects itself — the
    same property that makes the portfolio chart self-healing.

    Falls back to the pre-aggregated table for any date with no per-account
    rows. Those snapshots began part-way through the app's life, and a chart
    that silently truncated to where they start would look like lost history.
    """
    start = _range_start(range_key)

    account_filters = [
        Account.user_id == user_id,
        Account.deleted_at.is_(None),
        # Matches summarize_balances: hiding an account from the list must not
        # move the headline figure; only opting out does.
        Account.include_in_net_worth.is_(True),
    ]

    stmt = (
        select(
            AccountBalanceSnapshot.date,
            Account.type,
            func.sum(AccountBalanceSnapshot.balance_current).label("balance"),
        )
        .join(Account, Account.id == AccountBalanceSnapshot.account_id)
        .where(*account_filters)
        .group_by(AccountBalanceSnapshot.date, Account.type)
    )
    if start is not None:
        stmt = stmt.where(AccountBalanceSnapshot.date >= start)

    # date -> {account type: summed balance}
    by_day: dict[date, dict[str, int]] = {}
    for row in (await db.execute(stmt)).all():
        by_day.setdefault(row.date, {})[row.type] = int(row.balance)

    series: dict[date, dict[str, Any]] = {}
    for on, balances in by_day.items():
        assets = 0
        liabilities = 0
        for account_type, balance in balances.items():
            # One place converts a balance to a signed contribution, and it is
            # not here — liabilities are stored positive.
            contribution = net_worth_contribution(account_type, balance)
            if contribution >= 0:
                assets += contribution
            else:
                liabilities += -contribution

        series[on] = {
            "date": on.isoformat(),
            "net_worth": assets - liabilities,
            "assets": assets,
            "liabilities": liabilities,
        }

    # Older dates, from before per-account snapshots were being written.
    legacy = select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user_id)
    if start is not None:
        legacy = legacy.where(NetWorthSnapshot.date >= start)

    snapshots: Sequence[NetWorthSnapshot] = (await db.scalars(legacy)).all()
    for snapshot in snapshots:
        if snapshot.date in series:
            continue
        series[snapshot.date] = {
            "date": snapshot.date.isoformat(),
            "net_worth": snapshot.net_worth,
            "assets": snapshot.assets,
            "liabilities": snapshot.liabilities,
        }

    return [series[on] for on in sorted(series)]


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


#: Ceiling on reconstruction. Plaid serves at most 730 days of transactions,
#: so reaching further back can only produce a flat line across a period the
#: data cannot describe.
MAX_BACKFILL_DAYS = 730


async def backfill_net_worth(db: AsyncSession, user_id: str, *, days: int | None = None) -> int:
    """Reconstruct history by walking transactions backwards from today.

    Approximate by construction: it assumes current balances minus subsequent
    activity, so it cannot know about balance changes that produced no
    transaction — a market move on an investment leaves no row and is
    therefore invisible. Without it the net-worth chart is a single dot until
    the nightly job has run for a month.

    The window follows the data rather than a constant. Reaching back further
    than the oldest transaction writes identical points across a period
    nothing is known about, which draws a confident flat line asserting the
    net worth did not move — a claim the data cannot support. With no
    transactions at all it writes nothing, for the same reason.
    """
    today = date.today()

    if days is None:
        oldest = await db.scalar(select(func.min(Transaction.date)).where(*_spendable(user_id)))
        if oldest is None:
            return 0
        days = min((today - oldest).days + 1, MAX_BACKFILL_DAYS)
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
            # Liabilities are held at today's figure and assets derived from
            # them, so `assets - liabilities == net_worth` holds on every row.
            # Deriving assets from the running total instead broke that
            # invariant: a day at 1,700,000 net worth was written with assets
            # 1,700,000 and liabilities 455,065, which subtract to 1,244,935.
            #
            # Splitting the movement across the two properly would mean
            # walking each account separately; this at least cannot be
            # internally contradictory.
            liabilities = balances["liabilities"]
            db.add(
                NetWorthSnapshot(
                    user_id=user_id,
                    date=on,
                    assets=running + liabilities,
                    liabilities=liabilities,
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
