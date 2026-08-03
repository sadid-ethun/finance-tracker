"""Plaid webhook verification and dispatch.

The webhook endpoint is unauthenticated — Plaid has no session — so the
signature *is* the authentication. Every request is verified against Plaid's
public key before its body is trusted (PLAN.md section 9).

Handling is deliberately trivial: verify, enqueue, return 200. Plaid retries on
a non-2xx and treats a slow handler as a failure, so doing the sync inline
would cause duplicate deliveries.
"""

import hashlib
import json
import time
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey
from plaid.model.webhook_verification_key_get_request import (
    WebhookVerificationKeyGetRequest,
)

from app.core.errors import AppError
from app.core.logging import get_logger
from app.services.plaid import client

logger = get_logger(__name__)

#: Reject anything older than this, so a captured request cannot be replayed.
MAX_AGE_SECONDS = 300

_key_cache: dict[str, dict[str, Any]] = {}


class WebhookVerificationError(AppError):
    status_code = 401
    code = "WEBHOOK_VERIFICATION_FAILED"
    title = "Unauthorized"


async def _verification_key(key_id: str) -> dict[str, Any]:
    if key_id in _key_cache:
        return _key_cache[key_id]

    response = await client.call(
        "webhook_verification_key_get",
        WebhookVerificationKeyGetRequest(key_id=key_id),
    )
    key = response["key"]
    _key_cache[key_id] = key
    return key  # type: ignore[no-any-return]


async def verify_webhook(body: bytes, signature_header: str | None) -> dict[str, Any]:
    """Verify the Plaid-Verification JWT and return the decoded webhook body.

    Checks, in order: a signature is present, its key is one of Plaid's, the
    ES256 signature is valid, the request is recent, and the body hash matches
    what was signed. Any failure raises rather than returning a partial result.
    """
    if not signature_header:
        raise WebhookVerificationError("Missing Plaid-Verification header.")

    try:
        header = jwt.get_unverified_header(signature_header)
    except jwt.InvalidTokenError as exc:
        raise WebhookVerificationError("Malformed verification token.") from exc

    if header.get("alg") != "ES256":
        # Never let the token pick its own algorithm.
        raise WebhookVerificationError("Unexpected signature algorithm.")

    key_id = header.get("kid")
    if not key_id:
        raise WebhookVerificationError("Verification token has no key id.")

    try:
        jwk = await _verification_key(key_id)
    except client.PlaidError as exc:
        raise WebhookVerificationError("Could not fetch verification key.") from exc

    try:
        loaded = jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(jwk))
        # from_jwk is typed as returning either half of the pair; a JWK from
        # Plaid is always public, and signing with a private key here would be
        # a bug worth failing loudly on.
        if not isinstance(loaded, EllipticCurvePublicKey):
            raise WebhookVerificationError("Verification key is not a public key.")
        claims = jwt.decode(signature_header, loaded, algorithms=["ES256"])
    except jwt.InvalidTokenError as exc:
        raise WebhookVerificationError("Invalid webhook signature.") from exc

    issued_at = claims.get("iat", 0)
    if time.time() - issued_at > MAX_AGE_SECONDS:
        raise WebhookVerificationError("Webhook is too old.")

    expected_hash = claims.get("request_body_sha256")
    actual_hash = hashlib.sha256(body).hexdigest()
    # Constant-time: this comparison decides whether the body is authentic.
    if not expected_hash or not _constant_time_equals(expected_hash, actual_hash):
        raise WebhookVerificationError("Webhook body does not match its signature.")

    return json.loads(body)  # type: ignore[no-any-return]


def _constant_time_equals(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a, b)


#: Webhook codes that should trigger a transaction sync.
SYNC_CODES = frozenset(
    {"SYNC_UPDATES_AVAILABLE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "DEFAULT_UPDATE"}
)
#: Codes meaning the connection needs the user's attention.
REAUTH_CODES = frozenset({"ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ERROR"})


def classify(payload: dict[str, Any]) -> str:
    """Map a webhook to the action it should trigger."""
    webhook_type = payload.get("webhook_type")
    webhook_code = payload.get("webhook_code")

    if webhook_type == "TRANSACTIONS":
        if webhook_code in SYNC_CODES:
            return "sync"
        if webhook_code == "TRANSACTIONS_REMOVED":
            return "sync"
    if webhook_type == "ITEM":
        if webhook_code in REAUTH_CODES:
            return "reauth"
        if webhook_code == "NEW_ACCOUNTS_AVAILABLE":
            return "new_accounts"

    return "ignore"
