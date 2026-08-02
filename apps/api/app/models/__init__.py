"""SQLAlchemy models.

Import every model module here so `Base.metadata` is fully populated before
Alembic autogenerates a migration.
"""

from app.db.base import Base
from app.models.account import Account, AccountBalanceSnapshot
from app.models.category import Category, Merchant
from app.models.transaction import Transaction
from app.models.user import User

__all__ = [
    "Account",
    "AccountBalanceSnapshot",
    "Base",
    "Category",
    "Merchant",
    "Transaction",
    "User",
]
