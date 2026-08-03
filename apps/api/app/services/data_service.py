"""CSV import and export.

Export writes major units with an explicit currency column, because a CSV is
read by humans and spreadsheets — this is the one boundary where minor units
would be actively unhelpful. Import reverses it through Decimal, never float.
"""

import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.core.money import to_major_units, to_minor_units
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.services.categorization import categorize
from app.services.transaction_service import TransactionFilters, _base_query

#: U+00A0. Written as chr() so the source has no ambiguous literal, and so a
#: future formatter cannot silently normalise it into an ordinary space.
NON_BREAKING_SPACE = chr(0xA0)

EXPORT_COLUMNS = [
    "date",
    "description",
    "merchant",
    "amount",
    "currency",
    "category",
    "account",
    "notes",
    "is_transfer",
    "is_split_child",
    "pending",
]

#: Header aliases people actually have in their bank exports.
IMPORT_ALIASES: dict[str, set[str]] = {
    "date": {"date", "transaction date", "posted date", "posting date"},
    "description": {"description", "name", "payee", "memo", "details"},
    "amount": {"amount", "value", "debit/credit"},
    "category": {"category"},
    "notes": {"notes", "note", "comment"},
    "merchant": {"merchant", "merchant name"},
}


async def export_transactions(
    db: AsyncSession, user_id: str, *, include_hidden: bool = False
) -> str:
    """All transactions as CSV, newest first."""
    stmt = _base_query(user_id, TransactionFilters(include_hidden=include_hidden)).order_by(
        Transaction.date.desc()
    )

    rows = list((await db.scalars(stmt)).all())

    categories = {
        c.id: c.name
        for c in (await db.scalars(select(Category).where(Category.user_id == user_id))).all()
    }
    accounts = {
        a.id: a.name
        for a in (await db.scalars(select(Account).where(Account.user_id == user_id))).all()
    }

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(EXPORT_COLUMNS)

    for t in rows:
        writer.writerow(
            [
                t.date.isoformat(),
                t.name,
                t.merchant_name or "",
                # Major units for the humans and spreadsheets reading this.
                f"{to_major_units(t.amount):.2f}",
                t.currency,
                categories.get(t.category_id, "") if t.category_id else "",
                accounts.get(t.account_id, ""),
                t.notes or "",
                "yes" if t.is_transfer else "",
                "yes" if t.parent_transaction_id else "",
                "yes" if t.pending else "",
            ]
        )

    return buffer.getvalue()


async def export_json(db: AsyncSession, user_id: str) -> dict[str, Any]:
    """Everything the user owns, for backup or migration elsewhere."""
    accounts = list((await db.scalars(select(Account).where(Account.user_id == user_id))).all())
    categories = list((await db.scalars(select(Category).where(Category.user_id == user_id))).all())
    transactions = list(
        (await db.scalars(_base_query(user_id, TransactionFilters(include_hidden=True)))).all()
    )

    return {
        "exported_at": datetime.now().isoformat(),
        "accounts": [
            {
                "id": str(a.id),
                "name": a.name,
                "type": a.type,
                "balance_current": a.balance_current,
                "currency": a.currency,
                "is_manual": a.is_manual,
            }
            for a in accounts
        ],
        "categories": [
            {"id": str(c.id), "name": c.name, "slug": c.slug, "kind": c.kind} for c in categories
        ],
        "transactions": [
            {
                "id": str(t.id),
                "account_id": str(t.account_id),
                "date": t.date.isoformat(),
                "name": t.name,
                "merchant_name": t.merchant_name,
                "amount": t.amount,
                "currency": t.currency,
                "category_id": str(t.category_id) if t.category_id else None,
                "notes": t.notes,
                "is_transfer": t.is_transfer,
            }
            for t in transactions
        ],
    }


def _normalize_header(header: str) -> str | None:
    cleaned = header.strip().lower().lstrip("﻿")
    for field, aliases in IMPORT_ALIASES.items():
        if cleaned in aliases:
            return field
    return None


def detect_columns(csv_text: str) -> dict[str, str | None]:
    """Guess which column is which, for the mapping UI to confirm."""
    reader = csv.reader(io.StringIO(csv_text))
    try:
        headers = next(reader)
    except StopIteration as exc:
        raise ValidationError("That file is empty.") from exc

    mapping: dict[str, str | None] = dict.fromkeys(IMPORT_ALIASES)
    for header in headers:
        field = _normalize_header(header)
        if field and mapping[field] is None:
            mapping[field] = header
    return mapping


def _parse_date(value: str) -> date:
    text = value.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValidationError(f"Could not read the date '{value}'.")


def _parse_amount(value: str) -> int:
    """Parse a CSV amount into signed minor units.

    Handles currency symbols, thousands separators, and accounting-style
    parentheses for negatives, which spreadsheets emit routinely.
    """
    # Strip ordinary AND non-breaking spaces: European exports use U+00A0
    # as a thousands separator, and stripping only one leaves the other.
    text = value.strip()
    for junk in (",", "$", NON_BREAKING_SPACE, " "):
        text = text.replace(junk, "")
    if not text:
        raise ValidationError("Missing amount.")

    negative = text.startswith("(") and text.endswith(")")
    if negative:
        text = text[1:-1]

    try:
        amount = to_minor_units(Decimal(text))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError(f"Could not read the amount '{value}'.") from exc

    return -abs(amount) if negative else amount


async def import_transactions(
    db: AsyncSession,
    user_id: str,
    *,
    csv_text: str,
    account_id: UUID,
    mapping: dict[str, str],
    invert_amounts: bool = False,
) -> dict[str, Any]:
    """Import rows into one account.

    `invert_amounts` exists because many banks export spending as positive.
    Applying it here rather than guessing keeps the sign convention explicit
    and reversible.
    """
    account = await db.scalar(
        select(Account).where(
            Account.id == account_id,
            Account.user_id == user_id,
            Account.deleted_at.is_(None),
        )
    )
    if account is None:
        raise ValidationError("Unknown account.")

    if not mapping.get("date") or not mapping.get("amount"):
        raise ValidationError("A date column and an amount column are required.")

    categories = {
        c.name.casefold(): c.id
        for c in (await db.scalars(select(Category).where(Category.user_id == user_id))).all()
    }

    reader = csv.DictReader(io.StringIO(csv_text))
    imported = 0
    skipped = 0
    errors: list[str] = []

    for line_number, row in enumerate(reader, start=2):
        try:
            when = _parse_date(row[mapping["date"]])
            amount = _parse_amount(row[mapping["amount"]])
            if invert_amounts:
                amount = -amount

            description_col = mapping.get("description")
            name = (row.get(description_col or "") or "").strip() or "Imported transaction"

            category_col = mapping.get("category")
            category_name = (row.get(category_col or "") or "").strip().casefold()

            transaction = Transaction(
                user_id=user_id,
                account_id=account.id,
                amount=amount,
                currency=account.currency,
                date=when,
                name=name[:300],
                merchant_name=(row.get(mapping.get("merchant") or "") or "").strip() or None,
                notes=(row.get(mapping.get("notes") or "") or "").strip() or None,
                category_id=categories.get(category_name),
                category_source="user" if categories.get(category_name) else None,
                is_manual=True,
            )

            if transaction.category_id is None:
                await categorize(db, user_id, transaction)

            db.add(transaction)
            imported += 1

        except ValidationError as exc:
            skipped += 1
            # Cap the report: a mis-mapped column would otherwise produce one
            # error per row and a response nobody can read.
            if len(errors) < 20:
                errors.append(f"Row {line_number}: {exc.detail}")
        except (KeyError, TypeError):
            skipped += 1
            if len(errors) < 20:
                errors.append(f"Row {line_number}: missing a mapped column.")

    await db.commit()

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "account_id": str(account.id),
    }
