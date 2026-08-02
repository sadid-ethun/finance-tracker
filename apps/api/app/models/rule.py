from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import uuid7
from app.db.base import Base, TimestampMixin


class Rule(Base, TimestampMixin):
    """A user categorization rule.

    Conditions and actions are JSONB rather than columns because the rule shape
    will keep growing (Phase 8 adds more operators), and each addition would
    otherwise cost a migration.

    conditions: {"all": [{"field": "merchant_name", "op": "contains",
                          "value": "Whole Foods"}]}
    actions:    {"set_category_id": "...", "set_notes": "...",
                 "exclude_from_budget": true}
    """

    __tablename__ = "rules"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    # Lower numbers win. Ties break by created_at.
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    conditions: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    actions: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    last_applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
