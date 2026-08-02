from uuid import UUID

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import uuid7
from app.db.base import Base, TimestampMixin


class Category(Base, TimestampMixin):
    """Spending/income category. One level of nesting only.

    System categories are seeded per user rather than shared globally, so the
    user can rename or archive any of them without a special case.
    """

    __tablename__ = "categories"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(String(60), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # income | expense | transfer
    kind: Mapped[str] = mapped_column(String(10), nullable=False, server_default="expense")

    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("user_id", "slug", name="uq_category_user_slug"),)


class Merchant(Base, TimestampMixin):
    """Normalized merchant, used for logos and category memory (Phase 3)."""

    __tablename__ = "merchants"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_category_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("user_id", "normalized_name", name="uq_merchant_user_normalized"),
    )
