"""Account CRUD and balance rollups."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.core.money import AccountType, net_worth_contribution
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
) -> Account:
    try:
        account_type = AccountType(type)
    except ValueError as exc:
        raise ValidationError(f"Unknown account type '{type}'.") from exc

    if balance_current < 0 and account_type in {AccountType.CREDIT, AccountType.LOAN}:
        raise ValidationError("Liability balances are stored positive as the amount owed.")

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
