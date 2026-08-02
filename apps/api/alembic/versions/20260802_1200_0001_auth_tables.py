"""auth tables

Creates the Better Auth schema (user, session, auth_account, verification, jwks).

Column names are camelCase because Better Auth addresses them that way; this
migration is the authoritative definition and must be kept in sync with
apps/web/src/lib/auth.ts. Better Auth's own migrate command is never run
against this database.

Revision ID: 0001
Revises:
Create Date: 2026-08-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("emailVerified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("image", sa.Text(), nullable=True),
        sa.Column(
            "createdAt",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updatedAt",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "session",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column(
            "createdAt",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ipAddress", sa.Text(), nullable=True),
        sa.Column("userAgent", sa.Text(), nullable=True),
        sa.Column("userId", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    # Every authenticated request looks a session up by token.
    op.create_index("ix_session_user_id", "session", ["userId"])

    op.create_table(
        "auth_account",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("accountId", sa.Text(), nullable=False),
        sa.Column("providerId", sa.Text(), nullable=False),
        sa.Column("userId", sa.Text(), nullable=False),
        sa.Column("accessToken", sa.Text(), nullable=True),
        sa.Column("refreshToken", sa.Text(), nullable=True),
        sa.Column("idToken", sa.Text(), nullable=True),
        sa.Column("accessTokenExpiresAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refreshTokenExpiresAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("password", sa.Text(), nullable=True),
        sa.Column(
            "createdAt",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_account_user_id", "auth_account", ["userId"])

    op.create_table(
        "verification",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("identifier", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "createdAt",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updatedAt",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_verification_identifier", "verification", ["identifier"])

    # Signing keys for the JWT plugin. Private keys are encrypted by Better Auth
    # using BETTER_AUTH_SECRET before they are stored.
    op.create_table(
        "jwks",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("publicKey", sa.Text(), nullable=False),
        sa.Column("privateKey", sa.Text(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("jwks")
    op.drop_index("ix_verification_identifier", table_name="verification")
    op.drop_table("verification")
    op.drop_index("ix_auth_account_user_id", table_name="auth_account")
    op.drop_table("auth_account")
    op.drop_index("ix_session_user_id", table_name="session")
    op.drop_table("session")
    op.drop_table("user")
