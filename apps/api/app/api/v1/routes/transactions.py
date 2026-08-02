from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.schemas.common import Page
from app.schemas.transaction import (
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from app.services import transaction_service
from app.services.transaction_service import TransactionFilters

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=Page[TransactionResponse])
async def list_transactions(
    user: CurrentUser,
    db: DbSession,
    account_ids: Annotated[list[UUID] | None, Query()] = None,
    category_ids: Annotated[list[UUID] | None, Query()] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    min_amount: Annotated[int | None, Query()] = None,
    max_amount: Annotated[int | None, Query()] = None,
    uncategorized: Annotated[bool, Query()] = False,
    include_hidden: Annotated[bool, Query()] = False,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> Page[TransactionResponse]:
    page = await transaction_service.list_transactions(
        db,
        user.id,
        filters=TransactionFilters(
            account_ids=account_ids,
            category_ids=category_ids,
            date_from=date_from,
            date_to=date_to,
            min_amount=min_amount,
            max_amount=max_amount,
            uncategorized=uncategorized,
            include_hidden=include_hidden,
        ),
        cursor=cursor,
        limit=limit,
    )
    return Page[TransactionResponse](
        data=[TransactionResponse.model_validate(t) for t in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate, user: CurrentUser, db: DbSession
) -> TransactionResponse:
    transaction = await transaction_service.create_transaction(db, user.id, **payload.model_dump())
    return TransactionResponse.model_validate(transaction)


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: UUID, user: CurrentUser, db: DbSession
) -> TransactionResponse:
    transaction = await transaction_service.get_transaction(db, user.id, transaction_id)
    return TransactionResponse.model_validate(transaction)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdate,
    user: CurrentUser,
    db: DbSession,
) -> TransactionResponse:
    transaction = await transaction_service.update_transaction(
        db, user.id, transaction_id, **payload.model_dump(exclude_unset=True)
    )
    return TransactionResponse.model_validate(transaction)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: UUID, user: CurrentUser, db: DbSession) -> None:
    await transaction_service.delete_transaction(db, user.id, transaction_id)
