"""Cash flow: income and expenses over time.

Shares `_spendable` with the dashboard, so transfers and split parents are
excluded here for the same reason: internal movement is not income, and a
split parent would double-count its children.
"""

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.transaction import Transaction
from app.services.dashboard_service import (
    _spendable,
    cash_flow,
    month_bounds,
    shift_months,
)


async def summary(db: AsyncSession, user_id: str, *, months: int = 12) -> dict[str, Any]:
    """Trailing totals plus averages, over a whole number of months."""
    series = await cash_flow(db, user_id, months=months)

    total_income = sum(int(p["income"]) for p in series)
    total_spending = sum(int(p["spending"]) for p in series)
    count = len(series) or 1

    # Only months that actually have activity are averaged; including leading
    # empty months would understate a short history.
    active = [p for p in series if p["income"] or p["spending"]] or series

    return {
        "months": months,
        "total_income": total_income,
        "total_spending": total_spending,
        "net": total_income - total_spending,
        "average_income": round(total_income / len(active)),
        "average_spending": round(total_spending / len(active)),
        "average_net": round((total_income - total_spending) / len(active)),
        "best_month": max(series, key=lambda p: int(p["net"]))["month"] if series else None,
        "worst_month": min(series, key=lambda p: int(p["net"]))["month"] if series else None,
        "series": series,
        "months_counted": count,
        "currency": "USD",
    }


async def by_category(
    db: AsyncSession,
    user_id: str,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    kind: str = "expense",
    limit: int = 12,
) -> list[dict[str, Any]]:
    """Totals grouped by category over an arbitrary window."""
    today = date.today()
    start = date_from or shift_months(today, -5)
    end = date_to or month_bounds(today)[1]

    stmt = (
        select(
            Transaction.category_id,
            Category.name,
            Category.color,
            func.sum(Transaction.amount).label("total"),
            func.count().label("txn_count"),
        )
        .join(Category, Category.id == Transaction.category_id, isouter=True)
        .where(*_spendable(user_id), Transaction.date >= start, Transaction.date <= end)
        .group_by(Transaction.category_id, Category.name, Category.color)
    )

    if kind == "income":
        stmt = stmt.where(Transaction.amount > 0).order_by(func.sum(Transaction.amount).desc())
    else:
        stmt = stmt.where(Transaction.amount < 0).order_by(func.sum(Transaction.amount))

    rows = (await db.execute(stmt.limit(limit))).all()

    return [
        {
            "category_id": str(r.category_id) if r.category_id else None,
            "name": r.name or "Uncategorized",
            "color": r.color,
            "amount": abs(int(r.total)),
            "transaction_count": int(r.txn_count),
        }
        for r in rows
    ]


async def trends(db: AsyncSession, user_id: str, *, months: int = 12) -> list[dict[str, Any]]:
    """Monthly series with a running 3-month average, to smooth spiky months."""
    series = await cash_flow(db, user_id, months=months)

    enriched: list[dict[str, Any]] = []
    for i, point in enumerate(series):
        window = series[max(0, i - 2) : i + 1]
        enriched.append(
            {
                **point,
                "spending_avg_3m": round(sum(int(p["spending"]) for p in window) / len(window)),
                "income_avg_3m": round(sum(int(p["income"]) for p in window) / len(window)),
            }
        )

    return enriched
