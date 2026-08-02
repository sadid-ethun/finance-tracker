"""JWT verification against the web app's JWKS.

This is the security boundary. The API holds no shared secret — it fetches
public keys and verifies signature, expiry, issuer, and audience on every
request (PLAN.md section 8). Next.js `proxy.ts` redirects are a UX nicety and
are never trusted here.
"""

import time
from typing import Any

import jwt
from jwt import PyJWKClient

from app.config import Settings, get_settings
from app.core.errors import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)

_ALGORITHMS = ["EdDSA"]


class UnauthenticatedError(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"
    title = "Unauthorized"


class _JwksCache:
    """Caches the PyJWKClient so keys are not refetched on every request.

    PyJWKClient does its own caching, but it is rebuilt whenever settings
    change, so the wrapper tracks its own age and rebuilds on expiry. This also
    gives us a single place to force a refresh after key rotation.
    """

    def __init__(self) -> None:
        self._client: PyJWKClient | None = None
        self._fetched_at: float = 0.0

    def get(self, settings: Settings) -> PyJWKClient:
        age = time.monotonic() - self._fetched_at
        if self._client is None or age > settings.jwks_cache_seconds:
            self._client = PyJWKClient(
                settings.jwks_url,
                cache_keys=True,
                lifespan=settings.jwks_cache_seconds,
            )
            self._fetched_at = time.monotonic()
        return self._client

    def reset(self) -> None:
        self._client = None
        self._fetched_at = 0.0


_jwks_cache = _JwksCache()


def decode_token(token: str, settings: Settings | None = None) -> dict[str, Any]:
    """Verify a bearer token and return its claims.

    Raises UnauthenticatedError for anything that fails verification — the
    caller never distinguishes between an expired token and a forged one, so a
    probe cannot learn which.
    """
    settings = settings or get_settings()

    try:
        signing_key = _jwks_cache.get(settings).get_signing_key_from_jwt(token)
    except jwt.InvalidTokenError as exc:
        # Malformed enough that the header could not even be read. Caught here
        # because get_signing_key_from_jwt parses the token before fetching.
        logger.info("token_rejected", reason=type(exc).__name__)
        raise UnauthenticatedError("Invalid token.") from exc
    except (jwt.PyJWKClientError, OSError) as exc:
        # A JWKS fetch failure is an availability problem, not a bad token, but
        # it still cannot authenticate the request.
        _jwks_cache.reset()
        logger.warning("jwks_fetch_failed", error=str(exc))
        raise UnauthenticatedError("Could not verify credentials.") from exc

    try:
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=_ALGORITHMS,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthenticatedError("Token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        logger.info("token_rejected", reason=type(exc).__name__)
        raise UnauthenticatedError("Invalid token.") from exc
