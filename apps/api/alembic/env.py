import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import get_settings

# Importing the models package populates Base.metadata for autogenerate.
from app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Single source of truth for the connection string.
config.set_main_option("sqlalchemy.url", str(get_settings().database_url))

target_metadata = Base.metadata

# Better Auth tables that exist in the database but are deliberately not mapped
# as SQLAlchemy models. Without this filter, autogenerate sees them as "removed"
# and emits DROP TABLE for the entire auth schema. They are still created and
# altered by hand-written migrations — this only hides them from autogenerate.
UNMANAGED_TABLES = frozenset({"session", "auth_account", "verification", "jwks", "twoFactor"})

# Expression indexes that SQLAlchemy cannot express as model metadata. Without
# this, autogenerate reports them as "removed" and emits DROP INDEX — which for
# the full-text index would silently turn search into a sequential scan.
UNMANAGED_INDEXES = frozenset({"ix_transactions_search"})


def include_object(
    obj: object, name: str | None, type_: str, reflected: bool, compare_to: object
) -> bool:
    if type_ == "table":
        return name not in UNMANAGED_TABLES
    if type_ == "index":
        if name in UNMANAGED_INDEXES:
            return False
        # Indexes belonging to those tables must be skipped for the same reason.
        owning_table = getattr(getattr(obj, "table", None), "name", None)
        return owning_table not in UNMANAGED_TABLES
    return True


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live connection."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
