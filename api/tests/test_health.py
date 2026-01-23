"""Tests for health check and root endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check_returns_200(client: AsyncClient) -> None:
    """Health check endpoint should return 200 with healthy status."""
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_root_endpoint_returns_api_info(client: AsyncClient) -> None:
    """Root endpoint should return API information."""
    response = await client.get("/")

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Neon API"
    assert data["version"] == "0.1.0"
    assert data["docs"] == "/docs"


@pytest.mark.asyncio
async def test_health_check_content_type(client: AsyncClient) -> None:
    """Health check should return JSON content type."""
    response = await client.get("/health")

    assert response.headers["content-type"] == "application/json"
