from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from app.services import category_service

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    user: CurrentUser,
    db: DbSession,
    include_archived: Annotated[bool, Query()] = False,
) -> list[CategoryResponse]:
    """Defaults are seeded on first read, so this is never empty."""
    categories = await category_service.list_categories(
        db, user.id, include_archived=include_archived
    )
    return [CategoryResponse.model_validate(c) for c in categories]


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate, user: CurrentUser, db: DbSession
) -> CategoryResponse:
    category = await category_service.create_category(db, user.id, **payload.model_dump())
    return CategoryResponse.model_validate(category)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID, payload: CategoryUpdate, user: CurrentUser, db: DbSession
) -> CategoryResponse:
    category = await category_service.update_category(
        db, user.id, category_id, **payload.model_dump(exclude_unset=True)
    )
    return CategoryResponse.model_validate(category)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: UUID,
    user: CurrentUser,
    db: DbSession,
    reassign_to: Annotated[UUID | None, Query()] = None,
) -> None:
    """Deleting a category in use requires somewhere to move its transactions."""
    await category_service.delete_category(db, user.id, category_id, reassign_to=reassign_to)
