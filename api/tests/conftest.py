"""Test configuration and fixtures."""

from collections.abc import AsyncGenerator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.config import Settings


def pytest_configure(config):
    """Configure custom pytest markers."""
    config.addinivalue_line(
        "markers",
        "integration: marks tests as integration tests (require external services)",
    )


@pytest.fixture
def test_settings() -> Settings:
    """Create test settings without database dependencies."""
    return Settings(
        environment="development",
        debug=True,
        database_url="sqlite+aiosqlite:///:memory:",
        mlflow_tracking_uri="http://localhost:5000",
        cors_origins=["http://localhost:3000"],
    )


@pytest.fixture
def app_no_lifespan() -> FastAPI:
    """Create a FastAPI app without lifespan for simple endpoint tests.

    This avoids database initialization for tests that don't need it.
    """
    from fastapi.middleware.cors import CORSMiddleware

    from src.config import settings

    test_app = FastAPI(
        title="Neon API",
        description="Agent evaluation platform built on MLflow",
        version="0.1.0",
    )

    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @test_app.get("/health")
    async def health_check() -> dict[str, str]:
        return {"status": "healthy"}

    @test_app.get("/")
    async def root() -> dict[str, str]:
        return {
            "name": "Neon API",
            "version": "0.1.0",
            "docs": "/docs",
        }

    return test_app


@pytest.fixture
async def client(app_no_lifespan: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app_no_lifespan),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset module-level singletons between tests."""
    yield
    # Clean up after each test
    from src.services.mlflow_client import reset_mlflow_client
    reset_mlflow_client()
