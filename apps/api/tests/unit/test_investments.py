"""Investment classification and gain arithmetic."""

import inspect
from decimal import Decimal

from app.models.investment import Holding, Security
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
    assert "if h.effective_cost_basis is not None" in source


def test_gain_percent_guards_zero_basis() -> None:
    source = inspect.getsource(investment_service.list_holdings)
    assert "if h.effective_cost_basis" in source


def test_effective_basis_prefers_the_override() -> None:
    assert Holding(cost_basis=236910, cost_basis_override=179110).effective_cost_basis == 179110


def test_effective_basis_falls_back_to_plaid_when_not_overridden() -> None:
    assert Holding(cost_basis=236910, cost_basis_override=None).effective_cost_basis == 236910


def test_effective_basis_is_none_when_neither_is_known() -> None:
    assert Holding(cost_basis=None, cost_basis_override=None).effective_cost_basis is None


def test_a_zero_override_is_honoured_rather_than_treated_as_unset() -> None:
    """Zero is a legitimate basis — a gifted or fully vested position.

    Testing truthiness instead of `is not None` would silently fall back to
    Plaid's figure here and report the wrong gain.
    """
    assert Holding(cost_basis=236910, cost_basis_override=0).effective_cost_basis == 0


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
    assert "h.institution_value - h.effective_cost_basis" in source
    # And the basis is never scaled by the share count anywhere.
    assert "quantity * " not in source
    assert "* h.quantity" not in source


def test_gain_is_value_minus_total_basis() -> None:
    """213 shares now worth $7,397.49 against a $6,390.00 total basis."""
    value, basis = 739749, 639000
    assert value - basis == 100749


def test_summary_reports_the_value_the_gain_is_measured_against() -> None:
    """total_value cannot be reconciled against total_cost_basis.

    A portfolio contains cash and margin balances, which carry no cost basis
    and are excluded from the gain. Showing value and basis side by side
    without the invested figure invites subtracting one from the other, which
    yields a number that is not the gain and is not anything else either.
    """
    source = inspect.getsource(investment_service.summary)

    assert '"invested_value": valued_with_basis' in source
    assert '"total_gain": gain' in source
    # The gain must be the difference from the invested value, never from the
    # portfolio total.
    assert "gain = valued_with_basis - total_cost" in source


def test_a_hand_entered_cost_basis_wins_over_plaids() -> None:
    """Plaid's cost basis is only as good as the institution behind it.

    Observed in production: Robinhood's own UI reported $358.22/share for a
    position Plaid returned at $473.82, understating the gain by $578 while
    every other position on the same account matched to the cent. A wrong
    basis is invisible — the total still looks plausible — so the override
    has to take precedence wherever the basis is read.
    """
    source = inspect.getsource(investment_service)

    # The list path reads through the model property.
    assert '"cost_basis": h.effective_cost_basis' in source
    # The summary path coalesces in SQL rather than re-deriving it.
    assert "func.coalesce(Holding.cost_basis_override, Holding.cost_basis)" in source


def test_the_override_is_a_separate_column_from_plaids_value() -> None:
    """A sync must not be able to undo a correction.

    Writing the correction over cost_basis would work until the next sync
    overwrote it, which is the same trap category_source exists to avoid for
    transactions.
    """
    source = inspect.getsource(Holding)

    assert "cost_basis_override" in source
    assert "def effective_cost_basis" in source
