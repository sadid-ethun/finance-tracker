"""The interest arithmetic, checked without a database.

Mirrors the calculation in account_service.accrue_interest. It compounds, so
an error here does not stay the size it started — it grows every night, which
is exactly the kind of bug that is invisible for a month and then obvious.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal


def grow(balance_minor: int, bps: int, days: int) -> int:
    rate = Decimal(bps) / Decimal(10_000)
    factor = (Decimal(1) + rate / Decimal(365)) ** days
    return int((Decimal(balance_minor) * factor).to_integral_value(rounding=ROUND_HALF_UP))


class TestBasisPoints:
    def test_one_day_matches_the_apr_divided_by_365(self) -> None:
        # $10,000 at 5.50% owes 10000 * 0.055 / 365 = $1.507 for a day.
        # Getting the basis-point divisor wrong by a factor of 100 — which I
        # did on the first pass — leaves this at zero.
        assert grow(1_000_000, 550, 1) - 1_000_000 == 151

    def test_a_year_lands_just_under_continuous_compounding(self) -> None:
        # e^0.055 = 1.05654, the ceiling daily compounding approaches from
        # below. Landing above it would mean compounding too often.
        after = grow(1_000_000, 550, 365)
        assert 1_056_000 < after < 1_056_541


class TestEdges:
    def test_zero_rate_does_nothing(self) -> None:
        assert grow(1_000_000, 0, 365) == 1_000_000

    def test_zero_balance_stays_zero(self) -> None:
        # A paid-off card should not start growing from nothing.
        assert grow(0, 2_400, 365) == 0

    def test_catching_up_equals_running_nightly(self) -> None:
        # The job compounds however many days it missed in one pass. Three days
        # caught up must equal three nights run one at a time, or a night the
        # worker was down changes the answer.
        nightly = 5_000_00
        for _ in range(3):
            nightly = grow(nightly, 1_800, 1)
        assert abs(grow(5_000_00, 1_800, 3) - nightly) <= 1

    def test_a_missed_month_is_not_lost(self) -> None:
        # The failure this guards against is a job that only ever applies
        # "today" and silently drops the days it did not run.
        assert grow(1_000_000, 550, 30) > grow(1_000_000, 550, 1)


class TestDayCount:
    def test_days_elapsed_is_the_difference_between_dates(self) -> None:
        # The service takes (on - interest_accrued_on).days. A same-day rerun
        # must be a no-op, which is what makes the job idempotent.
        assert (date(2026, 9, 1) - date(2026, 9, 1)).days == 0
        assert (date(2026, 9, 1) - date(2026, 8, 29)).days == 3
