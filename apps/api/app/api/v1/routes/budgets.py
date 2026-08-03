from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query

from app.core.errors import ValidationError
from app.deps import CurrentUser, DbSession
from app.schemas.budget import (
    BudgetProgress,
    BudgetSuggestion,
    BudgetUpsertRequest,
    CategoryAmountRequest,
)
from app.services import budget_service

router = APIRouter(prefix="/budgets", tags=["budgets"])

MONTH_PATTERN = r"^\d{4}-\d{2}$"


def _parse_month(value: str) -> date:
    try:
        year, month = value.split("-")
        return date(int(year), int(month), 1)
    except (ValueError, IndexError) as exc:
        raise ValidationError("Month must be formatted YYYY-MM.") from exc


@router.get("/{month}", response_model=BudgetProgress)
async def get_budget(
    month: Annotated[str, Path(pattern=MONTH_PATTERN)],
    user: CurrentUser,
    db: DbSession,
) -> BudgetProgress:
    """A month's budget with progress computed from live transactions.

    Returns an empty shell rather than 404 when no budget exists, so the client
    renders its empty state without special-casing an error.
    """
    data = await budget_service.budget_with_progress(db, user.id, _parse_month(month))
    return BudgetProgress(**data)


@router.put("/{month}", response_model=BudgetProgress)
async def upsert_budget(
    month: Annotated[str, Path(pattern=MONTH_PATTERN)],
    payload: BudgetUpsertRequest,
    user: CurrentUser,
    db: DbSession,
) -> BudgetProgress:
    """Replace the whole month. Omitted categories are removed."""
    parsed = _parse_month(month)
    await budget_service.upsert_budget(
        db,
        user.id,
        parsed,
        categories=[c.model_dump() for c in payload.categories],
        total_income_expected=payload.total_income_expected,
        note=payload.note,
    )
    data = await budget_service.budget_with_progress(db, user.id, parsed)
    return BudgetProgress(**data)


@router.patch("/{month}/categories/{category_id}", response_model=BudgetProgress)
async def set_category_amount(
    month: Annotated[str, Path(pattern=MONTH_PATTERN)],
    category_id: UUID,
    payload: CategoryAmountRequest,
    user: CurrentUser,
    db: DbSession,
) -> BudgetProgress:
    """Set one category's limit. Zero removes it from the budget."""
    parsed = _parse_month(month)
    await budget_service.set_category_amount(db, user.id, parsed, category_id, payload.amount)
    data = await budget_service.budget_with_progress(db, user.id, parsed)
    return BudgetProgress(**data)


@router.post("/{month}/copy-from", response_model=BudgetProgress)
async def copy_budget(
    month: Annotated[str, Path(pattern=MONTH_PATTERN)],
    user: CurrentUser,
    db: DbSession,
    source: Annotated[str, Query(pattern=MONTH_PATTERN)],
) -> BudgetProgress:
    """Copy another month's limits onto this one."""
    target = _parse_month(month)
    await budget_service.copy_budget(db, user.id, source=_parse_month(source), target=target)
    data = await budget_service.budget_with_progress(db, user.id, target)
    return BudgetProgress(**data)


@router.get("/{month}/suggestions", response_model=list[BudgetSuggestion])
async def suggestions(
    month: Annotated[str, Path(pattern=MONTH_PATTERN)],
    user: CurrentUser,
    db: DbSession,
    lookback: Annotated[int, Query(ge=1, le=12)] = 3,
) -> list[BudgetSuggestion]:
    """Average recent spend per category, to seed a first budget."""
    rows = await budget_service.suggest_from_history(
        db, user.id, _parse_month(month), lookback=lookback
    )
    return [BudgetSuggestion(**r) for r in rows]
