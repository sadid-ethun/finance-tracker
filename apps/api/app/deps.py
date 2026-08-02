"""Shared FastAPI dependencies.

`get_current_user` is the single place tenant scoping is established. Routes
take the returned User and filter by `user.id`; `user_id` is never accepted as
a request parameter (PLAN.md section 11).
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.security import UnauthenticatedError, decode_token
from app.db.session import get_db
from app.models.user import User

# auto_error=False so a missing header raises our Problem Details 401 rather
# than FastAPI's default body.
_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if credentials is None or not credentials.credentials:
        raise UnauthenticatedError("Missing bearer token.")

    claims = decode_token(credentials.credentials, settings)

    subject = claims.get("sub")
    if not subject:
        raise UnauthenticatedError("Token is missing a subject.")

    user = await db.scalar(select(User).where(User.id == subject))
    if user is None:
        # A validly signed token for a deleted user must not authenticate.
        raise UnauthenticatedError("User no longer exists.")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
