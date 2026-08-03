from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LinkTokenRequest(BaseModel):
    mode: Literal["connect", "update"] = "connect"
    # Required for update mode: which connection to re-authenticate.
    item_id: UUID | None = None


class LinkTokenResponse(BaseModel):
    link_token: str


class ExchangeRequest(BaseModel):
    public_token: str = Field(min_length=1, max_length=500)
    institution_id: str | None = Field(default=None, max_length=120)
    institution_name: str | None = Field(default=None, max_length=200)


class PlaidItemResponse(BaseModel):
    """Deliberately omits access_token_encrypted — it must never leave the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    institution_name: str | None
    institution_logo_url: str | None
    status: str
    last_successful_sync_at: datetime | None
    last_error_code: str | None
    consent_expires_at: datetime | None
    created_at: datetime

    @property
    def needs_reauth(self) -> bool:
        return self.status in {"login_required", "pending_expiration"}


class SyncRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plaid_item_id: UUID | None
    kind: str
    status: str
    added: int
    modified: int
    removed: int
    started_at: datetime
    finished_at: datetime | None
    error_code: str | None


class SyncResultResponse(BaseModel):
    added: int
    modified: int
    removed: int
    status: str
