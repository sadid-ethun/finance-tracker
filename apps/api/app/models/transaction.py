from datetime import date as date_type
from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import uuid7
from app.db.base import Base, TimestampMixin


class Transaction(Base, TimestampMixin):
    """The hot table.

    `amount` is minor units, negative for money leaving the account (including
    credit-card purchases) and positive for money arriving.

    Split parents are excluded from every aggregation: the children carry the
    real amounts and `is_split` marks the parent as a container. Transfers
    between the user's own accounts are excluded from income and spending via
    `is_transfer`. Both flags exist from Phase 2 so the aggregation predicates
    written later never need a migration.
    """

    __tablename__ = "transactions"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )

    plaid_transaction_id: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)

    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")

    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    authorized_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    datetime_: Mapped[datetime | None] = mapped_column(
        "datetime", DateTime(timezone=True), nullable=True
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    merchant_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    merchant_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    category_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    # plaid | rule | merchant | user — 'user' is never overwritten by a sync.
    category_source: Mapped[str | None] = mapped_column(String(10), nullable=True)

    plaid_pfc_primary: Mapped[str | None] = mapped_column(String(60), nullable=True)
    plaid_pfc_detailed: Mapped[str | None] = mapped_column(String(80), nullable=True)

    pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pending_plaid_transaction_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    exclude_from_budget: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_split: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    parent_transaction_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=True
    )

    is_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    transfer_group_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    location_city: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_region: Mapped[str | None] = mapped_column(String(60), nullable=True)
    payment_channel: Mapped[str | None] = mapped_column(String(30), nullable=True)

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # The default list view.
        Index("ix_transactions_user_date", "user_id", text("date DESC")),
        # Account detail view.
        Index("ix_transactions_account_date", "account_id", text("date DESC")),
        # Budget and category rollups.
        Index("ix_transactions_user_category_date", "user_id", "category_id", "date"),
        Index(
            "ix_transactions_transfer_group",
            "user_id",
            "transfer_group_id",
            postgresql_where=text("transfer_group_id IS NOT NULL"),
        ),
        Index("ix_transactions_parent", "parent_transaction_id"),
        # The aggregation path: live, non-parent rows only.
        Index(
            "ix_transactions_user_date_active",
            "user_id",
            text("date DESC"),
            postgresql_where=text("deleted_at IS NULL AND is_split = false"),
        ),
    )
