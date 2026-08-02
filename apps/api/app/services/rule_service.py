"""User categorization rules."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.rule import Rule
from app.models.transaction import Transaction
from app.services.categorization import apply_actions, rule_matches, validate_rule


async def list_rules(db: AsyncSession, user_id: str) -> list[Rule]:
    return list(
        (
            await db.scalars(
                select(Rule).where(Rule.user_id == user_id).order_by(Rule.priority, Rule.created_at)
            )
        ).all()
    )


async def get_rule(db: AsyncSession, user_id: str, rule_id: UUID) -> Rule:
    rule = await db.scalar(select(Rule).where(Rule.id == rule_id, Rule.user_id == user_id))
    if rule is None:
        raise NotFoundError("Rule not found.")
    return rule


async def create_rule(
    db: AsyncSession,
    user_id: str,
    *,
    name: str,
    conditions: dict[str, Any],
    actions: dict[str, Any],
    priority: int = 100,
    is_active: bool = True,
) -> Rule:
    validate_rule(conditions, actions)

    rule = Rule(
        user_id=user_id,
        name=name,
        conditions=conditions,
        actions=actions,
        priority=priority,
        is_active=is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_rule(db: AsyncSession, user_id: str, rule_id: UUID, **changes: object) -> Rule:
    rule = await get_rule(db, user_id, rule_id)

    conditions = changes.get("conditions") or rule.conditions
    actions = changes.get("actions") or rule.actions
    validate_rule(conditions, actions)  # type: ignore[arg-type]

    for field, value in changes.items():
        if value is not None:
            setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, user_id: str, rule_id: UUID) -> None:
    rule = await get_rule(db, user_id, rule_id)
    await db.delete(rule)
    await db.commit()


async def preview_rule(
    db: AsyncSession, user_id: str, rule: Rule, *, limit: int = 200
) -> list[Transaction]:
    """Transactions this rule would match, without changing anything.

    A rule that silently recategorizes hundreds of transactions is alarming;
    the UI shows the blast radius first (PLAN.md section 7).
    """
    candidates = list(
        (
            await db.scalars(
                select(Transaction)
                .where(
                    Transaction.user_id == user_id,
                    Transaction.deleted_at.is_(None),
                    Transaction.is_split.is_(False),
                )
                .order_by(Transaction.date.desc())
                .limit(2000)
            )
        ).all()
    )

    return [t for t in candidates if rule_matches(t, rule)][:limit]


async def apply_rule(db: AsyncSession, user_id: str, rule_id: UUID) -> int:
    """Apply a rule to existing transactions. Returns the number changed.

    Manual categorizations are left alone: a new rule must not silently undo a
    choice the user already made by hand.
    """
    rule = await get_rule(db, user_id, rule_id)

    candidates = await db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.deleted_at.is_(None),
            Transaction.is_split.is_(False),
            Transaction.category_source.is_distinct_from("user"),
        )
    )

    changed = 0
    for transaction in candidates:
        if rule_matches(transaction, rule):
            apply_actions(transaction, rule)
            changed += 1

    rule.last_applied_at = datetime.now(UTC)
    await db.commit()
    return changed
