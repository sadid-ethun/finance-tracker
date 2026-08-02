import time
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.api.v1.routes import health
from app.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger

settings = get_settings()
configure_logging(debug=settings.debug)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("api_starting", environment=settings.environment, version=settings.version)
    yield
    logger.info("api_stopping")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Finance Tracker API",
        version=settings.version,
        # Docs are useful locally but are an information leak in production.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Bind a request id to every log line emitted while handling a request."""
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 2)

        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request_completed",
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response

    register_exception_handlers(app)

    # Health lives at the root as well as under /api/v1 so platform probes do not
    # have to know the API version.
    app.include_router(health.router)
    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()
