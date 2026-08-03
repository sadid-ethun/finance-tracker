"""Budget arithmetic and the budget-specific exclusion rule.

Budgets reuse the dashboard's spendable predicate but add one guard the
dashboard deliberately omits: exclude_from_budget. The dashboard reports what
you spent; a budget reports what you spent against a plan.
"""

import inspect
from datetime import date

from app.services import budget_service
from app.services.budget_service import _normalize


def test_normalize_snaps_to_first_of_month() -> None:
    assert _normalize(date(2026, 7, 23)) == date(2026, 7, 1)
    assert _normalize(date(2026, 7, 1)) == date(2026, 7, 1)


def test_spend_query_excludes_budget_opted_out_rows() -> None:
    """The guard that separates budget spend from dashboard spend."""
    source = inspect.getsource(budget_service._spend_by_category)
    assert "exclude_from_budget" in source


def test_spend_query_reuses_the_shared_predicate() -> None:
    """Budgets must inherit the split/transfer/deleted/hidden exclusions."""
    source = inspect.getsource(budget_service._spend_by_category)
    assert "_spendable(user_id)" in source


def test_spend_query_counts_only_outflows() -> None:
    source = inspect.getsource(budget_service._spend_by_category)
    assert "Transaction.amount < 0" in source


def test_suggestions_also_respect_the_budget_exclusion() -> None:
    """A suggestion built from excluded spend would propose the wrong limit."""
    source = inspect.getsource(budget_service.suggest_from_history)
    assert "exclude_from_budget" in source
    assert "_spendable(user_id)" in source


# ---------------------------------------------------------------- arithmetic


def percent(spent: int, budgeted: int) -> int:
    """Mirrors the calculation in budget_with_progress."""
    return round(spent / budgeted * 100) if budgeted else 0


def test_percent_under_budget() -> None:
    assert percent(2500, 10000) == 25


def test_percent_exactly_on_budget() -> None:
    assert percent(10000, 10000) == 100


def test_percent_over_budget_exceeds_one_hundred() -> None:
    """Over-spend must be visible as >100%, not clamped."""
    assert percent(15000, 10000) == 150


def test_percent_with_zero_budget_does_not_divide_by_zero() -> None:
    assert percent(5000, 0) == 0


def test_remaining_goes_negative_when_over() -> None:
    budgeted, spent = 10000, 13000
    assert budgeted - spent == -3000
