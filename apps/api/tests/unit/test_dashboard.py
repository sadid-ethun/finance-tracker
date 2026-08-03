"""Dashboard aggregation rules.

The exclusion predicate is the difference between a dashboard that tells the
truth and one that quietly double-counts. These pin the rule itself rather
than any particular query.
"""

from datetime import date

from app.services.dashboard_service import _spendable, month_bounds, shift_months


def _clauses(user_id: str = "u_1") -> str:
    return " ".join(str(c) for c in _spendable(user_id))


def test_excludes_deleted_rows() -> None:
    assert "deleted_at IS NULL" in _clauses()


def test_excludes_hidden_rows() -> None:
    assert "is_hidden" in _clauses()


def test_excludes_split_parents() -> None:
    """Counting a parent alongside its children double-counts the amount."""
    assert "is_split" in _clauses()


def test_excludes_transfers() -> None:
    """Money between your own accounts is neither income nor spending."""
    assert "is_transfer" in _clauses()


def test_scopes_to_the_user() -> None:
    assert "user_id" in _clauses()


def test_predicate_has_all_six_guards() -> None:
    """A regression here is silent, so the count is asserted explicitly."""
    assert len(_spendable("u_1")) == 6


def test_excludes_transfer_kind_categories() -> None:
    """A credit-card payment counted as spending double-counts its purchases.

    is_transfer only covers pairs detection actually matched; a payment whose
    amounts never lined up would otherwise slip through as spending.
    """
    clauses = _clauses()
    assert "kind" in clauses


def test_transfer_category_exclusion_keeps_uncategorized_rows() -> None:
    """NOT IN yields NULL for uncategorized rows, which would drop them."""
    clauses = _clauses()
    assert "category_id IS NULL" in clauses


# ------------------------------------------------------------- month bounds


def test_month_bounds_mid_month() -> None:
    assert month_bounds(date(2026, 7, 15)) == (date(2026, 7, 1), date(2026, 7, 31))


def test_month_bounds_february_non_leap() -> None:
    assert month_bounds(date(2026, 2, 10)) == (date(2026, 2, 1), date(2026, 2, 28))


def test_month_bounds_february_leap() -> None:
    assert month_bounds(date(2028, 2, 10)) == (date(2028, 2, 1), date(2028, 2, 29))


def test_month_bounds_december_rolls_year() -> None:
    assert month_bounds(date(2026, 12, 5)) == (date(2026, 12, 1), date(2026, 12, 31))


def test_month_bounds_is_idempotent_on_first_of_month() -> None:
    assert month_bounds(date(2026, 7, 1)) == (date(2026, 7, 1), date(2026, 7, 31))


def test_month_bounds_thirty_day_month() -> None:
    assert month_bounds(date(2026, 4, 30)) == (date(2026, 4, 1), date(2026, 4, 30))


# ------------------------------------------------------------ month shifting


def test_shift_months_backwards_across_year() -> None:
    assert shift_months(date(2026, 2, 15), -3) == date(2025, 11, 1)


def test_shift_months_forwards_across_year() -> None:
    assert shift_months(date(2026, 11, 20), 3) == date(2027, 2, 1)


def test_shift_months_zero_normalizes_to_first() -> None:
    assert shift_months(date(2026, 7, 31), 0) == date(2026, 7, 1)


def test_window_of_n_months_yields_exactly_n_buckets() -> None:
    """Day arithmetic (31 * n) overshoots short months and yields n+1."""
    for months in (2, 3, 6, 12, 24):
        for anchor in (date(2026, 8, 1), date(2026, 3, 31), date(2026, 1, 15)):
            start = shift_months(anchor, -(months - 1))
            count = 0
            cursor = start
            while cursor <= anchor.replace(day=1):
                count += 1
                cursor = shift_months(cursor, 1)
            assert count == months, f"{months} from {anchor} gave {count}"
