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
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import uuid7
from app.db.base import Base, TimestampMixin


class Account(Base, TimestampMixin):
    """A financial account, either Plaid-linked or entered by hand.

    `balance_current` is stored in minor units and is always positive for
    liabilities (the amount owed); see app.core.money for the conversion rules.
    """

    __tablename__ = "accounts"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )

    # Populated from Phase 4 onward; null means a manual account.
    plaid_item_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("plaid_items.id", ondelete="CASCADE"), nullable=True
    )
    plaid_account_id: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)

    name: Mapped[str] = mapped_column(Text, nullable=False)
    official_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    subtype: Mapped[str | None] = mapped_column(String(40), nullable=True)
    mask: Mapped[str | None] = mapped_column(String(8), nullable=True)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")

    balance_current: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    balance_available: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    balance_limit: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    is_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_in_net_worth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: APR in basis points — 550 is 5.50%. Liabilities only, and optional:
    #: null means the balance only moves when something says it does.
    #:
    #: An integer because a rate that cannot be represented exactly compounds
    #: its own error every night, and this codebase does not put money or the
    #: rates applied to it in a float.
    interest_rate_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Last date interest was applied. Makes the nightly job idempotent, and
    #: lets it catch up over days the worker was down instead of losing them.
    interest_accrued_on: Mapped[date_type | None] = mapped_column(Date, nullable=True)

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_accounts_user_type", "user_id", "type"),
        Index("ix_accounts_user_active", "user_id", "deleted_at"),
    )


class AccountBalanceSnapshot(Base):
    """One row per account per day, written by the nightly job (Phase 5).

    Created now so the account history endpoint has a table to read, and so the
    schema does not need a second migration when snapshots start being written.
    """

    __tablename__ = "account_balance_snapshots"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    account_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    balance_current: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_available: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    __table_args__ = (
        UniqueConstraint("account_id", "date", name="uq_balance_snapshot_account_date"),
    )


class NetWorthSnapshot(Base):
    """One row per user per day, written by the nightly job.

    Charts read snapshots rather than recomputing from transactions: net worth
    on an arbitrary past date is expensive to derive, and the value is a fact
    about that day that never changes afterwards.
    """

    __tablename__ = "net_worth_snapshots"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)

    assets: Mapped[int] = mapped_column(BigInteger, nullable=False)
    liabilities: Mapped[int] = mapped_column(BigInteger, nullable=False)
    net_worth: Mapped[int] = mapped_column(BigInteger, nullable=False)
    cash: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    investments: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    credit: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_net_worth_snapshot_user_date"),)
