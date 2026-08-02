from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.schemas.rule import RuleCreate, RuleResponse, RuleUpdate
from app.schemas.transaction import TransactionResponse
from app.services import rule_service

router = APIRouter(prefix="/rules", tags=["rules"])


@router.get("", response_model=list[RuleResponse])
async def list_rules(user: CurrentUser, db: DbSession) -> list[RuleResponse]:
    rules = await rule_service.list_rules(db, user.id)
    return [RuleResponse.model_validate(r) for r in rules]


@router.post("", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: RuleCreate,
    user: CurrentUser,
    db: DbSession,
    apply_to_existing: Annotated[bool, Query()] = False,
) -> RuleResponse:
    rule = await rule_service.create_rule(db, user.id, **payload.model_dump())
    if apply_to_existing:
        await rule_service.apply_rule(db, user.id, rule.id)
    return RuleResponse.model_validate(rule)


@router.patch("/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: UUID, payload: RuleUpdate, user: CurrentUser, db: DbSession
) -> RuleResponse:
    rule = await rule_service.update_rule(
        db, user.id, rule_id, **payload.model_dump(exclude_unset=True)
    )
    return RuleResponse.model_validate(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: UUID, user: CurrentUser, db: DbSession) -> None:
    await rule_service.delete_rule(db, user.id, rule_id)


@router.post("/{rule_id}/preview", response_model=list[TransactionResponse])
async def preview_rule(
    rule_id: UUID, user: CurrentUser, db: DbSession
) -> list[TransactionResponse]:
    """Show what a rule would match, changing nothing.

    A rule that silently recategorizes hundreds of transactions is alarming;
    the blast radius is shown before it is applied.
    """
    rule = await rule_service.get_rule(db, user.id, rule_id)
    matches = await rule_service.preview_rule(db, user.id, rule)
    return [TransactionResponse.model_validate(t) for t in matches]


@router.post("/{rule_id}/apply", response_model=dict[str, int])
async def apply_rule(rule_id: UUID, user: CurrentUser, db: DbSession) -> dict[str, int]:
    """Apply to existing transactions, skipping manual categorizations."""
    changed = await rule_service.apply_rule(db, user.id, rule_id)
    return {"updated": changed}
