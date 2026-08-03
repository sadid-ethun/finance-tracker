from datetime import date

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    """All values in minor units. Liabilities and spending are positive."""

    assets: int
    liabilities: int
    net_worth: int
    cash: int
    investments: int
    credit: int

    month: date
    monthly_income: int
    monthly_spending: int
    monthly_net: int
    previous_month_income: int
    previous_month_spending: int

    #: Change since the most recent prior snapshot. Null until one exists.
    net_worth_change: int | None
    currency: str


class NetWorthPoint(BaseModel):
    date: date
    net_worth: int
    assets: int
    liabilities: int


class CategorySpend(BaseModel):
    category_id: str | None
    name: str
    color: str | None
    amount: int


class CashFlowPoint(BaseModel):
    month: date
    income: int
    spending: int
    net: int
