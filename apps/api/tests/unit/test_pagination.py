from datetime import date
from uuid import UUID

import pytest

from app.core.errors import ValidationError
from app.core.pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    clamp_limit,
    decode_cursor,
    encode_cursor,
)

SAMPLE_ID = UUID("018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5061")


def test_cursor_round_trips() -> None:
    cursor = encode_cursor(date(2026, 3, 15), SAMPLE_ID)

    assert decode_cursor(cursor) == (date(2026, 3, 15), SAMPLE_ID)


def test_cursor_is_opaque() -> None:
    """Not encrypted, but not obviously readable either."""
    cursor = encode_cursor(date(2026, 3, 15), SAMPLE_ID)

    assert "2026-03-15" not in cursor
    assert "=" not in cursor


@pytest.mark.parametrize("bad", ["", "!!!!", "bm90LWEtY3Vyc29y", "YWJjfG5vdC1hLXV1aWQ"])
def test_malformed_cursor_is_a_validation_error(bad: str) -> None:
    """Never a 500: a hand-edited cursor is user input."""
    with pytest.raises(ValidationError):
        decode_cursor(bad)


def test_limit_defaults_and_clamps() -> None:
    assert clamp_limit(None) == DEFAULT_PAGE_SIZE
    assert clamp_limit(10) == 10
    assert clamp_limit(0) == 1
    assert clamp_limit(-5) == 1
    assert clamp_limit(10_000) == MAX_PAGE_SIZE
