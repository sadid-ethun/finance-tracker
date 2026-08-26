"""soft-delete transactions belonging to soft-deleted accounts

remove_item soft-deleted an item and its accounts but left their transactions
untouched. Every transaction query filters `deleted_at IS NULL` and none join
back to the account, so those rows stayed fully live — in the list, in every
total, in every chart — while the account itself was correctly hidden.

That stays invisible until the same institution is re-linked, which is what
widening the history window requires. Plaid issues fresh transaction_ids per
item, so the new link cannot recognise the old rows as the same transactions
and every one of them is counted twice.

link.py no longer leaves them behind. This backfills the rows already
orphaned, matching them to their account rather than guessing at duplicates:
a transaction whose account is soft-deleted is unreachable through the UI
either way, so hiding it removes nothing a user could otherwise see.

Reversible. The downgrade revives exactly the rows this touched, identified by
the timestamp it stamps, so a transaction the user deleted by hand keeps its
own timestamp and is not disturbed in either direction.

Revision ID: d7b3e15c8a42
Revises: c4f1a7e2b93d
Create Date: 2026-08-26 09:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "d7b3e15c8a42"
down_revision: str | None = "c4f1a7e2b93d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# A fixed sentinel rather than now(): it makes the affected rows identifiable,
# which is what lets the downgrade revive precisely these and nothing else.
MARKER = "2026-08-26 09:00:00+00"


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE transactions AS t
        SET deleted_at = TIMESTAMPTZ '{MARKER}'
        FROM accounts AS a
        WHERE t.account_id = a.id
          AND a.deleted_at IS NOT NULL
          AND t.deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        UPDATE transactions
        SET deleted_at = NULL
        WHERE deleted_at = TIMESTAMPTZ '{MARKER}'
        """
    )
