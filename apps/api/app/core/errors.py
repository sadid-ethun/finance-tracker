"""Application error types and their HTTP mapping.

Routes raise these; a single set of handlers turns them into RFC 9457 Problem
Details responses. Handlers never build error payloads by hand — see PLAN.md
section 16.
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)

PROBLEM_JSON = "application/problem+json"

# Machine-readable codes for framework-raised HTTP errors, so clients switch on
# `code` rather than parsing `detail` text.
_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
}

_HTTP_TITLES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
}


class AppError(Exception):
    """Base class for expected, user-facing failures."""

    status_code: int = 500
    code: str = "INTERNAL_ERROR"
    title: str = "Internal Server Error"

    def __init__(self, detail: str | None = None, **extra: Any) -> None:
        self.detail = detail or self.title
        self.extra = extra
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    title = "Not Found"


class ValidationError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    title = "Unprocessable Entity"


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    title = "Forbidden"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    title = "Conflict"


class RateLimitError(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    title = "Too Many Requests"


class ExternalServiceError(AppError):
    status_code = 502
    code = "EXTERNAL_SERVICE_ERROR"
    title = "Bad Gateway"


def _problem(
    request: Request,
    *,
    status: int,
    code: str,
    title: str,
    detail: str,
    **extra: Any,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"about:blank#{code.lower()}",
        "title": title,
        "status": status,
        "detail": detail,
        "instance": str(request.url.path),
        "code": code,
        "request_id": getattr(request.state, "request_id", None),
    }
    body.update(extra)
    return JSONResponse(status_code=status, content=body, media_type=PROBLEM_JSON)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return _problem(
            request,
            status=exc.status_code,
            code=exc.code,
            title=exc.title,
            detail=exc.detail,
            **exc.extra,
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        return _problem(
            request,
            status=422,
            code="VALIDATION_ERROR",
            title="Unprocessable Entity",
            detail="Request validation failed.",
            errors=exc.errors(),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """Framework-raised errors (404, 405, ...) get the same envelope.

        Without this, routing failures would return FastAPI's bare
        {"detail": ...} and clients would need two error shapes.
        """
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        return _problem(
            request,
            status=exc.status_code,
            code=code,
            title=_HTTP_TITLES.get(exc.status_code, "Error"),
            detail=str(exc.detail),
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Log the cause, but never leak internals to the client.
        logger.exception(
            "unhandled_exception",
            path=request.url.path,
            request_id=getattr(request.state, "request_id", None),
        )
        return _problem(
            request,
            status=500,
            code="INTERNAL_ERROR",
            title="Internal Server Error",
            detail="An unexpected error occurred.",
        )
