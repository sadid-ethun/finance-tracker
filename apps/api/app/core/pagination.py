"""Opaque cursor pagination.

Offset pagination breaks under this app's write pattern: a sync inserting rows
mid-scroll shifts every subsequent page, so the user sees duplicates or gaps.
Cursors encode the sort key of the last row instead, which is stable.

The cursor is base64 of "<date>|<uuid>" — opaque to clients, but deliberately
not encrypted: it carries no secret, only a position.
"""

import base64
import binascii
from datetime import date
from uuid import UUID

from app.core.errors import ValidationError

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50


def encode_cursor(last_date: date, last_id: UUID) -> str:
    raw = f"{last_date.isoformat()}|{last_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[date, UUID]:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(cursor + padding).decode()
        date_part, id_part = raw.split("|", 1)
        return date.fromisoformat(date_part), UUID(id_part)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise ValidationError("Invalid pagination cursor.") from exc


def clamp_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_PAGE_SIZE
    return max(1, min(limit, MAX_PAGE_SIZE))
