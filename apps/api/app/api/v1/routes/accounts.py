from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.schemas.account import (
    AccountCreate,
    AccountResponse,
    AccountUpdate,
    BalanceSnapshotResponse,
    BalanceSummary,
)
from app.schemas.common import Page
from app.schemas.transaction import TransactionResponse
from app.services import account_service, transaction_service
from app.services.transaction_service import TransactionFilters

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountResponse])
async def list_accounts(
    user: CurrentUser,
    db: DbSession,
    type: Annotated[str | None, Query()] = None,
    include_hidden: Annotated[bool, Query()] = False,
) -> list[AccountResponse]:
    accounts = await account_service.list_accounts(
        db, user.id, account_type=type, include_hidden=include_hidden
    )
    return [AccountResponse.model_validate(a) for a in accounts]


@router.get("/summary", response_model=BalanceSummary)
async def account_summary(user: CurrentUser, db: DbSession) -> BalanceSummary:
    """Assets, liabilities, and net worth. The dashboard's headline numbers."""
    totals = await account_service.summarize_balances(db, user.id)
    return BalanceSummary(**totals)


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AccountCreate, user: CurrentUser, db: DbSession
) -> AccountResponse:
    account = await account_service.create_account(db, user.id, **payload.model_dump())
    return AccountResponse.model_validate(account)


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(account_id: UUID, user: CurrentUser, db: DbSession) -> AccountResponse:
    account = await account_service.get_account(db, user.id, account_id)
    return AccountResponse.model_validate(account)


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: UUID, payload: AccountUpdate, user: CurrentUser, db: DbSession
) -> AccountResponse:
    account = await account_service.update_account(
        db, user.id, account_id, **payload.model_dump(exclude_unset=True)
    )
    return AccountResponse.model_validate(account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(account_id: UUID, user: CurrentUser, db: DbSession) -> None:
    await account_service.delete_account(db, user.id, account_id)


@router.get("/{account_id}/balances", response_model=list[BalanceSnapshotResponse])
async def account_balances(
    account_id: UUID,
    user: CurrentUser,
    db: DbSession,
    days: Annotated[int, Query(ge=1, le=1095)] = 90,
) -> list[BalanceSnapshotResponse]:
    snapshots = await account_service.get_balance_history(db, user.id, account_id, days=days)
    return [BalanceSnapshotResponse.model_validate(s) for s in snapshots]


@router.get("/{account_id}/transactions", response_model=Page[TransactionResponse])
async def account_transactions(
    account_id: UUID,
    user: CurrentUser,
    db: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> Page[TransactionResponse]:
    # Establishes ownership before the transaction query runs.
    await account_service.get_account(db, user.id, account_id)

    page = await transaction_service.list_transactions(
        db,
        user.id,
        filters=TransactionFilters(account_ids=[account_id]),
        cursor=cursor,
        limit=limit,
    )
    return Page[TransactionResponse](
        data=[TransactionResponse.model_validate(t) for t in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )
