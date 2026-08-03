"""Plaid API client.

The only module that ever sees a decrypted access token. Everything above this
layer passes a PlaidItem and lets this module handle the credential.

plaid-python is synchronous, so calls run in a worker thread to avoid blocking
the event loop.
"""

import asyncio
from functools import lru_cache
from typing import Any

import plaid
from plaid.api import plaid_api

from app.config import Settings, get_settings
from app.core.crypto import decrypt
from app.core.errors import AppError, ExternalServiceError
from app.core.logging import get_logger

logger = get_logger(__name__)

_HOSTS = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}


class PlaidNotConfiguredError(AppError):
    status_code = 503
    code = "PLAID_NOT_CONFIGURED"
    title = "Service Unavailable"


class PlaidError(ExternalServiceError):
    """A Plaid API failure, carrying Plaid's own error code for the client."""

    code = "PLAID_ERROR"

    def __init__(self, detail: str, plaid_error_code: str | None = None) -> None:
        super().__init__(detail, plaid_error_code=plaid_error_code)
        self.plaid_error_code = plaid_error_code


#: Errors meaning the user must re-authenticate; the item is not broken forever.
REAUTH_ERROR_CODES = frozenset({"ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ITEM_LOCKED"})
#: Errors that are transient — retry rather than surfacing to the user.
TRANSIENT_ERROR_CODES = frozenset(
    {
        "RATE_LIMIT_EXCEEDED",
        "PRODUCT_NOT_READY",
        "INSTITUTION_DOWN",
        "INSTITUTION_NOT_RESPONDING",
        "INTERNAL_SERVER_ERROR",
        "PLANNED_MAINTENANCE",
    }
)


@lru_cache
def _api(settings: Settings | None = None) -> plaid_api.PlaidApi:
    settings = settings or get_settings()

    if not settings.plaid_configured:
        raise PlaidNotConfiguredError("PLAID_CLIENT_ID and PLAID_SECRET are not set.")

    configuration = plaid.Configuration(
        host=_HOSTS[settings.plaid_env],
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


def parse_plaid_exception(exc: plaid.ApiException) -> PlaidError:
    """Turn Plaid's JSON error body into our error type."""
    import json

    error_code = None
    message = "Plaid request failed."
    try:
        body = json.loads(exc.body or "{}")
        error_code = body.get("error_code")
        message = body.get("error_message") or message
    except (ValueError, TypeError):  # pragma: no cover - malformed body
        pass

    return PlaidError(message, plaid_error_code=error_code)


async def call(method_name: str, request: Any) -> dict[str, Any]:
    """Invoke a Plaid endpoint off the event loop.

    Returns the response as a plain dict so nothing above this layer depends on
    plaid-python's model classes.
    """
    api = _api()
    method = getattr(api, method_name)

    def _invoke() -> Any:
        try:
            return method(request)
        except plaid.ApiException as exc:
            raise parse_plaid_exception(exc) from exc

    response = await asyncio.to_thread(_invoke)
    return response.to_dict()  # type: ignore[no-any-return]


def access_token_for(item: Any) -> str:
    """Decrypt an item's access token. Never log or return the result."""
    return decrypt(item.access_token_encrypted)
