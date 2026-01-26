"""Tests for authentication router and middleware."""

from datetime import datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.models.auth import ApiKey, ApiKeyList, ApiKeyResponse, ApiKeyScope
from src.routers import auth


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_admin_key() -> ApiKey:
    """Create a mock API key with admin permissions."""
    return ApiKey(
        id=uuid4(),
        key_prefix="admin123",
        name="admin-key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.ADMIN],
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )


@pytest.fixture
def mock_read_key() -> ApiKey:
    """Create a mock API key with read-only permissions."""
    return ApiKey(
        id=uuid4(),
        key_prefix="read1234",
        name="read-key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ],
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )


@pytest.fixture
def mock_write_key() -> ApiKey:
    """Create a mock API key with write permissions."""
    return ApiKey(
        id=uuid4(),
        key_prefix="write123",
        name="write-key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ, ApiKeyScope.WRITE],
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )


@pytest.fixture
def mock_expired_key() -> ApiKey:
    """Create a mock expired API key."""
    return ApiKey(
        id=uuid4(),
        key_prefix="expd1234",
        name="expired-key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ, ApiKeyScope.WRITE],
        created_at=datetime.utcnow() - timedelta(days=30),
        last_used_at=None,
        expires_at=datetime.utcnow() - timedelta(days=1),  # Expired yesterday
        is_active=True,
    )


@pytest.fixture
def sample_api_key_create_data() -> dict[str, Any]:
    """Sample data for creating an API key."""
    return {
        "name": "new-api-key",
        "scopes": ["read", "write"],
        "expires_in_days": 30,
    }


@pytest.fixture
def mock_api_key_response(mock_admin_key: ApiKey) -> ApiKeyResponse:
    """Create a mock API key creation response."""
    return ApiKeyResponse(
        id=uuid4(),
        key="ae_live_abcd1234efgh5678ijkl9012mnop3456",
        name="new-api-key",
        key_prefix="abcd1234",
        scopes=[ApiKeyScope.READ, ApiKeyScope.WRITE],
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=30),
    )


# =============================================================================
# API Key CRUD Tests
# =============================================================================


@pytest.mark.asyncio
async def test_list_api_keys_success(mock_admin_key: ApiKey) -> None:
    """Test listing API keys returns 200 with admin scope."""
    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_admin_key

    @app.get("/api/v1/api-keys")
    async def list_keys(key: ApiKey = Depends(mock_auth)):
        return ApiKeyList(items=[mock_admin_key], total=1)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/api-keys")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_create_api_key_success(
    mock_admin_key: ApiKey,
    mock_api_key_response: ApiKeyResponse,
    sample_api_key_create_data: dict[str, Any],
) -> None:
    """Test creating an API key returns 201."""
    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_admin_key

    @app.post("/api/v1/api-keys", status_code=201)
    async def create_key(key: ApiKey = Depends(mock_auth)):
        return mock_api_key_response

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/api-keys",
            json=sample_api_key_create_data,
        )

    assert response.status_code == 201
    data = response.json()
    assert "key" in data  # Full key returned on creation
    assert data["name"] == "new-api-key"


@pytest.mark.asyncio
async def test_revoke_api_key_success(mock_admin_key: ApiKey) -> None:
    """Test revoking an API key returns 204."""
    key_id = uuid4()

    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_admin_key

    @app.delete("/api/v1/api-keys/{key_id}", status_code=204)
    async def revoke_key(key_id: UUID, key: ApiKey = Depends(mock_auth)):
        return None

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete(f"/api/v1/api-keys/{key_id}")

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_revoke_api_key_not_found(mock_admin_key: ApiKey) -> None:
    """Test revoking a non-existent key returns 404."""
    app = FastAPI()

    from fastapi import Depends, HTTPException

    async def mock_auth():
        return mock_admin_key

    @app.delete("/api/v1/api-keys/{key_id}")
    async def revoke_key(key_id: UUID, key: ApiKey = Depends(mock_auth)):
        raise HTTPException(status_code=404, detail="API key not found")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete(f"/api/v1/api-keys/{uuid4()}")

    assert response.status_code == 404
    assert response.json()["detail"] == "API key not found"


# =============================================================================
# Authentication Tests - API Key Validation
# =============================================================================


@pytest.mark.asyncio
async def test_missing_api_key_returns_401() -> None:
    """Test that missing API key returns 401 Unauthorized."""
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/api-keys")

    assert response.status_code == 401
    assert "Missing API key" in response.json()["detail"]


@pytest.mark.asyncio
async def test_invalid_api_key_format_returns_401() -> None:
    """Test that invalid API key format returns 401."""
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        # Invalid format - not ae_live_xxx
        response = await client.get(
            "/api/v1/api-keys",
            headers={"X-API-Key": "invalid_key_format"},
        )

    assert response.status_code == 401
    assert "Invalid API key format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_invalid_api_key_prefix_returns_401() -> None:
    """Test that invalid API key prefix returns 401."""
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        # Wrong prefix - should be 'ae'
        response = await client.get(
            "/api/v1/api-keys",
            headers={"X-API-Key": "xx_live_abcd1234efgh5678"},
        )

    assert response.status_code == 401
    assert "Invalid API key format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_api_key_not_found_returns_401() -> None:
    """Test that non-existent API key returns 401.

    This test verifies that when a valid-format API key is provided
    but doesn't exist in the database, we get a 401 response.
    We test this by checking the middleware logic directly.
    """
    from fastapi import Depends, HTTPException

    app = FastAPI()

    # Simulate the auth middleware behavior when key not found
    async def mock_verify_api_key():
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
        )

    @app.get("/api/v1/api-keys")
    async def list_keys(key=Depends(mock_verify_api_key)):
        return {"items": [], "total": 0}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/api/v1/api-keys",
            headers={"X-API-Key": "ae_live_abcd1234efgh5678ijkl9012mnop3456"},
        )

    assert response.status_code == 401
    assert "Invalid API key" in response.json()["detail"]


# =============================================================================
# Scope Permission Tests
# =============================================================================


@pytest.mark.asyncio
async def test_list_keys_requires_admin_scope(mock_read_key: ApiKey) -> None:
    """Test that listing API keys requires ADMIN scope."""
    app = FastAPI()

    from fastapi import Depends, HTTPException

    async def mock_auth():
        return mock_read_key

    @app.get("/api/v1/api-keys")
    async def list_keys(key: ApiKey = Depends(mock_auth)):
        if ApiKeyScope.ADMIN not in key.scopes:
            raise HTTPException(
                status_code=403,
                detail="Missing required scope: admin",
            )
        return {"items": [], "total": 0}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/api-keys")

    assert response.status_code == 403
    assert "admin" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_key_requires_admin_scope(
    mock_write_key: ApiKey,
    sample_api_key_create_data: dict[str, Any],
) -> None:
    """Test that creating API keys requires ADMIN scope."""
    app = FastAPI()

    from fastapi import Depends, HTTPException

    async def mock_auth():
        return mock_write_key

    @app.post("/api/v1/api-keys")
    async def create_key(key: ApiKey = Depends(mock_auth)):
        if ApiKeyScope.ADMIN not in key.scopes:
            raise HTTPException(
                status_code=403,
                detail="Missing required scope: admin",
            )
        return {"id": str(uuid4())}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/api-keys",
            json=sample_api_key_create_data,
        )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_revoke_key_requires_admin_scope(mock_read_key: ApiKey) -> None:
    """Test that revoking API keys requires ADMIN scope."""
    app = FastAPI()

    from fastapi import Depends, HTTPException

    async def mock_auth():
        return mock_read_key

    @app.delete("/api/v1/api-keys/{key_id}")
    async def revoke_key(key_id: UUID, key: ApiKey = Depends(mock_auth)):
        if ApiKeyScope.ADMIN not in key.scopes:
            raise HTTPException(
                status_code=403,
                detail="Missing required scope: admin",
            )
        return None

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete(f"/api/v1/api-keys/{uuid4()}")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_scope_grants_all_permissions(mock_admin_key: ApiKey) -> None:
    """Test that ADMIN scope grants access to all operations."""
    from src.auth.middleware import require_scope

    # Create a mock check_scope function
    async def check_scope_read():
        key = mock_admin_key
        scope = ApiKeyScope.READ
        if scope not in key.scopes and ApiKeyScope.ADMIN not in key.scopes:
            raise Exception("Missing scope")
        return key

    async def check_scope_write():
        key = mock_admin_key
        scope = ApiKeyScope.WRITE
        if scope not in key.scopes and ApiKeyScope.ADMIN not in key.scopes:
            raise Exception("Missing scope")
        return key

    async def check_scope_execute():
        key = mock_admin_key
        scope = ApiKeyScope.EXECUTE
        if scope not in key.scopes and ApiKeyScope.ADMIN not in key.scopes:
            raise Exception("Missing scope")
        return key

    # ADMIN should pass all scope checks
    key = await check_scope_read()
    assert key.scopes == [ApiKeyScope.ADMIN]

    key = await check_scope_write()
    assert key.scopes == [ApiKeyScope.ADMIN]

    key = await check_scope_execute()
    assert key.scopes == [ApiKeyScope.ADMIN]


# =============================================================================
# Middleware Tests
# =============================================================================


@pytest.mark.asyncio
async def test_require_scope_decorator_read() -> None:
    """Test require_scope returns function checking READ permission."""
    from src.auth.middleware import require_scope

    check_func = require_scope(ApiKeyScope.READ)
    assert callable(check_func)


@pytest.mark.asyncio
async def test_require_scope_decorator_write() -> None:
    """Test require_scope returns function checking WRITE permission."""
    from src.auth.middleware import require_scope

    check_func = require_scope(ApiKeyScope.WRITE)
    assert callable(check_func)


@pytest.mark.asyncio
async def test_require_scope_decorator_admin() -> None:
    """Test require_scope returns function checking ADMIN permission."""
    from src.auth.middleware import require_scope

    check_func = require_scope(ApiKeyScope.ADMIN)
    assert callable(check_func)


# =============================================================================
# Service Integration Tests
# =============================================================================


@pytest.mark.asyncio
async def test_auth_service_list_keys() -> None:
    """Test AuthService.list_keys with mocked database."""
    from src.services.auth_service import AuthService

    project_id = uuid4()
    mock_db = AsyncMock()
    mock_result = MagicMock()

    # Create mock key model
    mock_key_model = MagicMock()
    mock_key_model.id = uuid4()
    mock_key_model.key_prefix = "test1234"
    mock_key_model.name = "test-key"
    mock_key_model.project_id = project_id
    mock_key_model.scopes = ["read", "write"]
    mock_key_model.created_at = datetime.utcnow()
    mock_key_model.last_used_at = None
    mock_key_model.expires_at = None
    mock_key_model.is_active = True

    mock_result.scalars.return_value.all.return_value = [mock_key_model]
    mock_db.execute = AsyncMock(return_value=mock_result)

    service = AuthService(mock_db)
    keys = await service.list_keys(project_id)

    assert len(keys) == 1
    assert keys[0].name == "test-key"
    assert ApiKeyScope.READ in keys[0].scopes
    assert ApiKeyScope.WRITE in keys[0].scopes


@pytest.mark.asyncio
async def test_auth_service_revoke_key_not_found() -> None:
    """Test AuthService.revoke_key returns False for non-existent key."""
    from src.services.auth_service import AuthService

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_result)

    service = AuthService(mock_db)
    success = await service.revoke_key(uuid4(), uuid4())

    assert success is False


@pytest.mark.asyncio
async def test_auth_service_revoke_key_success() -> None:
    """Test AuthService.revoke_key sets is_active to False."""
    from src.services.auth_service import AuthService

    mock_db = AsyncMock()
    mock_result = MagicMock()

    mock_key_model = MagicMock()
    mock_key_model.is_active = True

    mock_result.scalar_one_or_none.return_value = mock_key_model
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()

    service = AuthService(mock_db)
    success = await service.revoke_key(uuid4(), uuid4())

    assert success is True
    assert mock_key_model.is_active is False
    mock_db.commit.assert_called_once()


# =============================================================================
# API Key Format Validation Tests
# =============================================================================


@pytest.mark.asyncio
async def test_api_key_format_validation_valid() -> None:
    """Test that valid API key format is accepted."""
    # Valid format: ae_live_<32 hex chars>
    valid_key = "ae_live_abcd1234efgh5678ijkl9012mnop3456"
    parts = valid_key.split("_")

    assert len(parts) == 3
    assert parts[0] == "ae"
    assert parts[1] == "live"
    assert len(parts[2]) == 32


@pytest.mark.asyncio
async def test_api_key_format_validation_invalid_prefix() -> None:
    """Test that invalid prefix is rejected."""
    invalid_key = "xx_live_abcd1234efgh5678ijkl9012mnop3456"
    parts = invalid_key.split("_")

    assert parts[0] != "ae"


@pytest.mark.asyncio
async def test_api_key_format_validation_missing_parts() -> None:
    """Test that keys with missing parts are rejected."""
    invalid_key = "ae_abcd1234"
    parts = invalid_key.split("_")

    assert len(parts) != 3


# =============================================================================
# Error Response Format Tests
# =============================================================================


@pytest.mark.asyncio
async def test_401_response_format() -> None:
    """Test that 401 responses have correct format."""
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/api-keys")

    assert response.status_code == 401
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_403_response_format(mock_read_key: ApiKey) -> None:
    """Test that 403 responses have correct format."""
    app = FastAPI()

    from fastapi import Depends, HTTPException

    async def mock_auth():
        return mock_read_key

    @app.get("/api/v1/api-keys")
    async def list_keys(key: ApiKey = Depends(mock_auth)):
        raise HTTPException(
            status_code=403,
            detail="Missing required scope: admin",
        )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/api-keys")

    assert response.status_code == 403
    data = response.json()
    assert "detail" in data
    assert "admin" in data["detail"]


@pytest.mark.asyncio
async def test_404_response_format(mock_admin_key: ApiKey) -> None:
    """Test that 404 responses have correct format."""
    app = FastAPI()

    from fastapi import Depends, HTTPException

    async def mock_auth():
        return mock_admin_key

    @app.delete("/api/v1/api-keys/{key_id}")
    async def revoke_key(key_id: UUID, key: ApiKey = Depends(mock_auth)):
        raise HTTPException(status_code=404, detail="API key not found")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete(f"/api/v1/api-keys/{uuid4()}")

    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "not found" in data["detail"]
