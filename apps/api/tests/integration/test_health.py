from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "api"


async def test_health_is_also_mounted_under_api_v1(client: AsyncClient) -> None:
    """Platform probes hit /health; the app hits the versioned path."""
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_request_id_is_echoed(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "abc-123"})

    assert response.headers["X-Request-ID"] == "abc-123"


async def test_unknown_route_returns_problem_details(client: AsyncClient) -> None:
    """Framework errors use the same envelope as application errors."""
    response = await client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")

    body = response.json()
    assert body["code"] == "NOT_FOUND"
    assert body["status"] == 404
    assert body["instance"] == "/does-not-exist"
    assert body["request_id"]


async def test_wrong_method_returns_problem_details(client: AsyncClient) -> None:
    response = await client.post("/health")

    assert response.status_code == 405
    assert response.json()["code"] == "METHOD_NOT_ALLOWED"
