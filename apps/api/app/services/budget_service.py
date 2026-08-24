"""Monthly budgets.

Progress is always computed server-side from transactions rather than stored,
so a recategorization or a new import is reflected immediately and there is no
denormalized total to drift out of sync.

Budget spend uses the dashboard's `_spendable` predicate — deleted, hidden,
split parents, and transfers all excluded — **plus** `exclude_from_budget`.
That last one is intentionally not part of `_spendable`: the dashboard reports
what you actually spent, while a budget reports what you spent against a plan.
A one-off medical bill can be excluded from the budget without vanishing from
your spending history.
"""

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError, ValidationError
from app.models.budget import Budget, BudgetCategory
from app.models.category import Category
from app.models.transaction import Transaction
from app.services.category_service import ensure_categories
from app.services.dashboard_service import _spendable, month_bounds, shift_months


def _normalize(month: date) -> date:
    return month.replace(day=1)


async def _spend_by_category(db: AsyncSession, user_id: str, month: date) -> dict[UUID, int]:
    """Actual spending per category for the month, as positive minor units."""
    start, end = month_bounds(month)

    rows = (
        await db.execute(
            select(
                Transaction.category_id,
                func.sum(Transaction.amount).label("total"),
            )
            .where(
                *_spendable(user_id),
                # A budget measures spend against a plan, so opted-out rows do
                # not count toward it.
                Transaction.exclude_from_budget.is_(False),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.amount < 0,
                Transaction.category_id.is_not(None),
            )
            .group_by(Transaction.category_id)
        )
    ).all()

    return {r.category_id: abs(int(r.total)) for r in rows}


async def daily_spend(db: AsyncSession, user_id: str, month: date) -> list[dict[str, Any]]:
    """Cumulative spend for each day of a month.

    Uses the same predicate as every other budget figure — transfers, splits,
    hidden rows and opt-outs excluded — so the chart and the totals beside it
    cannot disagree.

    Every day appears, including days with no spending. A cumulative line
    drawn only from days that had transactions would step between them and
    imply spending on dates where none happened; the flat stretches are the
    information.

    The series stops at today for the current month rather than running to the
    month end. Extending it would draw a flat line across days that have not
    happened yet, which reads as "spending stopped" rather than "the month is
    not over".
    """
    month = _normalize(month)
    start, end = month_bounds(month)

    today = date.today()
    if end > today >= start:
        end = today

    rows = (
        await db.execute(
            select(
                Transaction.date,
                func.sum(Transaction.amount).label("total"),
            )
            .where(
                *_spendable(user_id),
                Transaction.exclude_from_budget.is_(False),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.amount < 0,
            )
            .group_by(Transaction.date)
        )
    ).all()

    by_day = {r.date: abs(int(r.total)) for r in rows}

    series: list[dict[str, Any]] = []
    running = 0
    day = start
    while day <= end:
        running += by_day.get(day, 0)
        series.append({"date": day, "spent": by_day.get(day, 0), "cumulative": running})
        day = date.fromordinal(day.toordinal() + 1)

    return series


async def get_budget(db: AsyncSession, user_id: str, month: date) -> Budget | None:
    """Load a month's budget with its lines eagerly.

    selectinload is required, not an optimisation: async SQLAlchemy cannot
    lazy-load a relationship on attribute access, so touching `.categories` on
    a lazily-loaded Budget raises MissingGreenlet.
    """
    budget: Budget | None = await db.scalar(
        select(Budget)
        .options(selectinload(Budget.categories))
        .where(Budget.user_id == user_id, Budget.month == _normalize(month))
    )
    return budget


def _new_budget(user_id: str, month: date) -> Budget:
    """Create a Budget with its collection initialised.

    Assigning an empty list marks the relationship as loaded, so the first
    append or clear does not attempt a lazy load of rows that cannot exist.
    """
    budget = Budget(user_id=user_id, month=month)
    budget.categories = []
    return budget


async def budget_with_progress(db: AsyncSession, user_id: str, month: date) -> dict[str, Any]:
    """A month's budget with spend, remaining, and percentage per category.

    Returns a shell with zero limits when no budget exists, so the client
    renders an empty state rather than handling a 404.
    """
    month = _normalize(month)
    await ensure_categories(db, user_id)

    budget = await get_budget(db, user_id, month)
    spend = await _spend_by_category(db, user_id, month)

    categories = {
        c.id: c
        for c in (await db.scalars(select(Category).where(Category.user_id == user_id))).all()
    }

    lines: list[dict[str, Any]] = []
    total_budgeted = 0
    total_spent = 0

    if budget is not None:
        for line in budget.categories:
            category = categories.get(line.category_id)
            if category is None:
                continue
            spent = spend.get(line.category_id, 0)
            total_budgeted += line.amount
            total_spent += spent
            lines.append(
                {
                    "category_id": str(line.category_id),
                    "name": category.name,
                    "color": category.color,
                    "budgeted": line.amount,
                    "spent": spent,
                    "remaining": line.amount - spent,
                    # Guard against a zero limit rather than dividing by it.
                    "percent": round(spent / line.amount * 100) if line.amount else 0,
                    "over": spent > line.amount,
                }
            )

    # Sort keys read from Any-valued dicts, so the int() is for the type
    # checker as much as for safety.
    lines.sort(key=lambda line: int(line["budgeted"]), reverse=True)

    budgeted_ids = {str(line["category_id"]) for line in lines}
    # Spending in categories with no limit still belongs on the page — it is the
    # most common reason a month "doesn't add up".
    unbudgeted_pairs = [
        (cid, amount)
        for cid, amount in spend.items()
        if str(cid) not in budgeted_ids and cid in categories
    ]
    unbudgeted_pairs.sort(key=lambda pair: pair[1], reverse=True)

    unbudgeted: list[dict[str, Any]] = [
        {
            "category_id": str(cid),
            "name": categories[cid].name,
            "color": categories[cid].color,
            "spent": amount,
        }
        for cid, amount in unbudgeted_pairs
    ]
    unbudgeted_spent = sum(amount for _, amount in unbudgeted_pairs)

    return {
        "month": month.isoformat(),
        "exists": budget is not None,
        "total_income_expected": budget.total_income_expected if budget else None,
        "note": budget.note if budget else None,
        "total_budgeted": total_budgeted,
        "total_spent": total_spent,
        "total_remaining": total_budgeted - total_spent,
        "categories": lines,
        "unbudgeted": unbudgeted,
        "unbudgeted_spent": unbudgeted_spent,
    }


async def upsert_budget(
    db: AsyncSession,
    user_id: str,
    month: date,
    *,
    categories: list[dict[str, Any]],
    total_income_expected: int | None = None,
    note: str | None = None,
) -> Budget:
    """Replace a month's budget wholesale."""
    month = _normalize(month)

    valid_ids = set(
        (await db.scalars(select(Category.id).where(Category.user_id == user_id))).all()
    )

    seen: set[UUID] = set()
    for entry in categories:
        category_id = UUID(str(entry["category_id"]))
        if category_id not in valid_ids:
            raise ValidationError("Unknown category in budget.")
        if category_id in seen:
            raise ValidationError("A category can only be budgeted once per month.")
        if int(entry["amount"]) < 0:
            raise ValidationError("Budget amounts cannot be negative.")
        seen.add(category_id)

    budget = await get_budget(db, user_id, month)
    if budget is None:
        budget = _new_budget(user_id, month)
        db.add(budget)
        await db.flush()

    budget.total_income_expected = total_income_expected
    budget.note = note

    # Replace rather than merge: the client sends the whole month, so a removed
    # line must actually disappear.
    budget.categories.clear()
    await db.flush()

    for entry in categories:
        budget.categories.append(
            BudgetCategory(
                category_id=UUID(str(entry["category_id"])),
                amount=int(entry["amount"]),
            )
        )

    await db.commit()
    return budget


async def set_category_amount(
    db: AsyncSession, user_id: str, month: date, category_id: UUID, amount: int
) -> Budget:
    """Set or clear a single category's limit without resending the month."""
    month = _normalize(month)

    if amount < 0:
        raise ValidationError("Budget amounts cannot be negative.")

    category = await db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if category is None:
        raise NotFoundError("Category not found.")

    budget = await get_budget(db, user_id, month)
    if budget is None:
        budget = _new_budget(user_id, month)
        db.add(budget)
        await db.flush()

    line = next((c for c in budget.categories if c.category_id == category_id), None)

    if amount == 0:
        # Zero means "stop budgeting this", not "budget nothing".
        if line is not None:
            budget.categories.remove(line)
    elif line is None:
        budget.categories.append(BudgetCategory(category_id=category_id, amount=amount))
    else:
        line.amount = amount

    await db.commit()
    return budget


async def delete_budget(db: AsyncSession, user_id: str, month: date) -> None:
    """Remove a month's budget entirely.

    Deleting is not the same as zeroing every category. A month with no budget
    reports `exists: false` and the screen offers to build one; a month with
    every line at zero is a budget of nothing, which reads as "you have
    overspent everything" against any real transaction.

    Idempotent — deleting a month that has no budget is a no-op rather than a
    404, so a double tap on a slow connection cannot fail the second time.
    """
    month = _normalize(month)

    budget = await get_budget(db, user_id, month)
    if budget is None:
        return

    await db.delete(budget)
    await db.commit()


async def copy_budget(db: AsyncSession, user_id: str, *, source: date, target: date) -> Budget:
    """Copy one month's limits onto another. Overwrites the target."""
    source, target = _normalize(source), _normalize(target)

    if source == target:
        raise ValidationError("Source and target months must differ.")

    origin = await get_budget(db, user_id, source)
    if origin is None or not origin.categories:
        raise NotFoundError(f"No budget to copy from {source.isoformat()[:7]}.")

    return await upsert_budget(
        db,
        user_id,
        target,
        categories=[
            {"category_id": str(c.category_id), "amount": c.amount} for c in origin.categories
        ],
        total_income_expected=origin.total_income_expected,
        note=origin.note,
    )


async def suggest_from_history(
    db: AsyncSession, user_id: str, month: date, *, lookback: int = 3
) -> list[dict[str, Any]]:
    """Average spend per category over recent months, as a starting point.

    Turns "set your first budget" from a blank form into something you edit,
    which is the difference between a feature people use and one they skip.
    """
    month = _normalize(month)
    start = shift_months(month, -lookback)
    end = month_bounds(shift_months(month, -1))[1]

    rows = (
        await db.execute(
            select(
                Transaction.category_id,
                Category.name,
                Category.color,
                func.sum(Transaction.amount).label("total"),
            )
            .join(Category, Category.id == Transaction.category_id)
            .where(
                *_spendable(user_id),
                Transaction.exclude_from_budget.is_(False),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.amount < 0,
            )
            .group_by(Transaction.category_id, Category.name, Category.color)
            .order_by(func.sum(Transaction.amount))
        )
    ).all()

    return [
        {
            "category_id": str(r.category_id),
            "name": r.name,
            "color": r.color,
            # Round to the nearest dollar: a suggestion of $247.31 implies a
            # precision the average does not have.
            "suggested": round(abs(int(r.total)) / lookback / 100) * 100,
        }
        for r in rows
    ]
