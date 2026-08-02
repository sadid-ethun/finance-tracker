from datetime import date as date_type
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TransactionCreate(BaseModel):
    account_id: UUID
    amount: int = Field(
        description="Minor units. Negative is money out, positive is money in — "
        "including on credit cards, where a purchase is negative."
    )
    date: date_type
    name: str = Field(min_length=1, max_length=300)
    category_id: UUID | None = None
    merchant_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    exclude_from_budget: bool = False


class TransactionUpdate(BaseModel):
    amount: int | None = None
    date: date_type | None = None
    name: str | None = Field(default=None, min_length=1, max_length=300)
    category_id: UUID | None = None
    merchant_name: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    is_hidden: bool | None = None
    exclude_from_budget: bool | None = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    amount: int
    currency: str
    date: date_type
    name: str
    merchant_name: str | None
    category_id: UUID | None
    category_source: str | None
    notes: str | None
    pending: bool
    is_manual: bool
    is_hidden: bool
    is_split: bool
    is_transfer: bool
    exclude_from_budget: bool
    created_at: datetime
