"""Audit logging for financial mutations.

Called from the service layer rather than from routes, so a new endpoint
cannot forget to log. Writes are best-effort: an audit failure must never
prevent the user's actual change from being saved, but it is logged loudly
because a silently broken audit trail is worse than none.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.audit import AuditLog

logger = get_logger(__name__)

#: Never persisted into before/after snapshots.
_REDACTED_FIELDS = frozenset(
    {"access_token", "access_token_encrypted", "password", "secret", "backup_codes"}
)


def _scrub(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if data is None:
        return None
    return {
        key: ("[REDACTED]" if key.lower() in _REDACTED_FIELDS else value)
        for key, value in data.items()
    }


async def record(
    db: AsyncSession,
    user_id: str,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Append an audit row. Does not commit — it joins the caller's transaction."""
    try:
        db.add(
            AuditLog(
                user_id=user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                before=_scrub(before),
                after=_scrub(after),
                ip=ip,
            )
        )
        await db.flush()
    except Exception as exc:
        logger.error("audit_write_failed", action=action, error=str(exc))


async def recent(db: AsyncSession, user_id: str, *, limit: int = 50) -> list[AuditLog]:
    return list(
        (
            await db.scalars(
                select(AuditLog)
                .where(AuditLog.user_id == user_id)
                .order_by(AuditLog.created_at.desc())
                .limit(limit)
            )
        ).all()
    )
