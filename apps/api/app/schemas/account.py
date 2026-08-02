from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AccountTypeLiteral = Literal["depository", "credit", "loan", "investment", "other"]


class AccountBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: AccountTypeLiteral
    subtype: str | None = Field(default=None, max_length=40)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    mask: str | None = Field(default=None, max_length=8)


class AccountCreate(AccountBase):
    balance_current: int = Field(
        description="Minor units. Liabilities are positive: the amount owed."
    )
    balance_limit: int | None = None
    include_in_net_worth: bool = True


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    balance_current: int | None = None
    balance_limit: int | None = None
    is_hidden: bool | None = None
    include_in_net_worth: bool | None = None
    display_order: int | None = None


class AccountResponse(AccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    balance_current: int
    balance_available: int | None
    balance_limit: int | None
    is_manual: bool
    is_hidden: bool
    include_in_net_worth: bool
    display_order: int
    last_synced_at: datetime | None
    created_at: datetime


class BalanceSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    balance_current: int
    balance_available: int | None


class BalanceSummary(BaseModel):
    """All values in minor units. Liabilities are positive; net_worth is signed."""

    assets: int
    liabilities: int
    net_worth: int
    cash: int
    investments: int
    credit: int
    currency: str = "USD"
