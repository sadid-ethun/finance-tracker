from datetime import date as date_type
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import uuid7
from app.db.base import Base, TimestampMixin


class Budget(Base, TimestampMixin):
    """One budget per user per month.

    Deliberately simple: a set of per-category limits, not envelope budgeting
    (PLAN.md core features). There is no carried balance to reconcile, so a
    month can be edited freely without rewriting history.
    """

    __tablename__ = "budgets"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    #: Always the first of the month.
    month: Mapped[date_type] = mapped_column(Date, nullable=False)

    total_income_expected: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    categories: Mapped[list["BudgetCategory"]] = relationship(
        back_populates="budget",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (UniqueConstraint("user_id", "month", name="uq_budget_user_month"),)


class BudgetCategory(Base, TimestampMixin):
    """A spending limit for one category in one month."""

    __tablename__ = "budget_categories"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    budget_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    #: Positive minor units — the limit, not a signed amount.
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    #: Reserved for Phase 8. Never read yet; simple budgets do not carry over.
    rollover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    budget: Mapped[Budget] = relationship(back_populates="categories")

    __table_args__ = (UniqueConstraint("budget_id", "category_id", name="uq_budget_category"),)
