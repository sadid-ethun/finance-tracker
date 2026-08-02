import logging
import sys
from typing import Any

import structlog

# Values that must never reach a log sink. See PLAN.md section 17.
_REDACTED_KEYS = frozenset(
    {
        "access_token",
        "public_token",
        "link_token",
        "password",
        "authorization",
        "cookie",
        "secret",
        "account_number",
        "routing_number",
    }
)


def _redact(
    _logger: object, _method: str, event_dict: structlog.types.EventDict
) -> structlog.types.EventDict:
    """Strip sensitive values before serialization, not after."""
    for key in list(event_dict):
        if key.lower() in _REDACTED_KEYS:
            event_dict[key] = "[REDACTED]"
    return event_dict


def configure_logging(*, debug: bool = False) -> None:
    """Emit structured JSON to stdout for Railway's log aggregation."""
    level = logging.DEBUG if debug else logging.INFO

    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _redact,
    ]
    processors.append(
        structlog.dev.ConsoleRenderer() if debug else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)  # type: ignore[no-any-return]
