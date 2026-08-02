"""Category management and the default taxonomy.

Defaults are seeded per user rather than shared globally so the owner can
rename, recolour, or archive any of them without the code needing a special
case for "system" rows.
"""

from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.category import Category
from app.models.transaction import Transaction

# (slug, name, kind, icon, colour). Order here is the display order.
DEFAULT_CATEGORIES: list[tuple[str, str, str, str, str]] = [
    # Income
    ("income", "Income", "income", "banknote", "#177245"),
    ("paycheck", "Paycheck", "income", "wallet", "#177245"),
    ("interest", "Interest", "income", "percent", "#3e7c59"),
    ("refunds", "Refunds", "income", "undo", "#3e7c59"),
    # Expenses
    ("groceries", "Groceries", "expense", "shopping-cart", "#0f5132"),
    ("dining", "Dining & Drinks", "expense", "utensils", "#3e7c59"),
    ("housing", "Rent & Mortgage", "expense", "home", "#7fa88f"),
    ("utilities", "Utilities", "expense", "zap", "#c2a878"),
    ("transport", "Transport", "expense", "car", "#5b7c99"),
    ("fuel", "Gas & Fuel", "expense", "fuel", "#5b7c99"),
    ("shopping", "Shopping", "expense", "shopping-bag", "#7c6a9e"),
    ("entertainment", "Entertainment", "expense", "film", "#7c6a9e"),
    ("subscriptions", "Subscriptions", "expense", "repeat", "#7c6a9e"),
    ("health", "Health & Fitness", "expense", "heart-pulse", "#b4372e"),
    ("insurance", "Insurance", "expense", "shield", "#5b7c99"),
    ("travel", "Travel", "expense", "plane", "#c2a878"),
    ("education", "Education", "expense", "graduation-cap", "#3e7c59"),
    ("personal", "Personal Care", "expense", "sparkles", "#7c6a9e"),
    ("home-improvement", "Home & Garden", "expense", "hammer", "#7fa88f"),
    ("gifts", "Gifts & Donations", "expense", "gift", "#b4372e"),
    ("fees", "Fees & Charges", "expense", "receipt", "#6b7280"),
    ("taxes", "Taxes", "expense", "landmark", "#6b7280"),
    ("uncategorized", "Uncategorized", "expense", "circle-help", "#6b7280"),
    # Transfers are excluded from income and spending totals.
    ("transfer", "Transfer", "transfer", "arrow-left-right", "#6b7280"),
    ("credit-card-payment", "Credit Card Payment", "transfer", "credit-card", "#6b7280"),
]


async def seed_default_categories(db: AsyncSession, user_id: str) -> list[Category]:
    """Create the default taxonomy for a user. Idempotent."""
    existing = set(
        (await db.scalars(select(Category.slug).where(Category.user_id == user_id))).all()
    )

    created: list[Category] = []
    for order, (slug, name, kind, icon, color) in enumerate(DEFAULT_CATEGORIES):
        if slug in existing:
            continue
        category = Category(
            user_id=user_id,
            slug=slug,
            name=name,
            kind=kind,
            icon=icon,
            color=color,
            is_system=True,
            display_order=order,
        )
        db.add(category)
        created.append(category)

    await db.flush()
    return created


async def ensure_categories(db: AsyncSession, user_id: str) -> None:
    """Seed defaults the first time a user touches categories."""
    count = await db.scalar(select(Category.id).where(Category.user_id == user_id).limit(1))
    if count is None:
        await seed_default_categories(db, user_id)
        await db.commit()


async def list_categories(
    db: AsyncSession, user_id: str, *, include_archived: bool = False
) -> list[Category]:
    await ensure_categories(db, user_id)

    stmt = select(Category).where(Category.user_id == user_id)
    if not include_archived:
        stmt = stmt.where(Category.is_archived.is_(False))
    stmt = stmt.order_by(Category.display_order, Category.name)

    return list((await db.scalars(stmt)).all())


async def get_category(db: AsyncSession, user_id: str, category_id: UUID) -> Category:
    category = await db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if category is None:
        raise NotFoundError("Category not found.")
    return category


async def create_category(
    db: AsyncSession,
    user_id: str,
    *,
    name: str,
    slug: str,
    kind: str,
    icon: str | None = None,
    color: str | None = None,
    parent_id: UUID | None = None,
) -> Category:
    clash = await db.scalar(
        select(Category).where(Category.user_id == user_id, Category.slug == slug)
    )
    if clash is not None:
        raise ConflictError(f"A category with slug '{slug}' already exists.")

    if parent_id is not None:
        parent = await get_category(db, user_id, parent_id)
        # One level of nesting only (PLAN.md section 5).
        if parent.parent_id is not None:
            raise ValidationError("Categories can only nest one level deep.")

    category = Category(
        user_id=user_id,
        name=name,
        slug=slug,
        kind=kind,
        icon=icon,
        color=color,
        parent_id=parent_id,
        is_system=False,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def update_category(
    db: AsyncSession, user_id: str, category_id: UUID, **changes: object
) -> Category:
    category = await get_category(db, user_id, category_id)

    for field, value in changes.items():
        if value is not None:
            setattr(category, field, value)

    await db.commit()
    await db.refresh(category)
    return category


async def delete_category(
    db: AsyncSession, user_id: str, category_id: UUID, *, reassign_to: UUID | None
) -> None:
    """Delete a category, moving any transactions to `reassign_to`.

    Refuses to orphan transactions: if the category is in use, a destination is
    required. This is a hard delete of the category itself, not a soft delete,
    because a dangling category has no meaning.
    """
    category = await get_category(db, user_id, category_id)

    if category.is_system:
        raise ValidationError("System categories cannot be deleted. Archive it instead.")

    in_use = await db.scalar(
        select(Transaction.id)
        .where(Transaction.category_id == category_id, Transaction.user_id == user_id)
        .limit(1)
    )

    if in_use is not None:
        if reassign_to is None:
            raise ValidationError(
                "This category is in use. Provide reassign_to to move its transactions."
            )
        destination = await get_category(db, user_id, reassign_to)
        await db.execute(
            update(Transaction)
            .where(
                Transaction.category_id == category_id,
                Transaction.user_id == user_id,
            )
            .values(category_id=destination.id)
        )

    await db.delete(category)
    await db.commit()
