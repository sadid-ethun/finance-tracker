from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import uuid7
from app.db.base import Base, TimestampMixin


class PlaidItem(Base, TimestampMixin):
    """One connected institution.

    `access_token_encrypted` holds a Fernet ciphertext, never plaintext. The
    `transactions_cursor` is the sync position: it must only ever be advanced
    in the same database transaction as the rows it describes, or those
    transactions are lost permanently (PLAN.md section 9).
    """

    __tablename__ = "plaid_items"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )

    plaid_item_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    plaid_institution_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    institution_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    institution_logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    transactions_cursor: Mapped[str | None] = mapped_column(Text, nullable=True)

    # good | login_required | pending_expiration | error
    status: Mapped[str] = mapped_column(String(24), nullable=False, server_default="good")
    last_successful_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_plaid_items_user", "user_id", "status"),)


class SyncRun(Base):
    """Observability for every sync attempt.

    Surfaces in Settings → Connections so a silently failing institution is
    visible rather than just producing stale numbers.
    """

    __tablename__ = "sync_runs"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    plaid_item_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("plaid_items.id", ondelete="CASCADE"), nullable=True
    )

    # transactions | investments | balances
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    # running | success | error
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default="running")

    added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    modified: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_sync_runs_user_started", "user_id", "started_at"),)
