"""Recording a failed sync.

A Plaid failure has to leave a `sync_runs` row behind — that row is what makes
a broken connection visible in Settings rather than silent. The recorder runs
immediately after `db.rollback()`, which expires every ORM instance in the
session, so it must work from plain identifiers: reading an attribute off an
expired instance attempts IO and raises MissingGreenlet *from inside the error
handler*, discarding the very error it was called to record.
"""

from datetime import UTC, datetime
from typing import Any, cast
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plaid_item import PlaidItem, SyncRun
from app.services.plaid import client
from app.services.plaid.sync import _record_failure


class StubSession:
    """Minimal async session double: records what the recorder persists.

    Structural, not an AsyncSession — the recorder only needs get/add/commit,
    and the call sites cast rather than build a real session, so these tests
    stay unit tests with no database.
    """

    def __init__(self, item: PlaidItem | None) -> None:
        self._item = item
        self.added: list[Any] = []
        self.commits = 0

    async def get(self, _model: Any, _pk: Any) -> PlaidItem | None:
        return self._item

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commits += 1


def make_error(code: str) -> client.PlaidError:
    return client.PlaidError("client does not have user consent", plaid_error_code=code)


@pytest.mark.asyncio
async def test_records_a_sync_run_with_the_plaid_error_code() -> None:
    item = PlaidItem(id=uuid4(), user_id="user_1", plaid_item_id="itm_1")
    db = StubSession(item)
    started = datetime.now(UTC)

    await _record_failure(
        cast(AsyncSession, db),
        item.id,
        "user_1",
        started,
        make_error("ADDITIONAL_CONSENT_REQUIRED"),
    )

    runs = [o for o in db.added if isinstance(o, SyncRun)]
    assert len(runs) == 1
    assert runs[0].status == "error"
    assert runs[0].error_code == "ADDITIONAL_CONSENT_REQUIRED"
    assert runs[0].user_id == "user_1"
    assert runs[0].started_at == started
    assert db.commits == 1


@pytest.mark.asyncio
async def test_a_reauth_code_flags_the_item_for_reconnection() -> None:
    item = PlaidItem(id=uuid4(), user_id="user_1", plaid_item_id="itm_1")
    db = StubSession(item)

    await _record_failure(
        cast(AsyncSession, db),
        item.id,
        "user_1",
        datetime.now(UTC),
        make_error("ITEM_LOGIN_REQUIRED"),
    )

    assert item.status == "login_required"


@pytest.mark.asyncio
async def test_a_missing_item_still_records_the_failure() -> None:
    """The run row matters even if the item was deleted mid-sync."""
    db = StubSession(None)

    await _record_failure(
        cast(AsyncSession, db), uuid4(), "user_1", datetime.now(UTC), make_error("INSTITUTION_DOWN")
    )

    assert [o for o in db.added if isinstance(o, SyncRun)]
    assert db.commits == 1
