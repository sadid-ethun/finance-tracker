from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.deps import CurrentUser, DbSession
from app.services import cashflow_service

router = APIRouter(prefix="/cash-flow", tags=["cash-flow"])


class CategoryTotal(BaseModel):
    category_id: str | None
    name: str
    color: str | None
    amount: int
    transaction_count: int


class TrendPoint(BaseModel):
    month: date
    income: int
    spending: int
    net: int
    spending_avg_3m: int
    income_avg_3m: int


@router.get("/summary", response_model=dict[str, Any])
async def summary(
    user: CurrentUser,
    db: DbSession,
    months: Annotated[int, Query(ge=2, le=24)] = 12,
) -> dict[str, Any]:
    """Trailing totals, averages, and the best and worst months."""
    return await cashflow_service.summary(db, user.id, months=months)


@router.get("/by-category", response_model=list[CategoryTotal])
async def by_category(
    user: CurrentUser,
    db: DbSession,
    kind: Annotated[Literal["income", "expense"], Query()] = "expense",
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
) -> list[CategoryTotal]:
    rows = await cashflow_service.by_category(
        db, user.id, date_from=date_from, date_to=date_to, kind=kind, limit=limit
    )
    return [CategoryTotal(**r) for r in rows]


@router.get("/trends", response_model=list[TrendPoint])
async def trends(
    user: CurrentUser,
    db: DbSession,
    months: Annotated[int, Query(ge=3, le=24)] = 12,
) -> list[TrendPoint]:
    """Monthly series with a 3-month rolling average to smooth spiky months."""
    rows = await cashflow_service.trends(db, user.id, months=months)
    return [TrendPoint(**r) for r in rows]
