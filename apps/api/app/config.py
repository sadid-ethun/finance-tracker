from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from the environment.

    Validation happens at startup so a misconfigured deploy fails immediately
    rather than on the first request that touches the missing value.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["local", "test", "staging", "production"] = "local"
    debug: bool = False
    version: str = "0.1.0"

    database_url: PostgresDsn = Field(
        default=PostgresDsn("postgresql+asyncpg://finance:finance@localhost:5432/finance"),
    )
    redis_url: str = "redis://localhost:6379/0"

    @field_validator("database_url", mode="before")
    @classmethod
    def _force_async_driver(cls, value: object) -> object:
        """Accept a plain postgres URL and route it to the async driver.

        The web app's `pg` client and Alembic/SQLAlchemy read the same
        DATABASE_URL, but only SQLAlchemy wants the `+asyncpg` suffix. Adding it
        here keeps one connection string in the environment.
        """
        if isinstance(value, str) and value.startswith("postgres"):
            scheme, _, rest = value.partition("://")
            if "+" not in scheme:
                return f"postgresql+asyncpg://{rest}"
        return value

    # Comma-separated in the environment, e.g. "http://localhost:3000".
    cors_origins: list[str] = ["http://localhost:3000"]

    # ---- auth -------------------------------------------------------------
    # Base URL of the web app, which hosts Better Auth and serves the JWKS.
    web_url: str = "http://localhost:3000"
    jwt_audience: str = "finance-tracker-api"
    # How long to cache the fetched public keys before refetching.
    jwks_cache_seconds: int = 3600

    # ---- plaid ------------------------------------------------------------
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: Literal["sandbox", "production"] = "sandbox"
    # Comma-separated. The first key encrypts; the rest only decrypt, which is
    # what makes key rotation possible without downtime.
    plaid_encryption_key: str = ""
    # Public URL Plaid posts webhooks to. Empty locally, where there is no
    # inbound route from the internet.
    plaid_webhook_url: str = ""
    plaid_products: list[str] = ["transactions"]
    plaid_country_codes: list[str] = ["US"]
    #: How much history to pull when an item is first connected.
    plaid_initial_backfill_days: int = 730

    @property
    def plaid_encryption_keys(self) -> list[str]:
        return [k for k in self.plaid_encryption_key.split(",") if k.strip()]

    @property
    def plaid_configured(self) -> bool:
        return bool(self.plaid_client_id and self.plaid_secret)

    @property
    def jwks_url(self) -> str:
        return f"{self.web_url.rstrip('/')}/api/auth/jwks"

    @property
    def jwt_issuer(self) -> str:
        return self.web_url.rstrip("/")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so settings are parsed once per process."""
    return Settings()
