"""Categorization: rules, merchant memory, and the Plaid taxonomy map.

Precedence, first match wins (PLAN.md section 4):

  1. A manual override on the transaction (category_source == 'user').
     Never overwritten by a sync — this is the guarantee that makes the whole
     app trustworthy, so it is checked before anything else.
  2. An active user rule, by priority.
  3. Merchant memory: this merchant was categorized the same way >= 2 times.
  4. Plaid's personal finance category, mapped to our slugs.
  5. Uncategorized.
"""

import re
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.category import Category
from app.models.rule import Rule
from app.models.transaction import Transaction

#: How many times a merchant must be seen with one category before it sticks.
MERCHANT_MEMORY_THRESHOLD = 2

#: Plaid personal finance category (primary) -> our category slug.
PLAID_PFC_MAP: dict[str, str] = {
    "INCOME": "income",
    "TRANSFER_IN": "transfer",
    "TRANSFER_OUT": "transfer",
    "LOAN_PAYMENTS": "credit-card-payment",
    "BANK_FEES": "fees",
    "ENTERTAINMENT": "entertainment",
    "FOOD_AND_DRINK": "dining",
    "GENERAL_MERCHANDISE": "shopping",
    "HOME_IMPROVEMENT": "home-improvement",
    "MEDICAL": "health",
    "PERSONAL_CARE": "personal",
    "GENERAL_SERVICES": "fees",
    "GOVERNMENT_AND_NON_PROFIT": "taxes",
    "TRANSPORTATION": "transport",
    "TRAVEL": "travel",
    "RENT_AND_UTILITIES": "utilities",
}

#: Plaid detailed categories worth a more specific mapping than their primary.
PLAID_PFC_DETAILED_MAP: dict[str, str] = {
    "FOOD_AND_DRINK_GROCERIES": "groceries",
    "TRANSPORTATION_GAS": "fuel",
    "RENT_AND_UTILITIES_RENT": "housing",
    "RENT_AND_UTILITIES_INTERNET_AND_CABLE": "utilities",
    "INCOME_WAGES": "paycheck",
    "INCOME_INTEREST_EARNED": "interest",
    "GENERAL_SERVICES_INSURANCE": "insurance",
    "GENERAL_SERVICES_EDUCATION": "education",
}


def normalize_merchant(name: str) -> str:
    """Collapse a raw descriptor to a stable key.

    Card descriptors carry store numbers, dates, and payment-processor noise
    ("SQ *BLUE BOTTLE #123 06/14"). Stripping them is what lets merchant memory
    recognise the same merchant twice.
    """
    text = name.upper()
    text = re.sub(r"\b(SQ|TST|PY|PAYPAL|SP|POS|ACH|DEBIT|CREDIT)\s*\*?", " ", text)
    text = re.sub(r"[#*]\s*\w+", " ", text)
    text = re.sub(r"\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b", " ", text)
    text = re.sub(r"\b\d{4,}\b", " ", text)
    text = re.sub(r"[^A-Z0-9&' ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- rule engine

_STRING_FIELDS = {"name", "merchant_name", "notes"}
_NUMERIC_FIELDS = {"amount"}
_SUPPORTED_OPS = {
    "contains",
    "not_contains",
    "equals",
    "starts_with",
    "ends_with",
    "gt",
    "gte",
    "lt",
    "lte",
}


def validate_rule(conditions: dict[str, Any], actions: dict[str, Any]) -> None:
    """Reject a malformed rule at write time rather than silently never matching."""
    clauses = conditions.get("all") or conditions.get("any")
    if not clauses or not isinstance(clauses, list):
        raise ValidationError("A rule needs a non-empty 'all' or 'any' condition list.")

    for clause in clauses:
        field = clause.get("field")
        op = clause.get("op")
        if field not in _STRING_FIELDS | _NUMERIC_FIELDS:
            raise ValidationError(f"Unsupported rule field '{field}'.")
        if op not in _SUPPORTED_OPS:
            raise ValidationError(f"Unsupported rule operator '{op}'.")
        if "value" not in clause:
            raise ValidationError("Each rule condition needs a value.")
        if field in _NUMERIC_FIELDS and not isinstance(clause["value"], int):
            raise ValidationError("Amount conditions compare integer minor units.")

    if not actions:
        raise ValidationError("A rule needs at least one action.")


def _match_clause(transaction: Transaction, clause: dict[str, Any]) -> bool:
    field = clause["field"]
    op = clause["op"]
    expected = clause["value"]

    actual = getattr(transaction, field, None)
    if actual is None:
        return False

    if field in _NUMERIC_FIELDS:
        value = int(actual)
        match op:
            case "equals":
                return bool(value == expected)
            case "gt":
                return bool(value > expected)
            case "gte":
                return bool(value >= expected)
            case "lt":
                return bool(value < expected)
            case "lte":
                return bool(value <= expected)
            case _:
                return False

    haystack = str(actual).casefold()
    needle = str(expected).casefold()
    match op:
        case "contains":
            return needle in haystack
        case "not_contains":
            return needle not in haystack
        case "equals":
            return haystack == needle
        case "starts_with":
            return haystack.startswith(needle)
        case "ends_with":
            return haystack.endswith(needle)
        case _:
            return False


def rule_matches(transaction: Transaction, rule: Rule) -> bool:
    conditions = rule.conditions
    if clauses := conditions.get("all"):
        return all(_match_clause(transaction, c) for c in clauses)
    if clauses := conditions.get("any"):
        return any(_match_clause(transaction, c) for c in clauses)
    return False


def apply_actions(transaction: Transaction, rule: Rule) -> None:
    actions = rule.actions
    if category_id := actions.get("set_category_id"):
        transaction.category_id = UUID(str(category_id))
        transaction.category_source = "rule"
    if notes := actions.get("set_notes"):
        transaction.notes = notes
    if "exclude_from_budget" in actions:
        transaction.exclude_from_budget = bool(actions["exclude_from_budget"])
    if "is_hidden" in actions:
        transaction.is_hidden = bool(actions["is_hidden"])


# ------------------------------------------------------------- categorization


async def _merchant_memory(db: AsyncSession, user_id: str, merchant_name: str) -> UUID | None:
    """The category this merchant has most often been given by hand."""
    normalized = normalize_merchant(merchant_name)
    if not normalized:
        return None

    stmt = (
        select(Transaction.category_id, func.count().label("hits"))
        .where(
            Transaction.user_id == user_id,
            Transaction.category_id.is_not(None),
            Transaction.category_source == "user",
            Transaction.deleted_at.is_(None),
            func.upper(func.coalesce(Transaction.merchant_name, Transaction.name)).like(
                f"%{normalized}%"
            ),
        )
        .group_by(Transaction.category_id)
        .order_by(func.count().desc())
        .limit(1)
    )

    row = (await db.execute(stmt)).first()
    if row is None or row.hits < MERCHANT_MEMORY_THRESHOLD:
        return None
    return cast(UUID | None, row.category_id)


async def _category_by_slug(db: AsyncSession, user_id: str, slug: str) -> UUID | None:
    category_id: UUID | None = await db.scalar(
        select(Category.id).where(Category.user_id == user_id, Category.slug == slug)
    )
    return category_id


async def categorize(
    db: AsyncSession,
    user_id: str,
    transaction: Transaction,
    *,
    rules: list[Rule] | None = None,
) -> Transaction:
    """Apply the precedence chain to one transaction, in place.

    Pass `rules` when categorizing a batch so the rule set is fetched once.
    """
    # 1. A manual choice is final.
    if transaction.category_source == "user" and transaction.category_id is not None:
        return transaction

    # 2. User rules, highest priority first.
    if rules is None:
        rules = list(
            (
                await db.scalars(
                    select(Rule)
                    .where(Rule.user_id == user_id, Rule.is_active.is_(True))
                    .order_by(Rule.priority, Rule.created_at)
                )
            ).all()
        )

    for rule in rules:
        if rule_matches(transaction, rule):
            apply_actions(transaction, rule)
            return transaction

    # 3. Merchant memory.
    descriptor = transaction.merchant_name or transaction.name
    if descriptor:
        remembered = await _merchant_memory(db, user_id, descriptor)
        if remembered is not None:
            transaction.category_id = remembered
            transaction.category_source = "merchant"
            return transaction

    # 4. Plaid's taxonomy.
    slug = None
    if transaction.plaid_pfc_detailed:
        slug = PLAID_PFC_DETAILED_MAP.get(transaction.plaid_pfc_detailed)
    if slug is None and transaction.plaid_pfc_primary:
        slug = PLAID_PFC_MAP.get(transaction.plaid_pfc_primary)

    if slug:
        category_id = await _category_by_slug(db, user_id, slug)
        if category_id is not None:
            transaction.category_id = category_id
            transaction.category_source = "plaid"
            return transaction

    # 5. Leave uncategorized rather than guessing.
    return transaction
