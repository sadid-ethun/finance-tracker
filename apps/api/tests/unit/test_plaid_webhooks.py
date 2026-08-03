"""Webhook verification and classification.

The webhook endpoint is unauthenticated, so these rejection paths are the
security boundary — a forged request must never reach the sync logic.
"""

import hashlib
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.services.plaid.webhooks import (
    WebhookVerificationError,
    classify,
    verify_webhook,
)


@pytest.fixture
def keypair() -> tuple[ec.EllipticCurvePrivateKey, dict[str, str]]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_numbers = private_key.public_key().public_numbers()

    def b64(value: int) -> str:
        import base64

        return base64.urlsafe_b64encode(value.to_bytes(32, "big")).decode().rstrip("=")

    jwk = {
        "kty": "EC",
        "crv": "P-256",
        "x": b64(public_numbers.x),
        "y": b64(public_numbers.y),
        "kid": "test-key",
    }
    return private_key, jwk


def sign(private_key: ec.EllipticCurvePrivateKey, body: bytes, **overrides: object) -> str:
    claims: dict[str, object] = {
        "iat": int(time.time()),
        "request_body_sha256": hashlib.sha256(body).hexdigest(),
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": "test-key"})


@pytest.fixture(autouse=True)
def _stub_key(monkeypatch: pytest.MonkeyPatch, keypair) -> None:  # type: ignore[no-untyped-def]
    _, jwk = keypair
    key: dict[str, str] = jwk

    async def fake_key(key_id: str) -> dict[str, str]:
        return key

    monkeypatch.setattr("app.services.plaid.webhooks._verification_key", fake_key)


async def test_valid_webhook_is_accepted(keypair) -> None:  # type: ignore[no-untyped-def]
    private_key, _ = keypair
    body = json.dumps({"webhook_type": "TRANSACTIONS"}).encode()

    payload = await verify_webhook(body, sign(private_key, body))

    assert payload["webhook_type"] == "TRANSACTIONS"


async def test_missing_signature_is_rejected() -> None:
    with pytest.raises(WebhookVerificationError):
        await verify_webhook(b"{}", None)


async def test_tampered_body_is_rejected(keypair) -> None:  # type: ignore[no-untyped-def]
    """The signature covers a body hash — swapping the body must fail."""
    private_key, _ = keypair
    signed_body = json.dumps({"item_id": "real"}).encode()
    signature = sign(private_key, signed_body)

    forged_body = json.dumps({"item_id": "attacker"}).encode()

    with pytest.raises(WebhookVerificationError):
        await verify_webhook(forged_body, signature)


async def test_signature_from_another_key_is_rejected(keypair) -> None:  # type: ignore[no-untyped-def]
    _, _ = keypair
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    body = b"{}"

    with pytest.raises(WebhookVerificationError):
        await verify_webhook(body, sign(attacker_key, body))


async def test_stale_webhook_is_rejected(keypair) -> None:  # type: ignore[no-untyped-def]
    """Replaying a captured request later must not work."""
    private_key, _ = keypair
    body = b"{}"
    old = sign(private_key, body, iat=int(time.time()) - 3600)

    with pytest.raises(WebhookVerificationError):
        await verify_webhook(body, old)


async def test_unsigned_token_is_rejected(keypair) -> None:  # type: ignore[no-untyped-def]
    """alg=none must never be honoured."""
    body = b"{}"
    unsigned = jwt.encode(
        {"iat": int(time.time()), "request_body_sha256": hashlib.sha256(body).hexdigest()},
        key="",
        algorithm="none",
        headers={"kid": "test-key"},
    )

    with pytest.raises(WebhookVerificationError):
        await verify_webhook(body, unsigned)


async def test_garbage_signature_is_rejected() -> None:
    with pytest.raises(WebhookVerificationError):
        await verify_webhook(b"{}", "not-a-jwt")


# ------------------------------------------------------------- classification


def test_sync_codes_trigger_sync() -> None:
    assert (
        classify({"webhook_type": "TRANSACTIONS", "webhook_code": "SYNC_UPDATES_AVAILABLE"})
        == "sync"
    )
    assert (
        classify({"webhook_type": "TRANSACTIONS", "webhook_code": "TRANSACTIONS_REMOVED"}) == "sync"
    )


def test_item_errors_trigger_reauth() -> None:
    assert classify({"webhook_type": "ITEM", "webhook_code": "ITEM_LOGIN_REQUIRED"}) == "reauth"
    assert classify({"webhook_type": "ITEM", "webhook_code": "PENDING_EXPIRATION"}) == "reauth"


def test_unknown_webhooks_are_ignored() -> None:
    assert classify({"webhook_type": "INCOME", "webhook_code": "WHATEVER"}) == "ignore"
    assert classify({}) == "ignore"
