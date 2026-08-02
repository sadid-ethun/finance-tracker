"""The sign conventions from PLAN.md section 5.

Getting these wrong does not raise — it silently produces the wrong net worth,
which is why they are pinned here.
"""

from decimal import Decimal

import pytest

from app.core.money import (
    AccountType,
    is_liability,
    net_worth_contribution,
    to_major_units,
    to_minor_units,
)


def test_credit_and_loan_are_liabilities() -> None:
    assert is_liability(AccountType.CREDIT)
    assert is_liability(AccountType.LOAN)


def test_depository_and_investment_are_assets() -> None:
    assert not is_liability(AccountType.DEPOSITORY)
    assert not is_liability(AccountType.INVESTMENT)
    assert not is_liability(AccountType.OTHER)


def test_asset_balance_adds_to_net_worth() -> None:
    assert net_worth_contribution(AccountType.DEPOSITORY, 150_00) == 150_00


def test_liability_balance_subtracts_from_net_worth() -> None:
    """A card with $500 owed is stored +50000 and must contribute -50000."""
    assert net_worth_contribution(AccountType.CREDIT, 500_00) == -500_00


def test_net_worth_of_assets_minus_liabilities() -> None:
    checking = net_worth_contribution(AccountType.DEPOSITORY, 2_000_00)
    card = net_worth_contribution(AccountType.CREDIT, 350_00)

    assert checking + card == 1_650_00


def test_accepts_string_account_type() -> None:
    assert net_worth_contribution("credit", 100) == -100


def test_to_minor_units_rounds_half_up() -> None:
    assert to_minor_units(Decimal("12.345")) == 1235
    assert to_minor_units(Decimal("12.344")) == 1234
    assert to_minor_units("0.01") == 1
    assert to_minor_units(Decimal("-5.55")) == -555


def test_float_is_rejected() -> None:
    """Floats are the bug this module exists to prevent."""
    with pytest.raises(TypeError):
        to_minor_units(12.34)  # type: ignore[arg-type]


def test_minor_units_round_trip() -> None:
    assert to_major_units(to_minor_units(Decimal("1234.56"))) == Decimal("1234.56")


def test_no_precision_loss_over_many_amounts() -> None:
    """Summing cents as integers must be exact — the float-drift regression."""
    amounts = [to_minor_units(Decimal("0.10")) for _ in range(10)]
    assert sum(amounts) == 100
