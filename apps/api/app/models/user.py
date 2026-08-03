from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    """The Better Auth `user` table.

    Better Auth (in the web app) owns the write path for this table; the API
    only reads it to resolve the subject of a verified JWT. The schema is
    defined in Alembic so migrations stay in one place — if Better Auth's
    schema changes, the migration must be updated to match.

    Note the id is TEXT, not UUID: Better Auth generates its own string ids, so
    every `user_id` foreign key in the financial schema is TEXT as well.
    """

    __tablename__ = "user"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    email_verified: Mapped[bool] = mapped_column(
        "emailVerified", Boolean, nullable=False, server_default="false"
    )
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    #: Written by Better Auth's twoFactor plugin. Declared here so Alembic
    #: autogenerate does not read it as a removed column and emit a DROP.
    two_factor_enabled: Mapped[bool | None] = mapped_column(
        "twoFactorEnabled", Boolean, nullable=True, server_default="false"
    )

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"
