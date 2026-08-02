"""Money and sign conventions.

Two rules govern every amount in this application, and breaking either one
produces silently wrong numbers rather than errors:

1. Amounts are integer **minor units** (cents). Never float. A float cent is a
   rounding error waiting to compound across a year of transactions.

2. Sign convention (PLAN.md section 5):
   - Transactions: negative is money leaving, positive is money arriving. This
     holds for every account type, including credit cards, where a purchase is
     negative and a payment is positive.
   - Balances: `balance_current` on a liability is stored **positive** as the
     amount owed, and negated when rolling into net worth.
"""

from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum


class AccountType(StrEnum):
    DEPOSITORY = "depository"
    CREDIT = "credit"
    LOAN = "loan"
    INVESTMENT = "investment"
    OTHER = "other"


#: Account types whose balance represents money owed rather than money held.
LIABILITY_TYPES: frozenset[AccountType] = frozenset({AccountType.CREDIT, AccountType.LOAN})


def is_liability(account_type: AccountType | str) -> bool:
    return AccountType(account_type) in LIABILITY_TYPES


def net_worth_contribution(account_type: AccountType | str, balance_minor: int) -> int:
    """Signed contribution of an account balance to net worth.

    Liabilities are stored positive, so they subtract here. This is the single
    place that conversion happens; callers must not negate balances themselves.
    """
    if is_liability(account_type):
        return -balance_minor
    return balance_minor


def to_minor_units(amount: Decimal | str | int, *, exponent: int = 2) -> int:
    """Convert a major-unit amount (12.34) to minor units (1234).

    Uses Decimal end-to-end; passing a float is rejected rather than silently
    rounded, because that is exactly the bug this module exists to prevent.
    """
    if isinstance(amount, float):  # pragma: no cover - defensive
        raise TypeError("Use Decimal or str for money, never float.")

    value = Decimal(amount)
    scaled = value.scaleb(exponent).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(scaled)


def to_major_units(minor: int, *, exponent: int = 2) -> Decimal:
    """Convert minor units back to a major-unit Decimal, for display or export."""
    return Decimal(minor).scaleb(-exponent)
