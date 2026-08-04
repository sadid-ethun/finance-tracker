"""Tests for JWT verification.

These use a locally generated Ed25519 keypair rather than a live JWKS endpoint,
so they exercise the real decode path with no network.
"""

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.config import Settings
from app.core.security import UnauthenticatedError, decode_token

ISSUER = "http://localhost:3000"
AUDIENCE = "finance-tracker-api"


@pytest.fixture
def keypair() -> tuple[Ed25519PrivateKey, Any]:
    private_key = Ed25519PrivateKey.generate()
    return private_key, private_key.public_key()


@pytest.fixture
def settings() -> Settings:
    return Settings(environment="test", web_url=ISSUER, jwt_audience=AUDIENCE)


def make_token(private_key: Ed25519PrivateKey, **overrides: Any) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": "user_123",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": now,
        "exp": now + 300,
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="EdDSA")


def decode_with(public_key: Any, token: str, settings: Settings) -> dict[str, Any]:
    """Decode using a known public key, bypassing the JWKS fetch."""
    return jwt.decode(
        token,
        public_key,
        algorithms=["EdDSA"],
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
        options={"require": ["exp", "sub", "iss", "aud"]},
    )


def test_valid_token_decodes(keypair: tuple[Ed25519PrivateKey, Any], settings: Settings) -> None:
    private_key, public_key = keypair
    claims = decode_with(public_key, make_token(private_key), settings)

    assert claims["sub"] == "user_123"


def test_expired_token_is_rejected(
    keypair: tuple[Ed25519PrivateKey, Any], settings: Settings
) -> None:
    private_key, public_key = keypair
    token = make_token(private_key, exp=int(time.time()) - 10)

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_with(public_key, token, settings)


def test_wrong_audience_is_rejected(
    keypair: tuple[Ed25519PrivateKey, Any], settings: Settings
) -> None:
    private_key, public_key = keypair
    token = make_token(private_key, aud="some-other-service")

    with pytest.raises(jwt.InvalidAudienceError):
        decode_with(public_key, token, settings)


def test_wrong_issuer_is_rejected(
    keypair: tuple[Ed25519PrivateKey, Any], settings: Settings
) -> None:
    private_key, public_key = keypair
    token = make_token(private_key, iss="https://evil.example")

    with pytest.raises(jwt.InvalidIssuerError):
        decode_with(public_key, token, settings)


def test_token_signed_by_another_key_is_rejected(
    keypair: tuple[Ed25519PrivateKey, Any], settings: Settings
) -> None:
    """A forged token must not verify against the real public key."""
    _, public_key = keypair
    attacker_key = Ed25519PrivateKey.generate()
    token = make_token(attacker_key)

    with pytest.raises(jwt.InvalidSignatureError):
        decode_with(public_key, token, settings)


def test_token_without_subject_is_rejected(
    keypair: tuple[Ed25519PrivateKey, Any], settings: Settings
) -> None:
    private_key, public_key = keypair
    now = int(time.time())
    token = jwt.encode(
        {"iss": ISSUER, "aud": AUDIENCE, "iat": now, "exp": now + 300},
        private_key,
        algorithm="EdDSA",
    )

    with pytest.raises(jwt.MissingRequiredClaimError):
        decode_with(public_key, token, settings)


def test_unreachable_jwks_raises_unauthenticated(settings: Settings) -> None:
    """A JWKS fetch failure must not authenticate the request."""
    broken = Settings(environment="test", web_url="http://127.0.0.1:1", jwt_audience=AUDIENCE)

    with pytest.raises(UnauthenticatedError):
        decode_token("not-a-real-token", broken)


def test_jwks_url_defaults_to_web_url() -> None:
    """With no override the fetch address follows the public URL."""
    settings = Settings(environment="test", web_url="https://finance.example.com")

    assert settings.jwks_url == "https://finance.example.com/api/auth/jwks"
    assert settings.jwt_issuer == "https://finance.example.com"


def test_jwks_base_url_does_not_change_the_issuer() -> None:
    """The fetch address and the expected issuer are separate concerns.

    Under docker-compose the browser reaches the web app at localhost:3000 —
    which is what Better Auth stamps as `iss` — but the API must fetch the keys
    over the compose network, where `localhost` is the API container itself.
    Deriving both from one setting means either the fetch fails or every
    request 401s on an issuer mismatch.
    """
    settings = Settings(
        environment="test",
        web_url="http://localhost:3000",
        jwks_base_url="http://web:3000",
    )

    assert settings.jwks_url == "http://web:3000/api/auth/jwks"
    assert settings.jwt_issuer == "http://localhost:3000"


def test_token_from_the_public_issuer_verifies_when_jwks_is_internal(
    keypair: tuple[Ed25519PrivateKey, Any],
) -> None:
    """The end the bug was actually felt at: a real token must still verify."""
    private_key, public_key = keypair
    settings = Settings(
        environment="test",
        web_url=ISSUER,
        jwks_base_url="http://web:3000",
        jwt_audience=AUDIENCE,
    )

    claims = decode_with(public_key, make_token(private_key), settings)

    assert claims["sub"] == "user_123"
