"""interest rate on liability accounts

A manually tracked loan does not get its balance from anywhere, so it sits at
whatever it was on the day it was entered while the real debt grows. This is
the rate to grow it by.

Basis points, as an integer: 550 is 5.50% APR. Money and rates are never
floats in this codebase, and a rate that cannot be represented exactly would
compound its own error daily.

`interest_accrued_on` is what makes the nightly job idempotent — and what lets
it catch up correctly after a night the worker was down, rather than skipping
the days it missed.

Revision ID: a3c9d4e17b58
Revises: d7b3e15c8a42
Create Date: 2026-09-01 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3c9d4e17b58"
down_revision: str | None = "d7b3e15c8a42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("interest_rate_bps", sa.Integer(), nullable=True))
    op.add_column("accounts", sa.Column("interest_accrued_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "interest_accrued_on")
    op.drop_column("accounts", "interest_rate_bps")
