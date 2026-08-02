from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SplitPartRequest(BaseModel):
    amount: int = Field(description="Minor units. Must share the parent's sign.")
    category_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SplitRequest(BaseModel):
    parts: list[SplitPartRequest] = Field(min_length=2)


class LinkTransferRequest(BaseModel):
    transaction_ids: list[UUID] = Field(min_length=2, max_length=2)


class BulkCategorizeRequest(BaseModel):
    transaction_ids: list[UUID] = Field(min_length=1, max_length=500)
    category_id: UUID
    # Turns a one-off cleanup into a standing rule — the highest-value
    # affordance in the app (PLAN.md section 7).
    create_rule: bool = False
    rule_name: str | None = Field(default=None, max_length=120)


class BulkCategorizeResponse(BaseModel):
    updated: int
    rule_id: UUID | None = None


class RuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    conditions: dict[str, Any]
    actions: dict[str, Any]
    priority: int = 100
    is_active: bool = True


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    conditions: dict[str, Any] | None = None
    actions: dict[str, Any] | None = None
    priority: int | None = None
    is_active: bool | None = None


class RuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    priority: int
    is_active: bool
    conditions: dict[str, Any]
    actions: dict[str, Any]
    last_applied_at: datetime | None
    created_at: datetime
