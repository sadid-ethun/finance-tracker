from datetime import date as date_type
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import uuid7
from app.db.base import Base, TimestampMixin


class Security(Base, TimestampMixin):
    """An instrument. Shared across accounts, keyed by Plaid's security id.

    Prices are minor units like every other amount in the app, even though a
    price is a rate rather than a balance — mixing conventions within one
    column family is how rounding bugs start.
    """

    __tablename__ = "securities"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    plaid_security_id: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)

    ticker: Mapped[str | None] = mapped_column(String(24), nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    cusip: Mapped[str | None] = mapped_column(String(12), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True)

    close_price: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    close_price_as_of: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")
    #: Money-market and sweep positions, reported separately from equities.
    is_cash_equivalent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )


class Holding(Base, TimestampMixin):
    """A position: how much of one security sits in one account."""

    __tablename__ = "holdings"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    security_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("securities.id", ondelete="CASCADE"), nullable=False
    )

    #: Fractional shares are routine, so this is Decimal — never float, and
    #: never an integer count.
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    cost_basis: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    institution_price: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    institution_value: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")
    as_of_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)

    __table_args__ = (
        UniqueConstraint("account_id", "security_id", name="uq_holding_account_security"),
        Index("ix_holdings_user", "user_id"),
    )


class InvestmentTransaction(Base, TimestampMixin):
    """A buy, sell, dividend, fee, or transfer within an investment account.

    Kept separate from `transactions`: these have quantity and price, do not
    belong in spending totals, and would distort every cash-flow number if
    mixed in.
    """

    __tablename__ = "investment_transactions"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    security_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("securities.id", ondelete="SET NULL"), nullable=True
    )

    plaid_investment_transaction_id: Mapped[str | None] = mapped_column(
        Text, nullable=True, unique=True
    )

    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    subtype: Mapped[str | None] = mapped_column(String(40), nullable=True)

    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    price: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    fees: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")

    __table_args__ = (Index("ix_inv_txn_user_date", "user_id", "date"),)


class HoldingSnapshot(Base):
    """Daily portfolio value per account, for the performance chart."""

    __tablename__ = "holding_snapshots"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    total_value: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_cost_basis: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    __table_args__ = (
        UniqueConstraint("account_id", "date", name="uq_holding_snapshot_account_date"),
    )
