"""Security headers and rate limiting.

Both are defence in depth rather than the primary control: the API already
verifies a JWT on every request. These limit the damage from a stolen token,
a scripted probe, or a browser that would otherwise be too trusting of a
response.
"""

import time
from collections import defaultdict
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from starlette.responses import JSONResponse

from app.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)

#: Per-window request caps, matched longest-prefix-first.
RATE_LIMITS: dict[str, tuple[int, int]] = {
    # path prefix: (max requests, window seconds)
    "/api/v1/plaid": (20, 60),
    "/webhooks": (120, 60),
    "/api/v1": (300, 60),
}

SECURITY_HEADERS = {
    # This API returns JSON only; nothing should ever be framed or sniffed.
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    # No browser feature is needed by a JSON API.
    "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=()",
    # A JSON response has no scripts or styles to load.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cross-Origin-Resource-Policy": "same-site",
}


class _SlidingWindow:
    """In-memory rate limiter.

    Fine for a single-user app on one instance. If the API is ever scaled past
    one replica this must move to Redis, or each replica will enforce its own
    quota and the effective limit becomes N times what is configured.
    """

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window

        hits = [t for t in self._hits[key] if t > cutoff]
        self._hits[key] = hits

        if len(hits) >= limit:
            return False, 0

        hits.append(now)
        return True, limit - len(hits)

    def prune(self, older_than: float = 3600) -> None:
        """Drop idle buckets so the dict cannot grow without bound."""
        cutoff = time.monotonic() - older_than
        for key in list(self._hits):
            if not self._hits[key] or self._hits[key][-1] < cutoff:
                del self._hits[key]


_limiter = _SlidingWindow()


def _limit_for(path: str) -> tuple[int, int] | None:
    for prefix in sorted(RATE_LIMITS, key=len, reverse=True):
        if path.startswith(prefix):
            return RATE_LIMITS[prefix]
    return None


def _client_key(request: Request) -> str:
    """Identify the caller.

    Prefers the authenticated subject so one user cannot exhaust another's
    quota from behind the same NAT; falls back to the peer address.
    """
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        # The token itself is the key: opaque, per-user, and never logged.
        return f"tok:{hash(auth[7:])}"
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


def register_middleware(app: FastAPI, settings: Settings) -> None:
    @app.middleware("http")
    async def security_and_rate_limit(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        limit = _limit_for(request.url.path)

        if limit is not None:
            max_requests, window = limit
            allowed, remaining = _limiter.check(
                f"{_client_key(request)}:{request.url.path[:40]}", max_requests, window
            )
            request.state.rate_limit_remaining = remaining

            if not allowed:
                logger.warning("rate_limited", path=request.url.path)
                response: Response = JSONResponse(
                    status_code=429,
                    media_type="application/problem+json",
                    content={
                        "type": "about:blank#rate_limited",
                        "title": "Too Many Requests",
                        "status": 429,
                        "detail": "Slow down and try again shortly.",
                        "code": "RATE_LIMITED",
                    },
                )
                response.headers["Retry-After"] = str(window)
                _apply_headers(response, settings)
                return response

        response = await call_next(request)
        _apply_headers(response, settings)
        if limit is not None:
            response.headers["X-RateLimit-Limit"] = str(limit[0])
            response.headers["X-RateLimit-Remaining"] = str(
                getattr(request.state, "rate_limit_remaining", 0)
            )
        return response


def _apply_headers(response: Response, settings: Settings) -> None:
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)

    # HSTS only over real TLS; sending it from http://localhost would pin the
    # browser to https for every local project on that port.
    if settings.is_production:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"
        )
