"""Transaction splits.

A split is not a mutation of the parent — it creates child rows. The parent is
flagged `is_split` and excluded from every aggregation; the children carry the
real amounts and must sum to the parent exactly.

That invariant is what prevents the classic "my totals are double-counted" bug,
so it is enforced here on every write rather than trusted from the client.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.transaction import Transaction
from app.services.transaction_service import get_transaction


@dataclass(slots=True)
class SplitPart:
    amount: int
    category_id: UUID | None = None
    notes: str | None = None


async def split_transaction(
    db: AsyncSession, user_id: str, transaction_id: UUID, parts: list[SplitPart]
) -> list[Transaction]:
    """Replace any existing split on a transaction with `parts`."""
    parent = await get_transaction(db, user_id, transaction_id)

    if parent.parent_transaction_id is not None:
        raise ValidationError("A split child cannot itself be split.")
    if len(parts) < 2:
        raise ValidationError("A split needs at least two parts.")

    total = sum(p.amount for p in parts)
    if total != parent.amount:
        raise ValidationError(
            f"Split parts must sum to the transaction amount ({parent.amount}), got {total}."
        )

    if any(p.amount == 0 for p in parts):
        raise ValidationError("Split parts cannot be zero.")

    # Mixed signs would let a split fabricate income out of an expense.
    if any((p.amount > 0) != (parent.amount > 0) for p in parts):
        raise ValidationError("Split parts must have the same sign as the parent.")

    await _clear_children(db, parent)

    children: list[Transaction] = []
    for part in parts:
        child = Transaction(
            user_id=user_id,
            account_id=parent.account_id,
            amount=part.amount,
            currency=parent.currency,
            date=parent.date,
            name=parent.name,
            merchant_name=parent.merchant_name,
            merchant_id=parent.merchant_id,
            category_id=part.category_id,
            category_source="user" if part.category_id else None,
            notes=part.notes,
            parent_transaction_id=parent.id,
            is_manual=parent.is_manual,
            # Children inherit the parent's exclusions so a split cannot quietly
            # pull a transaction back into budget totals.
            exclude_from_budget=parent.exclude_from_budget,
            is_transfer=parent.is_transfer,
            transfer_group_id=parent.transfer_group_id,
        )
        db.add(child)
        children.append(child)

    parent.is_split = True

    await db.commit()
    for child in children:
        await db.refresh(child)
    return children


async def unsplit_transaction(db: AsyncSession, user_id: str, transaction_id: UUID) -> Transaction:
    """Remove the children and restore the parent to an ordinary transaction."""
    parent = await get_transaction(db, user_id, transaction_id)
    if not parent.is_split:
        raise ValidationError("That transaction is not split.")

    await _clear_children(db, parent)
    parent.is_split = False

    await db.commit()
    await db.refresh(parent)
    return parent


async def get_split_children(
    db: AsyncSession, user_id: str, transaction_id: UUID
) -> list[Transaction]:
    return list(
        (
            await db.scalars(
                select(Transaction)
                .where(
                    Transaction.parent_transaction_id == transaction_id,
                    Transaction.user_id == user_id,
                    Transaction.deleted_at.is_(None),
                )
                .order_by(Transaction.created_at)
            )
        ).all()
    )


async def _clear_children(db: AsyncSession, parent: Transaction) -> None:
    """Soft-delete existing children so history stays auditable."""
    existing = await db.scalars(
        select(Transaction).where(
            Transaction.parent_transaction_id == parent.id,
            Transaction.deleted_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    for child in existing:
        child.deleted_at = now
    await db.flush()
