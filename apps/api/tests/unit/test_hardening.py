"""Security headers, rate limiting, audit scrubbing, and CSV parsing."""

from decimal import Decimal

import pytest

from app.core.errors import ValidationError
from app.core.middleware import SECURITY_HEADERS, _limit_for, _SlidingWindow
from app.services.audit_service import _scrub
from app.services.data_service import (
    NON_BREAKING_SPACE,
    _parse_amount,
    _parse_date,
    detect_columns,
)

# ----------------------------------------------------------------- headers


def test_clickjacking_and_sniffing_are_blocked() -> None:
    assert SECURITY_HEADERS["X-Frame-Options"] == "DENY"
    assert SECURITY_HEADERS["X-Content-Type-Options"] == "nosniff"


def test_csp_denies_everything_for_a_json_api() -> None:
    assert "default-src 'none'" in SECURITY_HEADERS["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in SECURITY_HEADERS["Content-Security-Policy"]


def test_referrer_is_not_leaked() -> None:
    assert SECURITY_HEADERS["Referrer-Policy"] == "no-referrer"


# ------------------------------------------------------------ rate limiting


def test_plaid_is_limited_more_tightly_than_general_api() -> None:
    """Link and exchange are expensive and billable; ordinary reads are not."""
    plaid = _limit_for("/api/v1/plaid/link-token")
    general = _limit_for("/api/v1/transactions")
    assert plaid is not None and general is not None
    assert plaid[0] < general[0]


def test_longest_prefix_wins() -> None:
    assert _limit_for("/api/v1/plaid/items") == _limit_for("/api/v1/plaid")


def test_unmatched_path_is_unlimited() -> None:
    assert _limit_for("/health") is None


def test_window_allows_up_to_the_limit_then_blocks() -> None:
    limiter = _SlidingWindow()
    for _ in range(3):
        allowed, _ = limiter.check("k", limit=3, window=60)
        assert allowed

    blocked, remaining = limiter.check("k", limit=3, window=60)
    assert not blocked
    assert remaining == 0


def test_separate_keys_have_separate_quotas() -> None:
    """One caller must not exhaust another's allowance."""
    limiter = _SlidingWindow()
    for _ in range(3):
        limiter.check("a", limit=3, window=60)

    allowed, _ = limiter.check("b", limit=3, window=60)
    assert allowed


def test_pruning_drops_idle_buckets() -> None:
    limiter = _SlidingWindow()
    limiter.check("stale", limit=5, window=60)
    limiter.prune(older_than=-1)
    assert "stale" not in limiter._hits


# --------------------------------------------------------------- audit log


def test_audit_scrubs_credentials() -> None:
    scrubbed = _scrub({"access_token": "secret", "name": "Checking"})
    assert scrubbed == {"access_token": "[REDACTED]", "name": "Checking"}


def test_audit_scrub_is_case_insensitive() -> None:
    scrubbed = _scrub({"Password": "hunter2"})
    assert scrubbed is not None
    assert scrubbed["Password"] == "[REDACTED]"


def test_audit_scrub_handles_none() -> None:
    assert _scrub(None) is None


# ------------------------------------------------------------- csv parsing


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("12.34", 1234),
        ("1,234.56", 123456),
        ("$99.99", 9999),
        ("(45.00)", -4500),
        ("-45.00", -4500),
        (f"1{NON_BREAKING_SPACE}234.56", 123456),
        ("1 234.56", 123456),
    ],
)
def test_amount_parsing(raw: str, expected: int) -> None:
    assert _parse_amount(raw) == expected


def test_amount_parsing_rejects_garbage() -> None:
    with pytest.raises(ValidationError):
        _parse_amount("not a number")


def test_amount_parsing_rejects_empty() -> None:
    with pytest.raises(ValidationError):
        _parse_amount("   ")


def test_amount_parsing_uses_decimal_not_float() -> None:
    """int(1.15 * 100) is 114; the CSV path must not repeat that bug."""
    assert _parse_amount("1.15") == 115
    assert _parse_amount("8.07") == 807


@pytest.mark.parametrize("raw", ["2026-07-15", "07/15/2026", "15/07/2026", "2026/07/15"])
def test_date_parsing_accepts_common_formats(raw: str) -> None:
    parsed = _parse_date(raw)
    assert parsed.year == 2026


def test_date_parsing_rejects_unknown_format() -> None:
    with pytest.raises(ValidationError):
        _parse_date("July the fifteenth")


def test_column_detection_matches_common_headers() -> None:
    mapping = detect_columns("Transaction Date,Description,Amount\n2026-01-01,X,1.00\n")
    assert mapping["date"] == "Transaction Date"
    assert mapping["description"] == "Description"
    assert mapping["amount"] == "Amount"


def test_column_detection_is_case_insensitive() -> None:
    mapping = detect_columns("DATE,PAYEE,VALUE\n")
    assert mapping["date"] == "DATE"
    assert mapping["description"] == "PAYEE"
    assert mapping["amount"] == "VALUE"


def test_column_detection_leaves_unknown_fields_none() -> None:
    mapping = detect_columns("date,amount\n")
    assert mapping["category"] is None


def test_column_detection_rejects_empty_file() -> None:
    with pytest.raises(ValidationError):
        detect_columns("")


def test_export_amounts_are_major_units() -> None:
    """A CSV is read by humans and spreadsheets, not by our API."""
    from app.core.money import to_major_units

    assert f"{to_major_units(-5250):.2f}" == "-52.50"
    assert to_major_units(123456) == Decimal("1234.56")
