"""Tests for rate limiting middleware."""

from collections.abc import AsyncGenerator
from unittest.mock import patch

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.middleware.rate_limit import get_api_key_identifier, setup_rate_limiting


@pytest.fixture
def rate_limited_app() -> FastAPI:
    """Create a FastAPI app with rate limiting enabled."""
    app = FastAPI()

    # Create a limiter with a very low limit for testing
    test_limiter = Limiter(
        key_func=get_api_key_identifier,
        default_limits=["2/minute"],
        enabled=True,
        headers_enabled=True,
    )
    app.state.limiter = test_limiter

    from slowapi import _rate_limit_exceeded_handler

    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    @app.get("/test")
    async def test_endpoint() -> dict[str, str]:
        return {"status": "ok"}

    return app


@pytest.fixture
async def rate_limited_client(
    rate_limited_app: FastAPI,
) -> AsyncGenerator[AsyncClient, None]:
    """Create async test client with rate limiting."""
    async with AsyncClient(
        transport=ASGITransport(app=rate_limited_app),
        base_url="http://test",
    ) as ac:
        yield ac


class TestGetApiKeyIdentifier:
    """Tests for API key identifier extraction."""

    @pytest.mark.asyncio
    async def test_extracts_api_key_when_present(self) -> None:
        """Should use API key prefix when X-API-Key header is present."""

        class MockRequest:
            headers = {"X-API-Key": "ae_live_abc123xyz789def456"}

        identifier = get_api_key_identifier(MockRequest())  # type: ignore
        assert identifier == "ae_live_abc123xy"

    @pytest.mark.asyncio
    async def test_falls_back_to_ip_when_no_api_key(self) -> None:
        """Should fall back to IP address when no API key is present."""
        with patch("src.middleware.rate_limit.get_remote_address") as mock_get_ip:
            mock_get_ip.return_value = "192.168.1.1"

            class MockRequest:
                headers: dict[str, str] = {}

            identifier = get_api_key_identifier(MockRequest())  # type: ignore
            assert identifier == "192.168.1.1"
            mock_get_ip.assert_called_once()


class TestRateLimitHeaders:
    """Tests for rate limit response headers."""

    @pytest.mark.asyncio
    async def test_includes_rate_limit_headers(
        self, rate_limited_client: AsyncClient
    ) -> None:
        """Rate limit headers should be included in responses."""
        response = await rate_limited_client.get("/test")

        assert response.status_code == 200
        # slowapi includes these headers
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert "X-RateLimit-Reset" in response.headers

    @pytest.mark.asyncio
    async def test_rate_limit_header_values(
        self, rate_limited_client: AsyncClient
    ) -> None:
        """Rate limit headers should have correct values."""
        response = await rate_limited_client.get("/test")

        assert response.headers["X-RateLimit-Limit"] == "2"
        assert int(response.headers["X-RateLimit-Remaining"]) == 1


class TestRateLimitEnforcement:
    """Tests for rate limit enforcement."""

    @pytest.mark.asyncio
    async def test_allows_requests_within_limit(
        self, rate_limited_client: AsyncClient
    ) -> None:
        """Requests within the rate limit should succeed."""
        response1 = await rate_limited_client.get("/test")
        response2 = await rate_limited_client.get("/test")

        assert response1.status_code == 200
        assert response2.status_code == 200

    @pytest.mark.asyncio
    async def test_returns_429_when_limit_exceeded(
        self, rate_limited_client: AsyncClient
    ) -> None:
        """Should return 429 when rate limit is exceeded."""
        # Make requests up to the limit
        await rate_limited_client.get("/test")
        await rate_limited_client.get("/test")

        # Third request should be rate limited
        response = await rate_limited_client.get("/test")

        assert response.status_code == 429

    @pytest.mark.asyncio
    async def test_429_response_includes_retry_after(
        self, rate_limited_client: AsyncClient
    ) -> None:
        """429 response should include Retry-After header."""
        # Exhaust the limit
        await rate_limited_client.get("/test")
        await rate_limited_client.get("/test")

        response = await rate_limited_client.get("/test")

        assert response.status_code == 429
        assert "Retry-After" in response.headers


class TestRateLimitByApiKey:
    """Tests for per-API-key rate limiting."""

    @pytest.fixture
    def multi_key_app(self) -> FastAPI:
        """Create an app for testing per-key rate limiting."""
        app = FastAPI()

        test_limiter = Limiter(
            key_func=get_api_key_identifier,
            default_limits=["2/minute"],
            enabled=True,
            headers_enabled=True,
        )
        app.state.limiter = test_limiter

        from slowapi import _rate_limit_exceeded_handler

        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.add_middleware(SlowAPIMiddleware)

        @app.get("/test")
        async def test_endpoint() -> dict[str, str]:
            return {"status": "ok"}

        return app

    @pytest.fixture
    async def multi_key_client(
        self, multi_key_app: FastAPI
    ) -> AsyncGenerator[AsyncClient, None]:
        """Create client for multi-key testing."""
        async with AsyncClient(
            transport=ASGITransport(app=multi_key_app),
            base_url="http://test",
        ) as ac:
            yield ac

    @pytest.mark.asyncio
    async def test_different_api_keys_have_separate_limits(
        self, multi_key_client: AsyncClient
    ) -> None:
        """Different API keys should have independent rate limits."""
        key1_headers = {"X-API-Key": "ae_live_key1xxxx12345"}
        key2_headers = {"X-API-Key": "ae_live_key2xxxx67890"}

        # Exhaust limit for key1
        await multi_key_client.get("/test", headers=key1_headers)
        await multi_key_client.get("/test", headers=key1_headers)
        response_key1 = await multi_key_client.get("/test", headers=key1_headers)

        # Key1 should be rate limited
        assert response_key1.status_code == 429

        # Key2 should still work
        response_key2 = await multi_key_client.get("/test", headers=key2_headers)
        assert response_key2.status_code == 200


class TestSetupRateLimiting:
    """Tests for rate limiting setup function."""

    def test_setup_adds_limiter_to_app_state(self) -> None:
        """setup_rate_limiting should add limiter to app state."""
        app = FastAPI()
        setup_rate_limiting(app)

        assert hasattr(app.state, "limiter")
        assert isinstance(app.state.limiter, Limiter)

    def test_setup_adds_exception_handler(self) -> None:
        """setup_rate_limiting should register exception handler."""
        app = FastAPI()
        setup_rate_limiting(app)

        # Check that RateLimitExceeded handler is registered
        assert RateLimitExceeded in app.exception_handlers


class TestRateLimitDisabled:
    """Tests for when rate limiting is disabled."""

    @pytest.fixture
    def disabled_rate_limit_app(self) -> FastAPI:
        """Create an app with rate limiting disabled."""
        app = FastAPI()

        test_limiter = Limiter(
            key_func=get_api_key_identifier,
            default_limits=["1/minute"],
            enabled=False,  # Disabled
            headers_enabled=True,
        )
        app.state.limiter = test_limiter

        from slowapi import _rate_limit_exceeded_handler

        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.add_middleware(SlowAPIMiddleware)

        @app.get("/test")
        async def test_endpoint() -> dict[str, str]:
            return {"status": "ok"}

        return app

    @pytest.fixture
    async def disabled_client(
        self, disabled_rate_limit_app: FastAPI
    ) -> AsyncGenerator[AsyncClient, None]:
        """Create client with disabled rate limiting."""
        async with AsyncClient(
            transport=ASGITransport(app=disabled_rate_limit_app),
            base_url="http://test",
        ) as ac:
            yield ac

    @pytest.mark.asyncio
    async def test_allows_unlimited_requests_when_disabled(
        self, disabled_client: AsyncClient
    ) -> None:
        """Should allow unlimited requests when rate limiting is disabled."""
        # Make many requests - none should be rate limited
        for _ in range(10):
            response = await disabled_client.get("/test")
            assert response.status_code == 200
