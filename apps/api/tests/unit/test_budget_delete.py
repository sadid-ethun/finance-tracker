"""Deleting a month's budget.

Distinct from zeroing every category: a month with no budget reports
`exists: false` and the screen offers to build one, whereas a month whose
lines are all zero is a budget of nothing and reads as total overspend against
any real transaction.
"""

from datetime import date
from typing import Any, cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget
from app.services.budget_service import delete_budget


class StubSession:
    """Async session double: records deletes and commits."""

    def __init__(self, found: Budget | None) -> None:
        self._found = found
        self.deleted: list[Any] = []
        self.commits = 0

    async def scalar(self, _stmt: Any) -> Budget | None:
        return self._found

    async def delete(self, obj: Any) -> None:
        self.deleted.append(obj)

    async def commit(self) -> None:
        self.commits += 1


@pytest.mark.asyncio
async def test_deletes_the_budget_when_one_exists() -> None:
    budget = Budget(user_id="user_1", month=date(2026, 8, 1))
    db = StubSession(budget)

    await delete_budget(cast(AsyncSession, db), "user_1", date(2026, 8, 1))

    assert db.deleted == [budget]
    assert db.commits == 1


@pytest.mark.asyncio
async def test_deleting_a_month_without_a_budget_is_a_no_op() -> None:
    """Idempotent, so a retry after a lost response still succeeds.

    Raising 404 here would make a double tap on a slow connection fail the
    second time, having done exactly what was asked the first.
    """
    db = StubSession(None)

    await delete_budget(cast(AsyncSession, db), "user_1", date(2026, 8, 1))

    assert db.deleted == []
    assert db.commits == 0


@pytest.mark.asyncio
async def test_any_day_in_the_month_resolves_to_the_same_budget() -> None:
    """Months are normalised to the first, so a mid-month date still matches."""
    budget = Budget(user_id="user_1", month=date(2026, 8, 1))
    db = StubSession(budget)

    await delete_budget(cast(AsyncSession, db), "user_1", date(2026, 8, 23))

    assert db.deleted == [budget]
