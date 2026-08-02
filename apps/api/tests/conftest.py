import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("ENVIRONMENT", "test")


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """In-process HTTP client — no network, no running server."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
