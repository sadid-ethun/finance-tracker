from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class BudgetLineRequest(BaseModel):
    category_id: UUID
    #: Positive minor units. Zero removes the line.
    amount: int = Field(ge=0)


class BudgetUpsertRequest(BaseModel):
    categories: list[BudgetLineRequest] = Field(default_factory=list, max_length=100)
    total_income_expected: int | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=500)


class CategoryAmountRequest(BaseModel):
    amount: int = Field(ge=0)


class BudgetLineProgress(BaseModel):
    category_id: str
    name: str
    color: str | None
    budgeted: int
    spent: int
    remaining: int
    percent: int
    over: bool


class UnbudgetedSpend(BaseModel):
    category_id: str
    name: str
    color: str | None
    spent: int


class BudgetProgress(BaseModel):
    """All amounts are positive minor units; `total_remaining` may be negative."""

    month: date
    exists: bool
    total_income_expected: int | None
    note: str | None
    total_budgeted: int
    total_spent: int
    total_remaining: int
    categories: list[BudgetLineProgress]
    unbudgeted: list[UnbudgetedSpend]
    unbudgeted_spent: int


class BudgetSuggestion(BaseModel):
    category_id: str
    name: str
    color: str | None
    suggested: int
