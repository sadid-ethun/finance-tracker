"""SQLAlchemy models.

Import every model module here so `Base.metadata` is fully populated before
Alembic autogenerates a migration.
"""

from app.db.base import Base
from app.models.account import (
    Account,
    AccountBalanceSnapshot,
    NetWorthSnapshot,
)
from app.models.audit import AuditLog, UserPreferences
from app.models.budget import Budget, BudgetCategory
from app.models.category import Category, Merchant
from app.models.investment import (
    Holding,
    HoldingSnapshot,
    InvestmentTransaction,
    Security,
)
from app.models.plaid_item import PlaidItem, SyncRun
from app.models.rule import Rule
from app.models.transaction import Transaction
from app.models.user import User

__all__ = [
    "Account",
    "AccountBalanceSnapshot",
    "AuditLog",
    "Base",
    "Budget",
    "BudgetCategory",
    "Category",
    "Holding",
    "HoldingSnapshot",
    "InvestmentTransaction",
    "Merchant",
    "NetWorthSnapshot",
    "PlaidItem",
    "Rule",
    "Security",
    "SyncRun",
    "Transaction",
    "User",
    "UserPreferences",
]
