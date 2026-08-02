"""Transaction querying and manual entry.

Search, rules, splits, and transfer detection arrive in Phase 3; this module
covers listing, filtering, and hand-entered transactions.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.money import is_liability
from app.core.pagination import clamp_limit, decode_cursor, encode_cursor
from app.models.account import Account
from app.models.transaction import Transaction
from app.services.account_service import get_account


@dataclass(slots=True)
class TransactionFilters:
    account_ids: list[UUID] | None = None
    category_ids: list[UUID] | None = None
    date_from: date | None = None
    date_to: date | None = None
    min_amount: int | None = None
    max_amount: int | None = None
    uncategorized: bool = False
    include_hidden: bool = False


@dataclass(slots=True)
class Page:
    items: list[Transaction]
    next_cursor: str | None
    has_more: bool


def _base_query(user_id: str, filters: TransactionFilters) -> Select[tuple[Transaction]]:
    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.deleted_at.is_(None),
        # Split parents are containers; their children carry the real amounts.
        Transaction.is_split.is_(False),
    )

    if not filters.include_hidden:
        stmt = stmt.where(Transaction.is_hidden.is_(False))
    if filters.account_ids:
        stmt = stmt.where(Transaction.account_id.in_(filters.account_ids))
    if filters.category_ids:
        stmt = stmt.where(Transaction.category_id.in_(filters.category_ids))
    if filters.uncategorized:
        stmt = stmt.where(Transaction.category_id.is_(None))
    if filters.date_from:
        stmt = stmt.where(Transaction.date >= filters.date_from)
    if filters.date_to:
        stmt = stmt.where(Transaction.date <= filters.date_to)
    if filters.min_amount is not None:
        stmt = stmt.where(Transaction.amount >= filters.min_amount)
    if filters.max_amount is not None:
        stmt = stmt.where(Transaction.amount <= filters.max_amount)

    return stmt


async def list_transactions(
    db: AsyncSession,
    user_id: str,
    *,
    filters: TransactionFilters | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> Page:
    filters = filters or TransactionFilters()
    size = clamp_limit(limit)

    stmt = _base_query(user_id, filters)

    if cursor:
        last_date, last_id = decode_cursor(cursor)
        # Keyset predicate matching the (date DESC, id DESC) sort. Comparing the
        # tuple keeps rows that share a date from being skipped or repeated.
        stmt = stmt.where(
            or_(
                Transaction.date < last_date,
                and_(Transaction.date == last_date, Transaction.id < last_id),
            )
        )

    stmt = stmt.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(size + 1)

    rows = list((await db.scalars(stmt)).all())

    has_more = len(rows) > size
    items = rows[:size]
    next_cursor = encode_cursor(items[-1].date, items[-1].id) if has_more and items else None

    return Page(items=items, next_cursor=next_cursor, has_more=has_more)


async def get_transaction(db: AsyncSession, user_id: str, transaction_id: UUID) -> Transaction:
    transaction = await db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id,
            Transaction.deleted_at.is_(None),
        )
    )
    if transaction is None:
        raise NotFoundError("Transaction not found.")
    return transaction


async def create_transaction(
    db: AsyncSession,
    user_id: str,
    *,
    account_id: UUID,
    amount: int,
    date: date,
    name: str,
    category_id: UUID | None = None,
    merchant_name: str | None = None,
    notes: str | None = None,
    currency: str | None = None,
    exclude_from_budget: bool = False,
) -> Transaction:
    """Create a hand-entered transaction and apply it to the account balance."""
    account = await get_account(db, user_id, account_id)

    transaction = Transaction(
        user_id=user_id,
        account_id=account.id,
        amount=amount,
        currency=currency or account.currency,
        date=date,
        name=name,
        merchant_name=merchant_name,
        category_id=category_id,
        category_source="user" if category_id else None,
        notes=notes,
        exclude_from_budget=exclude_from_budget,
        is_manual=True,
    )
    db.add(transaction)

    _apply_to_balance(account, amount)

    await db.commit()
    await db.refresh(transaction)
    return transaction


async def update_transaction(
    db: AsyncSession, user_id: str, transaction_id: UUID, **changes: object
) -> Transaction:
    transaction = await get_transaction(db, user_id, transaction_id)

    # A manual edit is authoritative and must survive later Plaid syncs.
    if "category_id" in changes and changes["category_id"] is not None:
        transaction.category_source = "user"

    for field, value in changes.items():
        if value is not None:
            setattr(transaction, field, value)

    await db.commit()
    await db.refresh(transaction)
    return transaction


async def delete_transaction(db: AsyncSession, user_id: str, transaction_id: UUID) -> None:
    """Soft delete, reversing its effect on a manual account's balance."""
    transaction = await get_transaction(db, user_id, transaction_id)
    transaction.deleted_at = datetime.now(UTC)

    account = await get_account(db, user_id, transaction.account_id)
    if account.is_manual:
        _apply_to_balance(account, -transaction.amount)

    await db.commit()


def _apply_to_balance(account: Account, amount: int) -> None:
    """Fold a transaction amount into a manual account's running balance.

    Liability balances are stored positive as the amount owed, so a purchase
    (negative amount) increases the balance rather than decreasing it. Plaid
    accounts are skipped: their balances come from the institution.
    """
    if not account.is_manual:
        return

    if is_liability(account.type):
        account.balance_current -= amount
    else:
        account.balance_current += amount
