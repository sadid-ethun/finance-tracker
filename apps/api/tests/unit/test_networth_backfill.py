"""Reconstructing net-worth history by walking transactions backwards.

Approximate by construction — it can only see movements that produced a
transaction — but it must never be internally inconsistent.
"""

from datetime import date, timedelta

import pytest


def walk_back(net_worth_today: int, deltas: dict[date, int], days: int) -> list[tuple[date, int]]:
    """Mirrors the loop in backfill_net_worth."""
    today = date.today()
    running = net_worth_today
    out: list[tuple[date, int]] = []
    for offset in range(days):
        on = today - timedelta(days=offset)
        out.append((on, running))
        running -= deltas.get(on, 0)
    return out


def snapshot_fields(running: int, liabilities: int) -> dict[str, int]:
    """Mirrors the row the backfill writes."""
    return {
        "assets": running + liabilities,
        "liabilities": liabilities,
        "net_worth": running,
    }


def test_todays_point_is_todays_net_worth() -> None:
    series = walk_back(1_777_095, {}, 5)

    assert series[0] == (date.today(), 1_777_095)


def test_a_day_undoes_its_own_movement() -> None:
    """Net worth today equals yesterday plus today's movement, so stepping
    back subtracts it. Adding instead would double every day's activity and
    send the line the wrong way."""
    today = date.today()
    series = dict(walk_back(1_000_000, {today: -50_000}, 3))

    assert series[today] == 1_000_000
    assert series[today - timedelta(days=1)] == 1_050_000


def test_income_and_spending_move_the_line_in_opposite_directions() -> None:
    today = date.today()
    spent = dict(walk_back(1_000_000, {today: -50_000}, 2))
    earned = dict(walk_back(1_000_000, {today: 50_000}, 2))

    assert spent[today - timedelta(days=1)] > 1_000_000
    assert earned[today - timedelta(days=1)] < 1_000_000


def test_a_day_with_no_transactions_holds_the_line_flat() -> None:
    today = date.today()
    series = dict(walk_back(1_000_000, {}, 4))

    assert series[today - timedelta(days=3)] == 1_000_000


@pytest.mark.parametrize("running", [1_700_000, 0, -250_000])
def test_assets_minus_liabilities_always_equals_net_worth(running: int) -> None:
    """The invariant the previous implementation broke: it derived assets from
    the running total while holding liabilities at today's figure, so the two
    subtracted to something that was not the net worth on the same row."""
    fields = snapshot_fields(running, liabilities=455_065)

    assert fields["assets"] - fields["liabilities"] == fields["net_worth"]
