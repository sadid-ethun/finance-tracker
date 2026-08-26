"""Link token creation and public-token exchange."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.item_remove_request import ItemRemoveRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.link_token_transactions import LinkTokenTransactions
from plaid.model.products import Products
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.crypto import encrypt
from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.account import Account
from app.models.plaid_item import PlaidItem
from app.models.transaction import Transaction
from app.services.plaid import client
from app.services.plaid.mappers import map_account

logger = get_logger(__name__)


async def create_link_token(
    user_id: str, *, item_id: UUID | None = None, db: AsyncSession | None = None
) -> str:
    """Create a Link token.

    Passing `item_id` produces an *update mode* token, which re-authenticates an
    existing connection instead of creating a duplicate one.
    """
    settings = get_settings()

    kwargs: dict[str, Any] = {
        "user": LinkTokenCreateRequestUser(client_user_id=user_id),
        "client_name": "Finance Tracker",
        "country_codes": [CountryCode(c) for c in settings.plaid_country_codes],
        "language": "en",
    }

    if item_id is not None and db is not None:
        item = await get_item(db, user_id, item_id)
        # Update mode: no products, and the access token identifies the item.
        kwargs["access_token"] = client.access_token_for(item)
    else:
        kwargs["products"] = [Products(p) for p in settings.plaid_products]
        # Without this Plaid defaults to 90 days, which is not enough to draw a
        # net-worth chart or compare a month against the same month last year.
        # 730 is Plaid's maximum. It is fixed at link time: raising it later
        # does not extend an item already connected, which has to be re-linked
        # through update mode to widen its window.
        kwargs["transactions"] = LinkTokenTransactions(
            days_requested=settings.plaid_initial_backfill_days
        )
        # Requested separately from `products` on purpose. Anything in
        # `products` is a hard requirement and Plaid will refuse institutions
        # that cannot satisfy it — a credit card has no investment accounts,
        # so requiring investments there makes it unlinkable.
        if settings.plaid_additional_consented_products:
            kwargs["additional_consented_products"] = [
                Products(p) for p in settings.plaid_additional_consented_products
            ]

    if settings.plaid_webhook_url:
        kwargs["webhook"] = settings.plaid_webhook_url

    response = await client.call("link_token_create", LinkTokenCreateRequest(**kwargs))
    return str(response["link_token"])


async def exchange_public_token(
    db: AsyncSession,
    user_id: str,
    *,
    public_token: str,
    institution_id: str | None = None,
    institution_name: str | None = None,
) -> PlaidItem:
    """Exchange a public token for an access token and import the accounts."""
    response = await client.call(
        "item_public_token_exchange",
        ItemPublicTokenExchangeRequest(public_token=public_token),
    )

    access_token = response["access_token"]
    plaid_item_id = response["item_id"]

    existing = await db.scalar(select(PlaidItem).where(PlaidItem.plaid_item_id == plaid_item_id))
    if existing is not None and existing.deleted_at is None:
        raise ConflictError("That institution is already connected.")

    item = PlaidItem(
        user_id=user_id,
        plaid_item_id=plaid_item_id,
        plaid_institution_id=institution_id,
        institution_name=institution_name,
        # Encrypted immediately; the plaintext is not retained beyond this call.
        access_token_encrypted=encrypt(access_token),
        status="good",
    )
    db.add(item)
    await db.flush()

    await import_accounts(db, item)
    await db.commit()
    await db.refresh(item)

    logger.info(
        "plaid_item_connected",
        item_id=str(item.id),
        institution=institution_name,
    )
    return item


async def import_accounts(db: AsyncSession, item: PlaidItem) -> list[Account]:
    """Create or update the accounts belonging to an item."""
    from plaid.model.accounts_get_request import AccountsGetRequest

    response = await client.call(
        "accounts_get", AccountsGetRequest(access_token=client.access_token_for(item))
    )

    accounts: list[Account] = []
    for raw in response.get("accounts", []):
        mapped = map_account(raw)

        account = await db.scalar(
            select(Account).where(Account.plaid_account_id == mapped["plaid_account_id"])
        )

        if account is None:
            account = Account(
                user_id=item.user_id,
                plaid_item_id=item.id,
                **mapped,
            )
            db.add(account)
        else:
            # Balances come from the institution; local edits do not survive.
            for field, value in mapped.items():
                setattr(account, field, value)
            account.plaid_item_id = item.id
            account.deleted_at = None

        account.last_synced_at = datetime.now(UTC)
        accounts.append(account)

    await db.flush()
    return accounts


async def get_item(db: AsyncSession, user_id: str, item_id: UUID) -> PlaidItem:
    item = await db.scalar(
        select(PlaidItem).where(
            PlaidItem.id == item_id,
            PlaidItem.user_id == user_id,
            PlaidItem.deleted_at.is_(None),
        )
    )
    if item is None:
        raise NotFoundError("Connection not found.")
    return item


async def list_items(db: AsyncSession, user_id: str) -> list[PlaidItem]:
    return list(
        (
            await db.scalars(
                select(PlaidItem)
                .where(PlaidItem.user_id == user_id, PlaidItem.deleted_at.is_(None))
                .order_by(PlaidItem.created_at)
            )
        ).all()
    )


async def remove_item(db: AsyncSession, user_id: str, item_id: UUID) -> None:
    """Disconnect an institution.

    Plaid is told to remove the item first — otherwise the access token stays
    live on their side and we keep being billed for a connection we no longer
    use. Local rows are soft-deleted rather than dropped, so a disconnect is
    recoverable and nothing cascades away silently.

    The transactions are soft-deleted with their accounts. They used to be
    left behind: every query filters `Transaction.deleted_at IS NULL` and none
    of them join back to the account, so an orphaned transaction stayed fully
    live in the list, in every total, and in every chart, while the account it
    belonged to was correctly hidden.

    That is invisible until you re-link the same institution — which is what
    you do to widen the history window. Plaid issues fresh transaction_ids per
    item, so the new link cannot recognise the old rows as the same
    transactions, and every one of them is counted twice.
    """
    item = await get_item(db, user_id, item_id)

    try:
        await client.call(
            "item_remove", ItemRemoveRequest(access_token=client.access_token_for(item))
        )
    except client.PlaidError as exc:
        # An already-invalid token still needs cleaning up locally.
        logger.warning(
            "plaid_item_remove_failed",
            item_id=str(item.id),
            plaid_error_code=exc.plaid_error_code,
        )

    now = datetime.now(UTC)
    item.deleted_at = now

    account_ids = list(
        (
            await db.scalars(select(Account.id).where(Account.plaid_item_id == item.id))
        ).all()
    )

    if account_ids:
        await db.execute(
            update(Account).where(Account.id.in_(account_ids)).values(deleted_at=now)
        )
        # Only rows that are still live: a transaction the user deleted by hand
        # keeps the timestamp it already had.
        await db.execute(
            update(Transaction)
            .where(
                Transaction.account_id.in_(account_ids),
                Transaction.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )

    await db.commit()
