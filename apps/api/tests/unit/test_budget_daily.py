"""Daily cumulative spend, the series behind the spend-vs-budget chart."""

from datetime import date
from typing import Any, cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.budget_service import daily_spend


class Row:
    def __init__(self, day: date, total: int) -> None:
        self.date = day
        self.total = total


class StubResult:
    def __init__(self, rows: list[Row]) -> None:
        self._rows = rows

    def all(self) -> list[Row]:
        return self._rows


class StubSession:
    def __init__(self, rows: list[Row]) -> None:
        self._rows = rows

    async def execute(self, _stmt: Any) -> StubResult:
        return StubResult(self._rows)


async def series_for(rows: list[Row], month: date) -> list[dict[str, Any]]:
    db = StubSession(rows)
    return await daily_spend(cast(AsyncSession, db), "user_1", month)


@pytest.mark.asyncio
async def test_every_day_of_the_month_appears() -> None:
    """A day with no spending is still a point.

    Plotting only the days that had transactions would step the line between
    them, implying spend on dates where none happened. The flat stretches are
    the information.
    """
    series = await series_for([Row(date(2026, 1, 5), -1000)], date(2026, 1, 1))

    assert len(series) == 31
    assert series[0]["date"] == date(2026, 1, 1)
    assert series[-1]["date"] == date(2026, 1, 31)


@pytest.mark.asyncio
async def test_cumulative_only_ever_rises() -> None:
    series = await series_for(
        [Row(date(2026, 1, 2), -1000), Row(date(2026, 1, 10), -2500)], date(2026, 1, 1)
    )
    running = [p["cumulative"] for p in series]

    assert running == sorted(running)
    assert running[0] == 0
    assert running[-1] == 3500


@pytest.mark.asyncio
async def test_a_flat_day_carries_the_previous_total_forward() -> None:
    series = await series_for([Row(date(2026, 1, 2), -1000)], date(2026, 1, 1))
    by_day = {p["date"]: p for p in series}

    assert by_day[date(2026, 1, 2)]["spent"] == 1000
    assert by_day[date(2026, 1, 3)]["spent"] == 0
    # The line holds rather than dropping back to zero.
    assert by_day[date(2026, 1, 3)]["cumulative"] == 1000


@pytest.mark.asyncio
async def test_amounts_are_positive_minor_units() -> None:
    """Outflows are stored negative; a spend chart plots them upward."""
    series = await series_for([Row(date(2026, 1, 2), -4599)], date(2026, 1, 1))

    assert series[1]["spent"] == 4599


@pytest.mark.asyncio
async def test_a_past_month_runs_to_its_final_day() -> None:
    series = await series_for([], date(2026, 2, 1))

    assert series[-1]["date"] == date(2026, 2, 28)


@pytest.mark.asyncio
async def test_the_current_month_stops_at_today() -> None:
    """Running to the month end would draw a flat line across days that have
    not happened, which reads as "spending stopped" rather than "the month is
    not over"."""
    today = date.today()
    series = await series_for([], today.replace(day=1))

    assert series[-1]["date"] == today


@pytest.mark.asyncio
async def test_any_day_in_the_month_resolves_to_the_same_series() -> None:
    a = await series_for([], date(2026, 2, 1))
    b = await series_for([], date(2026, 2, 17))

    assert [p["date"] for p in a] == [p["date"] for p in b]
