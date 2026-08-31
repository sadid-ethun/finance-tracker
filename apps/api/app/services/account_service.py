"""Account CRUD and balance rollups."""

from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.core.money import AccountType, is_liability, net_worth_contribution
from app.models.account import Account, AccountBalanceSnapshot


async def list_accounts(
    db: AsyncSession,
    user_id: str,
    *,
    account_type: str | None = None,
    include_hidden: bool = False,
) -> list[Account]:
    stmt = select(Account).where(Account.user_id == user_id, Account.deleted_at.is_(None))
    if account_type is not None:
        stmt = stmt.where(Account.type == account_type)
    if not include_hidden:
        stmt = stmt.where(Account.is_hidden.is_(False))

    stmt = stmt.order_by(Account.display_order, Account.name)
    return list((await db.scalars(stmt)).all())


async def get_account(db: AsyncSession, user_id: str, account_id: UUID) -> Account:
    account = await db.scalar(
        select(Account).where(
            Account.id == account_id,
            Account.user_id == user_id,
            Account.deleted_at.is_(None),
        )
    )
    if account is None:
        # 404 rather than 403 for another user's row: a probe learns nothing
        # about whether the id exists.
        raise NotFoundError("Account not found.")
    return account


async def create_account(
    db: AsyncSession,
    user_id: str,
    *,
    name: str,
    type: str,
    balance_current: int,
    subtype: str | None = None,
    currency: str = "USD",
    mask: str | None = None,
    balance_limit: int | None = None,
    include_in_net_worth: bool = True,
    interest_rate_bps: int | None = None,
) -> Account:
    try:
        account_type = AccountType(type)
    except ValueError as exc:
        raise ValidationError(f"Unknown account type '{type}'.") from exc

    if balance_current < 0 and account_type in {AccountType.CREDIT, AccountType.LOAN}:
        raise ValidationError("Liability balances are stored positive as the amount owed.")

    # A rate on an asset would grow it as though it were a debt. Savings
    # interest is a different calculation and is not what this is.
    if interest_rate_bps is not None and not is_liability(account_type):
        raise ValidationError("Only a loan or credit account can carry an interest rate.")

    account = Account(
        user_id=user_id,
        name=name,
        type=account_type.value,
        subtype=subtype,
        currency=currency,
        mask=mask,
        balance_current=balance_current,
        balance_limit=balance_limit,
        include_in_net_worth=include_in_net_worth,
        interest_rate_bps=interest_rate_bps,
        # Dated on creation, so the first night's accrual covers one day rather
        # than every day since the epoch.
        interest_accrued_on=date.today() if interest_rate_bps else None,
        is_manual=True,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


async def update_account(
    db: AsyncSession, user_id: str, account_id: UUID, **changes: object
) -> Account:
    account = await get_account(db, user_id, account_id)

    for field, value in changes.items():
        if value is not None:
            setattr(account, field, value)

    await db.commit()
    await db.refresh(account)
    return account


async def delete_account(db: AsyncSession, user_id: str, account_id: UUID) -> None:
    """Soft delete. Transactions are retained so history stays auditable."""
    account = await get_account(db, user_id, account_id)
    account.deleted_at = datetime.now(UTC)
    await db.commit()


async def get_balance_history(
    db: AsyncSession, user_id: str, account_id: UUID, *, days: int = 90
) -> list[AccountBalanceSnapshot]:
    """Daily balances. Empty until the Phase 5 snapshot job runs."""
    await get_account(db, user_id, account_id)

    since = date.today() - timedelta(days=days)
    stmt = (
        select(AccountBalanceSnapshot)
        .where(
            AccountBalanceSnapshot.account_id == account_id,
            AccountBalanceSnapshot.date >= since,
        )
        .order_by(AccountBalanceSnapshot.date)
    )
    return list((await db.scalars(stmt)).all())


async def summarize_balances(db: AsyncSession, user_id: str) -> dict[str, int]:
    """Assets, liabilities, and net worth in minor units.

    Hidden accounts are included; only `include_in_net_worth = false` opts an
    account out, so hiding an account from the list does not silently change
    the headline number.
    """
    accounts = await db.scalars(
        select(Account).where(
            Account.user_id == user_id,
            Account.deleted_at.is_(None),
            Account.include_in_net_worth.is_(True),
        )
    )

    assets = 0
    liabilities = 0
    by_type: dict[str, int] = {}

    for account in accounts:
        contribution = net_worth_contribution(account.type, account.balance_current)
        if contribution >= 0:
            assets += contribution
        else:
            liabilities += -contribution
        by_type[account.type] = by_type.get(account.type, 0) + account.balance_current

    return {
        "assets": assets,
        "liabilities": liabilities,
        "net_worth": assets - liabilities,
        "cash": by_type.get(AccountType.DEPOSITORY.value, 0),
        "investments": by_type.get(AccountType.INVESTMENT.value, 0),
        "credit": by_type.get(AccountType.CREDIT.value, 0),
    }


async def accrue_interest(db: AsyncSession, on: date | None = None) -> int:
    """Grow every manual liability carrying a rate, once per day.

    A manually tracked loan gets its balance from nowhere, so without this it
    sits at whatever it was the day it was entered while the real debt grows.

    Daily compounding at APR/365. Real lenders vary — many accrue daily and
    capitalise monthly — so this is an approximation, and it is the one that
    keeps the figure moving in the right direction by roughly the right amount
    rather than pretending to model a specific loan agreement.

    Catches up rather than skipping. If the worker was down for three nights,
    interest_accrued_on is three days behind and three days are compounded now.
    A job that only ever applied "today" would silently lose them.

    Manual accounts only. A synced loan takes its balance from the institution,
    which already includes the interest; accruing on top would count it twice.

    No transaction is written. The balance moves with nothing in the ledger to
    explain it, which is the same shape as a market move on an investment — and
    the same known gap in the transaction-walking backfill.
    """
    on = on or date.today()

    accounts = list(
        (
            await db.scalars(
                select(Account).where(
                    Account.deleted_at.is_(None),
                    Account.is_manual.is_(True),
                    Account.interest_rate_bps.is_not(None),
                    Account.interest_rate_bps > 0,
                )
            )
        ).all()
    )

    changed = 0
    for account in accounts:
        if not is_liability(account.type):
            continue

        # Narrowed here rather than relied on from the query. The WHERE clause
        # above already excludes null and zero, but that is a fact about the
        # rows, not about the type — mypy sees `int | None` and is right to.
        # A real guard is also the honest one: a rate cleared between the query
        # and this loop would otherwise divide by nothing.
        bps = account.interest_rate_bps
        if not bps:
            continue

        since = account.interest_accrued_on
        # No start date means it predates the column; begin from today rather
        # than compounding an unknown stretch of history in one night.
        if since is None:
            account.interest_accrued_on = on
            continue

        days = (on - since).days
        if days <= 0:
            continue

        # Decimal throughout: this compounds, so a float's error would too.
        rate = Decimal(bps) / Decimal(10_000)
        factor = (Decimal(1) + rate / Decimal(365)) ** days
        grown = (Decimal(account.balance_current) * factor).to_integral_value(
            rounding=ROUND_HALF_UP
        )

        account.balance_current = int(grown)
        account.interest_accrued_on = on
        changed += 1

    await db.commit()
    return changed
