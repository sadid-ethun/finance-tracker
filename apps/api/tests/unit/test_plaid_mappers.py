"""Plaid payload conversion.

The sign flip and the float→minor-units conversion are the two places where a
quiet mistake would invert or corrupt every imported amount.
"""

from datetime import date

from app.services.plaid.mappers import (
    map_account,
    map_transaction,
    plaid_amount_to_minor,
)


def test_plaid_outflow_becomes_negative() -> None:
    """Plaid reports money leaving as POSITIVE. We store it negative."""
    assert plaid_amount_to_minor(25.00) == -2500


def test_plaid_inflow_becomes_positive() -> None:
    """A refund or deposit is negative in Plaid, positive for us."""
    assert plaid_amount_to_minor(-1200.50) == 120050


def test_amount_conversion_avoids_float_error() -> None:
    """int(1.15 * 100) is 114 in binary floating point. Must be 115."""
    assert plaid_amount_to_minor(1.15) == -115
    assert plaid_amount_to_minor(8.07) == -807
    assert plaid_amount_to_minor(1.005) == -101


def test_missing_amount_is_zero() -> None:
    assert plaid_amount_to_minor(None) == 0


def test_map_transaction_core_fields() -> None:
    raw = {
        "transaction_id": "tx_1",
        "account_id": "acc_1",
        "amount": 12.34,
        "iso_currency_code": "USD",
        "date": "2026-07-15",
        "name": "COFFEE SHOP",
        "merchant_name": "Coffee Shop",
        "pending": False,
        "personal_finance_category": {
            "primary": "FOOD_AND_DRINK",
            "detailed": "FOOD_AND_DRINK_COFFEE",
        },
        "location": {"city": "Boston", "region": "MA"},
    }

    mapped = map_transaction(raw)

    assert mapped["amount"] == -1234
    assert mapped["date"] == date(2026, 7, 15)
    assert mapped["plaid_pfc_primary"] == "FOOD_AND_DRINK"
    assert mapped["location_city"] == "Boston"
    assert mapped["is_manual"] is False


def test_map_account_keeps_liability_balance_positive() -> None:
    """Plaid already reports credit balances as amount owed, matching us."""
    raw = {
        "account_id": "acc_2",
        "name": "Rewards Card",
        "type": "credit",
        "subtype": "credit card",
        "mask": "4321",
        "balances": {
            "current": 450.00,
            "available": 4550.00,
            "limit": 5000.00,
            "iso_currency_code": "USD",
        },
    }

    mapped = map_account(raw)

    assert mapped["type"] == "credit"
    assert mapped["balance_current"] == 45000
    assert mapped["balance_limit"] == 500000
    assert mapped["is_manual"] is False


def test_map_account_normalizes_brokerage_to_investment() -> None:
    mapped = map_account(
        {"account_id": "a", "name": "Brokerage", "type": "brokerage", "balances": {}}
    )
    assert mapped["type"] == "investment"


def test_map_account_unknown_type_falls_back() -> None:
    mapped = map_account(
        {"account_id": "a", "name": "Odd", "type": "something_new", "balances": {}}
    )
    assert mapped["type"] == "other"
