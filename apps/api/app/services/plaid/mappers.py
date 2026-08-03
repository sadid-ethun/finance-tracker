"""Translate Plaid payloads into our models.

Two conversions matter and are easy to get subtly wrong:

**Amounts.** Plaid returns floats in major units. We store integer minor units,
so the conversion goes through Decimal — `int(1.15 * 100)` is 114, not 115.

**Sign.** Plaid is the opposite of us: it reports money leaving an account as
*positive*. We store outflows negative (PLAN.md section 5), so every amount is
negated on the way in. Getting this backwards inverts the entire app.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.core.money import to_minor_units

#: Plaid account type -> ours.
ACCOUNT_TYPE_MAP = {
    "depository": "depository",
    "credit": "credit",
    "loan": "loan",
    "investment": "investment",
    "brokerage": "investment",
    "other": "other",
}


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def plaid_amount_to_minor(amount: float | Decimal | int | None) -> int:
    """Plaid major-unit float -> our signed minor units.

    Negated because Plaid's sign convention is the inverse of ours.
    """
    if amount is None:
        return 0
    # str() first: Decimal(float) would carry the binary rounding error along.
    return -to_minor_units(Decimal(str(amount)))


def map_account(raw: dict[str, Any]) -> dict[str, Any]:
    balances = raw.get("balances") or {}
    plaid_type = str(raw.get("type") or "other")

    current = balances.get("current")
    available = balances.get("available")
    limit = balances.get("limit")

    account_type = ACCOUNT_TYPE_MAP.get(plaid_type, "other")

    # Plaid reports liability balances positive already (amount owed), which
    # matches how we store them, so these are *not* negated.
    def positive_minor(value: Any) -> int | None:
        if value is None:
            return None
        return to_minor_units(Decimal(str(value)))

    return {
        "plaid_account_id": raw.get("account_id"),
        "name": raw.get("name") or "Account",
        "official_name": raw.get("official_name"),
        "type": account_type,
        "subtype": str(raw.get("subtype")) if raw.get("subtype") else None,
        "mask": raw.get("mask"),
        "currency": (balances.get("iso_currency_code") or "USD")[:3],
        "balance_current": positive_minor(current) or 0,
        "balance_available": positive_minor(available),
        "balance_limit": positive_minor(limit),
        "is_manual": False,
    }


def map_transaction(raw: dict[str, Any]) -> dict[str, Any]:
    pfc = raw.get("personal_finance_category") or {}
    location = raw.get("location") or {}

    return {
        "plaid_transaction_id": raw.get("transaction_id"),
        "plaid_account_id": raw.get("account_id"),
        "amount": plaid_amount_to_minor(raw.get("amount")),
        "currency": (raw.get("iso_currency_code") or "USD")[:3],
        "date": _as_date(raw.get("date")),
        "authorized_date": _as_date(raw.get("authorized_date")),
        "datetime_": raw.get("datetime"),
        "name": raw.get("name") or "Transaction",
        "merchant_name": raw.get("merchant_name"),
        "plaid_pfc_primary": pfc.get("primary"),
        "plaid_pfc_detailed": pfc.get("detailed"),
        "pending": bool(raw.get("pending")),
        "pending_plaid_transaction_id": raw.get("pending_transaction_id"),
        "location_city": location.get("city"),
        "location_region": location.get("region"),
        "payment_channel": raw.get("payment_channel"),
        "is_manual": False,
    }
