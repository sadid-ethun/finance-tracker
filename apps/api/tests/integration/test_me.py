"""The /me endpoint is the smoke test for the whole auth chain.

Phase 1 covers the rejection paths, which need no database. The success path is
exercised end-to-end against a live Postgres and a real Better Auth session.
"""

from httpx import AsyncClient


async def test_me_requires_a_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me")

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "UNAUTHENTICATED"
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_me_rejects_a_malformed_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


async def test_me_rejects_a_non_bearer_scheme(client: AsyncClient) -> None:
    response = await client.get("/api/v1/me", headers={"Authorization": "Basic dXNlcjpwYXNz"})

    assert response.status_code == 401


async def test_error_body_never_leaks_the_reason(client: AsyncClient) -> None:
    """A probe must not learn whether a token was expired, forged, or unknown."""
    malformed = await client.get("/api/v1/me", headers={"Authorization": "Bearer aaa.bbb.ccc"})
    missing = await client.get("/api/v1/me")

    assert malformed.json()["code"] == missing.json()["code"] == "UNAUTHENTICATED"
