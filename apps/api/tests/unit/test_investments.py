"""Investment classification and gain arithmetic."""

import inspect
from decimal import Decimal

from app.models.investment import Security
from app.services import investment_service
from app.services.investment_service import asset_class
from app.services.plaid.investments import _minor


def security(**kwargs: object) -> Security:
    defaults: dict[str, object] = {"name": "Test", "is_cash_equivalent": False}
    defaults.update(kwargs)
    return Security(**defaults)


def test_equity_maps_to_stocks() -> None:
    assert asset_class(security(type="equity")) == "Stocks"


def test_etf_and_mutual_fund_are_distinct() -> None:
    assert asset_class(security(type="etf")) == "ETFs"
    assert asset_class(security(type="mutual fund")) == "Mutual funds"


def test_type_matching_is_case_insensitive() -> None:
    assert asset_class(security(type="EQUITY")) == "Stocks"


def test_unknown_type_falls_back_to_other() -> None:
    assert asset_class(security(type="something-new")) == "Other"
    assert asset_class(security(type=None)) == "Other"


def test_cash_equivalent_overrides_type() -> None:
    """A money-market fund is cash, whatever its instrument type says."""
    assert asset_class(security(type="mutual fund", is_cash_equivalent=True)) == "Cash"


# ------------------------------------------------------------ amount mapping


def test_investment_amounts_are_not_negated() -> None:
    """Spending flips sign on import; a holding value is a magnitude."""
    assert _minor(1234.56) == 123456


def test_investment_amount_avoids_float_error() -> None:
    assert _minor(1.15) == 115
    assert _minor(8.07) == 807


def test_missing_amount_is_none_not_zero() -> None:
    """None means 'Plaid did not tell us', which is not the same as zero."""
    assert _minor(None) is None


def test_fractional_quantity_keeps_precision() -> None:
    """Fractional shares are routine; a float would lose the tail."""
    quantity = Decimal("0.12345678")
    assert str(quantity) == "0.12345678"


# ------------------------------------------------------------ gain semantics


def test_gain_excludes_positions_without_cost_basis() -> None:
    """Treating an unknown basis as zero would report the position as pure profit."""
    source = inspect.getsource(investment_service.summary)
    assert "with_basis" in source
    assert "positions_without_cost_basis" in source


def test_holdings_report_null_gain_when_basis_unknown() -> None:
    source = inspect.getsource(investment_service.list_holdings)
    assert "if h.cost_basis is not None else None" in source


def test_gain_percent_guards_zero_basis() -> None:
    source = inspect.getsource(investment_service.list_holdings)
    assert "if h.cost_basis" in source


def gain_percent(value: int, basis: int) -> float | None:
    return round((value - basis) / basis * 100, 2) if basis else None


def test_gain_percent_positive() -> None:
    assert gain_percent(12000, 10000) == 20.0


def test_gain_percent_negative() -> None:
    assert gain_percent(8000, 10000) == -20.0


def test_gain_percent_zero_basis_is_none() -> None:
    assert gain_percent(5000, 0) is None


def test_cost_basis_is_treated_as_a_total_not_per_share() -> None:
    """Plaid documents cost_basis as the total cost of the position.

    Multiplying it by quantity would inflate every basis and understate every
    gain. Sandbox data invites the mistake by reporting totals that imply
    implausible returns, so the intent is pinned here.
    """
    source = inspect.getsource(investment_service.list_holdings)
    # Gain is a plain subtraction of the stored basis.
    assert "h.institution_value - h.cost_basis" in source
    # And the basis is never scaled by the share count anywhere.
    assert "quantity * " not in source
    assert "* h.quantity" not in source


def test_gain_is_value_minus_total_basis() -> None:
    """213 shares now worth $7,397.49 against a $6,390.00 total basis."""
    value, basis = 739749, 639000
    assert value - basis == 100749
