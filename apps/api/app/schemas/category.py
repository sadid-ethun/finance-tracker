from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

CategoryKind = Literal["income", "expense", "transfer"]


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9-]+$")
    kind: CategoryKind = "expense"
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, max_length=20)
    parent_id: UUID | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, max_length=20)
    is_archived: bool | None = None
    display_order: int | None = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    parent_id: UUID | None
    name: str
    slug: str
    kind: str
    icon: str | None
    color: str | None
    is_system: bool
    is_archived: bool
    display_order: int
