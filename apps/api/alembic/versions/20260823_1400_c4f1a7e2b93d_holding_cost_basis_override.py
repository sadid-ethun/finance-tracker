"""holding cost basis override

Plaid's cost_basis is only as good as the institution reporting it, and it is
demonstrably wrong sometimes. This column lets a wrong basis be corrected
without the next sync overwriting the correction.

Revision ID: c4f1a7e2b93d
Revises: 2096cacf6b54
Create Date: 2026-08-23 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4f1a7e2b93d"
down_revision: str | None = "2096cacf6b54"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("holdings", sa.Column("cost_basis_override", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("holdings", "cost_basis_override")
