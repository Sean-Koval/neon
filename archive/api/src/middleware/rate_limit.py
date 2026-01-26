"""Rate limiting middleware using slowapi."""

from fastapi import FastAPI, Request, Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from src.config import settings


def get_api_key_identifier(request: Request) -> str:
    """Extract API key from request for rate limiting.

    Uses the API key if present, otherwise falls back to IP address.
    This ensures rate limits are applied per-API-key.
    """
    api_key = request.headers.get("X-API-Key")
    if api_key:
        # Use first 16 chars of API key as identifier (includes prefix)
        return api_key[:16]
    return get_remote_address(request)


# Create limiter with API key-based identification
limiter = Limiter(
    key_func=get_api_key_identifier,
    default_limits=[f"{settings.rate_limit_requests_per_minute}/minute"],
    enabled=settings.rate_limit_enabled,
    headers_enabled=True,
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Custom handler for rate limit exceeded errors."""
    response = _rate_limit_exceeded_handler(request, exc)
    # Ensure proper content type
    response.headers["Content-Type"] = "application/json"
    return response


def setup_rate_limiting(app: FastAPI) -> None:
    """Configure rate limiting for the FastAPI application.

    Args:
        app: The FastAPI application instance.
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
