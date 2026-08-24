from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.deps import CurrentUser, DbSession
from app.schemas.dashboard import (
    CashFlowPoint,
    CategorySpend,
    DashboardSummary,
    NetWorthPoint,
)
from app.schemas.transaction import TransactionResponse
from app.services import dashboard_service, transaction_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _parse_month(value: str | None) -> date:
    """Accept YYYY-MM, defaulting to the current month."""
    if not value:
        return date.today().replace(day=1)
    year, month = value.split("-")[:2]
    return date(int(year), int(month), 1)


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    user: CurrentUser,
    db: DbSession,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
) -> DashboardSummary:
    """Every headline number in one request, to keep mobile fast."""
    data = await dashboard_service.dashboard_summary(db, user.id, _parse_month(month))
    return DashboardSummary(**data)


@router.get("/net-worth", response_model=list[NetWorthPoint])
async def net_worth(
    user: CurrentUser,
    db: DbSession,
    range: Annotated[Literal["1m", "3m", "6m", "ytd", "1y", "all"], Query()] = "6m",
) -> list[NetWorthPoint]:
    points = await dashboard_service.net_worth_series(db, user.id, range_key=range)
    return [NetWorthPoint(**p) for p in points]


@router.get("/spending-by-category", response_model=list[CategorySpend])
async def spending_by_category(
    user: CurrentUser,
    db: DbSession,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
) -> list[CategorySpend]:
    rows = await dashboard_service.spending_by_category(db, user.id, _parse_month(month))
    return [CategorySpend(**r) for r in rows]


@router.get("/cash-flow", response_model=list[CashFlowPoint])
async def cash_flow(
    user: CurrentUser,
    db: DbSession,
    months: Annotated[int, Query(ge=2, le=24)] = 6,
) -> list[CashFlowPoint]:
    rows = await dashboard_service.cash_flow(db, user.id, months=months)
    return [CashFlowPoint(**r) for r in rows]


@router.get("/recent-transactions", response_model=list[TransactionResponse])
async def recent_transactions(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> list[TransactionResponse]:
    page = await transaction_service.list_transactions(db, user.id, limit=limit)
    return [TransactionResponse.model_validate(t) for t in page.items]


@router.post("/snapshot", response_model=dict[str, int])
async def take_snapshot(user: CurrentUser, db: DbSession) -> dict[str, int]:
    """Write today's snapshot now.

    Normally the nightly job does this; exposed so a freshly connected account
    produces a chart point immediately instead of after midnight.
    """
    await dashboard_service.write_net_worth_snapshot(db, user.id)
    backfilled = await dashboard_service.backfill_net_worth(db, user.id, days=90)
    return {"backfilled": backfilled}
