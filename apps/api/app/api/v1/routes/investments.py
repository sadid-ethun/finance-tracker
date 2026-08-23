from datetime import date
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.deps import CurrentUser, DbSession
from app.services import investment_service
from app.services.plaid import investments as plaid_investments

router = APIRouter(prefix="/investments", tags=["investments"])


class InvestmentSummary(BaseModel):
    total_value: int
    #: Value of just the positions that have a cost basis. total_value cannot
    #: be reconciled against total_cost_basis on its own — it also contains
    #: cash and margin balances, which have no basis — so this is the figure
    #: total_gain is actually the difference from.
    invested_value: int
    total_cost_basis: int
    total_gain: int
    total_gain_percent: float | None
    #: Positions Plaid gave no cost basis for; excluded from the gain figures.
    positions_without_cost_basis: int
    day_change: int | None
    holdings_count: int
    currency: str


class CostBasisUpdate(BaseModel):
    """A hand-entered cost basis, or null to fall back to Plaid's."""

    cost_basis: int | None = Field(
        default=None,
        ge=0,
        description="Total cost of the position in minor units, not per share.",
    )


class HoldingResponse(BaseModel):
    id: str
    account_id: str
    account_name: str
    security_id: str
    ticker: str | None
    name: str
    asset_class: str
    #: Decimal serialized as a string — fractional shares must not go through
    #: a float on the way to the client.
    quantity: str
    price: int | None
    value: int
    #: The basis in use — your override when set, otherwise Plaid's.
    cost_basis: int | None
    cost_basis_is_override: bool
    #: What Plaid reports, kept visible so a correction can be compared against
    #: the value it replaced rather than hiding it.
    plaid_cost_basis: int | None
    gain: int | None
    gain_percent: float | None
    currency: str


class AllocationSlice(BaseModel):
    name: str
    value: int
    percent: float
    color: str


class PerformancePoint(BaseModel):
    date: date
    value: int
    cost_basis: int | None


class InvestmentTransactionResponse(BaseModel):
    id: str
    account_id: str
    date: date
    name: str
    type: str | None
    subtype: str | None
    ticker: str | None
    security_name: str | None
    quantity: str | None
    price: int | None
    fees: int | None
    amount: int
    currency: str


@router.get("/summary", response_model=InvestmentSummary)
async def summary(user: CurrentUser, db: DbSession) -> InvestmentSummary:
    return InvestmentSummary(**await investment_service.summary(db, user.id))


@router.get("/holdings", response_model=list[HoldingResponse])
async def holdings(
    user: CurrentUser,
    db: DbSession,
    account_id: Annotated[UUID | None, Query()] = None,
) -> list[HoldingResponse]:
    rows = await investment_service.list_holdings(db, user.id, account_id=account_id)
    return [HoldingResponse(**r) for r in rows]


@router.patch("/holdings/{holding_id}/cost-basis", response_model=HoldingResponse)
async def set_cost_basis(
    holding_id: UUID,
    payload: CostBasisUpdate,
    user: CurrentUser,
    db: DbSession,
) -> HoldingResponse:
    """Correct a cost basis Plaid got wrong, or clear the correction with null.

    Stored separately from Plaid's value so the next sync cannot overwrite it.
    """
    row = await investment_service.set_cost_basis_override(
        db, user.id, holding_id, payload.cost_basis
    )
    return HoldingResponse(**row)


@router.get("/allocation", response_model=list[AllocationSlice])
async def allocation(
    user: CurrentUser,
    db: DbSession,
    group_by: Annotated[Literal["asset_class", "account", "security"], Query()] = "asset_class",
) -> list[AllocationSlice]:
    rows = await investment_service.allocation(db, user.id, group_by=group_by)
    return [AllocationSlice(**r) for r in rows]


@router.get("/performance", response_model=list[PerformancePoint])
async def performance(
    user: CurrentUser,
    db: DbSession,
    days: Annotated[int, Query(ge=7, le=1825)] = 180,
) -> list[PerformancePoint]:
    rows = await investment_service.performance(db, user.id, days=days)
    return [PerformancePoint(**r) for r in rows]


@router.get("/transactions", response_model=list[InvestmentTransactionResponse])
async def investment_transactions(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[InvestmentTransactionResponse]:
    rows = await investment_service.list_investment_transactions(db, user.id, limit=limit)
    return [InvestmentTransactionResponse(**r) for r in rows]


@router.post("/sync", response_model=dict[str, Any])
async def sync_investments(user: CurrentUser, db: DbSession) -> dict[str, Any]:
    """Refresh holdings now, and snapshot so the chart has a point today."""
    runs = await plaid_investments.sync_all_investments(db, user.id)
    await investment_service.snapshot_holdings(db)
    return {
        "items_synced": len(runs),
        "holdings_added": sum(r.added for r in runs),
        "holdings_removed": sum(r.removed for r in runs),
    }
