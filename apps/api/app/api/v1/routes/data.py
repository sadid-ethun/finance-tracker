from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.errors import ValidationError
from app.deps import CurrentUser, DbSession
from app.models.audit import UserPreferences
from app.services import audit_service, data_service

router = APIRouter(tags=["data"])

#: Refuse anything larger than this rather than buffering it into memory.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class PreferencesResponse(BaseModel):
    currency: str
    theme: str
    week_starts_on: int
    timezone: str


class PreferencesUpdate(BaseModel):
    currency: str | None = None
    theme: str | None = None
    week_starts_on: int | None = None
    timezone: str | None = None


class AuditEntry(BaseModel):
    id: str
    action: str
    entity_type: str
    entity_id: str | None
    created_at: datetime


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]
    account_id: str


@router.get("/data/export", response_class=PlainTextResponse)
async def export_data(
    user: CurrentUser,
    db: DbSession,
    format: Annotated[str, Query(pattern=r"^(csv|json)$")] = "csv",
) -> Any:
    """Download everything. CSV writes major units; JSON preserves minor units."""
    if format == "json":
        import json

        payload = await data_service.export_json(db, user.id)
        return PlainTextResponse(
            json.dumps(payload, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="finance-export-{date.today()}.json"'
                )
            },
        )

    csv_text = await data_service.export_transactions(db, user.id)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": (f'attachment; filename="transactions-{date.today()}.csv"')
        },
    )


@router.post("/data/import/detect", response_model=dict[str, str | None])
async def detect_import_columns(
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
) -> dict[str, str | None]:
    """Guess the column mapping so the user confirms rather than types it."""
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValidationError("That file is too large (10 MB maximum).")

    return data_service.detect_columns(raw.decode("utf-8-sig", errors="replace"))


@router.post("/data/import", response_model=ImportResult)
async def import_data(
    user: CurrentUser,
    db: DbSession,
    file: Annotated[UploadFile, File()],
    account_id: Annotated[UUID, Form()],
    mapping: Annotated[str, Form()],
    invert_amounts: Annotated[bool, Form()] = False,
) -> ImportResult:
    """Import a CSV into one account using a confirmed column mapping."""
    import json

    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValidationError("That file is too large (10 MB maximum).")

    try:
        column_map = json.loads(mapping)
    except ValueError as exc:
        raise ValidationError("Column mapping must be valid JSON.") from exc

    result = await data_service.import_transactions(
        db,
        user.id,
        csv_text=raw.decode("utf-8-sig", errors="replace"),
        account_id=account_id,
        mapping=column_map,
        invert_amounts=invert_amounts,
    )

    await audit_service.record(
        db,
        user.id,
        action="import.transactions",
        entity_type="transaction",
        after={"imported": result["imported"], "skipped": result["skipped"]},
    )
    await db.commit()

    return ImportResult(**result)


@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(user: CurrentUser, db: DbSession) -> PreferencesResponse:
    prefs = await _ensure_preferences(db, user.id)
    return PreferencesResponse.model_validate(prefs, from_attributes=True)


@router.patch("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    payload: PreferencesUpdate, user: CurrentUser, db: DbSession
) -> PreferencesResponse:
    prefs = await _ensure_preferences(db, user.id)

    if payload.theme is not None and payload.theme not in {"system", "light", "dark"}:
        raise ValidationError("Theme must be system, light, or dark.")
    if payload.week_starts_on is not None and payload.week_starts_on not in (0, 1):
        raise ValidationError("Week must start on Sunday (0) or Monday (1).")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(prefs, field, value)

    await db.commit()
    return PreferencesResponse.model_validate(prefs, from_attributes=True)


@router.get("/audit-log", response_model=list[AuditEntry])
async def audit_log(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AuditEntry]:
    rows = await audit_service.recent(db, user.id, limit=limit)
    return [
        AuditEntry(
            id=str(r.id),
            action=r.action,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            created_at=r.created_at,
        )
        for r in rows
    ]


async def _ensure_preferences(db: DbSession, user_id: str) -> UserPreferences:
    prefs = await db.scalar(select(UserPreferences).where(UserPreferences.user_id == user_id))
    if prefs is None:
        prefs = UserPreferences(user_id=user_id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return prefs
