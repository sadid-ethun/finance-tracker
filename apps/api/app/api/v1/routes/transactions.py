from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.schemas.common import Page
from app.schemas.rule import (
    BulkCategorizeRequest,
    BulkCategorizeResponse,
    LinkTransferRequest,
    SplitRequest,
)
from app.schemas.transaction import (
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from app.services import (
    rule_service,
    split_service,
    transaction_service,
    transfer_service,
)
from app.services.split_service import SplitPart
from app.services.transaction_service import TransactionFilters

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=Page[TransactionResponse])
async def list_transactions(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=200)] = None,
    account_ids: Annotated[list[UUID] | None, Query()] = None,
    category_ids: Annotated[list[UUID] | None, Query()] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    min_amount: Annotated[int | None, Query()] = None,
    max_amount: Annotated[int | None, Query()] = None,
    uncategorized: Annotated[bool, Query()] = False,
    include_hidden: Annotated[bool, Query()] = False,
    include_transfers: Annotated[bool, Query()] = True,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> Page[TransactionResponse]:
    page = await transaction_service.list_transactions(
        db,
        user.id,
        filters=TransactionFilters(
            query=q,
            include_transfers=include_transfers,
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


# -------------------------------------------------------------------- splits


@router.post("/{transaction_id}/split", response_model=list[TransactionResponse])
async def split_transaction(
    transaction_id: UUID, payload: SplitRequest, user: CurrentUser, db: DbSession
) -> list[TransactionResponse]:
    """Replace any existing split. Parts must sum to the parent exactly."""
    children = await split_service.split_transaction(
        db,
        user.id,
        transaction_id,
        [
            SplitPart(amount=p.amount, category_id=p.category_id, notes=p.notes)
            for p in payload.parts
        ],
    )
    return [TransactionResponse.model_validate(c) for c in children]


@router.get("/{transaction_id}/split", response_model=list[TransactionResponse])
async def get_split(
    transaction_id: UUID, user: CurrentUser, db: DbSession
) -> list[TransactionResponse]:
    children = await split_service.get_split_children(db, user.id, transaction_id)
    return [TransactionResponse.model_validate(c) for c in children]


@router.delete("/{transaction_id}/split", response_model=TransactionResponse)
async def unsplit_transaction(
    transaction_id: UUID, user: CurrentUser, db: DbSession
) -> TransactionResponse:
    parent = await split_service.unsplit_transaction(db, user.id, transaction_id)
    return TransactionResponse.model_validate(parent)


# ------------------------------------------------------------------ transfers


@router.post("/link-transfer", response_model=list[TransactionResponse])
async def link_transfer(
    payload: LinkTransferRequest, user: CurrentUser, db: DbSession
) -> list[TransactionResponse]:
    """Mark two transactions as the two sides of one internal transfer."""
    linked = await transfer_service.link_transfer(db, user.id, payload.transaction_ids)
    return [TransactionResponse.model_validate(t) for t in linked]


@router.delete("/{transaction_id}/transfer", response_model=list[TransactionResponse])
async def unlink_transfer(
    transaction_id: UUID, user: CurrentUser, db: DbSession
) -> list[TransactionResponse]:
    unlinked = await transfer_service.unlink_transfer(db, user.id, transaction_id)
    return [TransactionResponse.model_validate(t) for t in unlinked]


@router.post("/detect-transfers", response_model=dict[str, int])
async def detect_transfers(
    user: CurrentUser,
    db: DbSession,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> dict[str, int]:
    """Scan recent transactions and auto-link matching pairs."""
    pairs = await transfer_service.detect_transfers(db, user.id, since_days=days)
    return {"pairs_linked": pairs}


# ------------------------------------------------------------ bulk operations


@router.post("/bulk-categorize", response_model=BulkCategorizeResponse)
async def bulk_categorize(
    payload: BulkCategorizeRequest, user: CurrentUser, db: DbSession
) -> BulkCategorizeResponse:
    """Recategorize many transactions, optionally remembering the choice."""
    updated = await transaction_service.bulk_categorize(
        db, user.id, payload.transaction_ids, payload.category_id
    )

    rule_id = None
    if payload.create_rule and updated:
        # Derive a rule from the selection so "categorize these 40 Starbucks
        # charges and remember it" is a single action.
        sample = await transaction_service.get_transaction(db, user.id, payload.transaction_ids[0])
        descriptor = sample.merchant_name or sample.name
        rule = await rule_service.create_rule(
            db,
            user.id,
            name=payload.rule_name or f"Auto: {descriptor}",
            conditions={"all": [{"field": "name", "op": "contains", "value": descriptor}]},
            actions={"set_category_id": str(payload.category_id)},
        )
        rule_id = rule.id

    return BulkCategorizeResponse(updated=updated, rule_id=rule_id)
