"""Transfer detection and linking.

Money moving between the user's own accounts is neither income nor spending.
Left unlinked it inflates both sides of every cash-flow and budget number, so
this ships before the dashboard rather than as a later refinement
(PLAN.md section 4).

Detection pairs two transactions when they are:
  - owned by the same user, in *different* accounts
  - opposite in sign and equal in absolute amount (within a cent)
  - dated within a 4-day window of each other

Pairs are linked by a shared `transfer_group_id` and flagged `is_transfer`;
every aggregation excludes them.
"""

from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.transaction import Transaction
from app.services.transaction_service import get_transaction

#: Settlement rarely lands the same day on both sides.
MATCH_WINDOW_DAYS = 4
#: Tolerance in minor units, for rounding on cross-currency-ish edges.
AMOUNT_TOLERANCE = 1


async def link_transfer(
    db: AsyncSession, user_id: str, transaction_ids: list[UUID]
) -> list[Transaction]:
    """Manually mark two transactions as the two sides of one transfer."""
    if len(transaction_ids) != 2:
        raise ValidationError("A transfer links exactly two transactions.")

    first = await get_transaction(db, user_id, transaction_ids[0])
    second = await get_transaction(db, user_id, transaction_ids[1])

    if first.id == second.id:
        raise ValidationError("A transaction cannot transfer to itself.")
    if first.account_id == second.account_id:
        raise ValidationError("A transfer must span two different accounts.")
    if (first.amount > 0) == (second.amount > 0):
        raise ValidationError("A transfer needs one outflow and one inflow.")

    group_id = uuid4()
    for transaction in (first, second):
        transaction.is_transfer = True
        transaction.transfer_group_id = group_id

    await db.commit()
    await db.refresh(first)
    await db.refresh(second)
    return [first, second]


async def unlink_transfer(
    db: AsyncSession, user_id: str, transaction_id: UUID
) -> list[Transaction]:
    """Break a pair apart, returning both sides to ordinary transactions."""
    transaction = await get_transaction(db, user_id, transaction_id)
    if transaction.transfer_group_id is None:
        raise ValidationError("That transaction is not part of a transfer.")

    members = list(
        (
            await db.scalars(
                select(Transaction).where(
                    Transaction.user_id == user_id,
                    Transaction.transfer_group_id == transaction.transfer_group_id,
                )
            )
        ).all()
    )

    for member in members:
        member.is_transfer = False
        member.transfer_group_id = None

    await db.commit()
    return members


def find_candidate_pairs(
    transactions: list[Transaction],
) -> list[tuple[Transaction, Transaction]]:
    """Pair opposite-signed transactions that look like the same movement.

    Pure function over a candidate window so it can be unit-tested without a
    database. Each transaction is used at most once.
    """
    outflows = sorted((t for t in transactions if t.amount < 0), key=lambda t: (t.date, t.id))
    inflows = sorted((t for t in transactions if t.amount > 0), key=lambda t: (t.date, t.id))

    used: set[UUID] = set()
    pairs: list[tuple[Transaction, Transaction]] = []

    for outflow in outflows:
        if outflow.id in used or outflow.transfer_group_id is not None:
            continue
        for inflow in inflows:
            if inflow.id in used or inflow.transfer_group_id is not None:
                continue
            if inflow.account_id == outflow.account_id:
                continue
            if abs(abs(inflow.amount) - abs(outflow.amount)) > AMOUNT_TOLERANCE:
                continue
            if abs((inflow.date - outflow.date).days) > MATCH_WINDOW_DAYS:
                continue

            used.add(outflow.id)
            used.add(inflow.id)
            pairs.append((outflow, inflow))
            break

    return pairs


async def detect_transfers(db: AsyncSession, user_id: str, *, since_days: int = 30) -> int:
    """Scan a recent window and auto-link the pairs found. Returns pair count."""
    from datetime import date

    window_start = date.today() - timedelta(days=since_days)

    candidates = list(
        (
            await db.scalars(
                select(Transaction).where(
                    Transaction.user_id == user_id,
                    Transaction.deleted_at.is_(None),
                    Transaction.is_split.is_(False),
                    Transaction.transfer_group_id.is_(None),
                    Transaction.date >= window_start,
                )
            )
        ).all()
    )

    pairs = find_candidate_pairs(candidates)

    for outflow, inflow in pairs:
        group_id = uuid4()
        for transaction in (outflow, inflow):
            transaction.is_transfer = True
            transaction.transfer_group_id = group_id

    if pairs:
        await db.commit()

    return len(pairs)
