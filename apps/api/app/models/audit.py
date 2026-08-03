from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import CHAR, Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import uuid7
from app.db.base import Base


class AuditLog(Base):
    """Append-only record of every financial mutation.

    Deliberately has no updated_at and no soft delete: an audit row that can be
    edited is not an audit row. Rows are written by the service layer, never by
    a route, so a new endpoint cannot forget to log.
    """

    __tablename__ = "audit_log"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )

    action: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_audit_user_created", "user_id", "created_at"),)


class UserPreferences(Base):
    """Per-user display settings. One row per user, created on first read."""

    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), primary_key=True
    )

    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")
    #: system | light | dark
    theme: Mapped[str] = mapped_column(String(10), nullable=False, server_default="system")
    #: 0 = Sunday, 1 = Monday
    week_starts_on: Mapped[int] = mapped_column(nullable=False, server_default="0")
    timezone: Mapped[str] = mapped_column(String(60), nullable=False, server_default="UTC")
    hide_from_dashboard: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
