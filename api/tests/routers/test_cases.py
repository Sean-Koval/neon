"""Tests for cases router endpoints."""

from datetime import datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.models.auth import ApiKey, ApiKeyScope
from src.models.eval import EvalCase, ScorerType
from src.routers import cases


@pytest.fixture
def mock_api_key() -> ApiKey:
    """Create a mock API key with all permissions."""
    return ApiKey(
        id=uuid4(),
        key_prefix="testkey1",
        name="Test Key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ, ApiKeyScope.WRITE, ApiKeyScope.EXECUTE],
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )


@pytest.fixture
def mock_api_key_read_only() -> ApiKey:
    """Create a mock API key with read-only permissions."""
    return ApiKey(
        id=uuid4(),
        key_prefix="testkey2",
        name="Read Only Key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ],
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )


@pytest.fixture
def sample_case(mock_api_key: ApiKey) -> EvalCase:
    """Create a sample eval case for testing."""
    return EvalCase(
        id=uuid4(),
        suite_id=uuid4(),
        name="test-case",
        description="A test case",
        input={"query": "test query"},
        expected_tools=["web_search"],
        expected_tool_sequence=None,
        expected_output_contains=["expected"],
        expected_output_pattern=None,
        scorers=[ScorerType.TOOL_SELECTION, ScorerType.REASONING],
        scorer_config=None,
        min_score=0.7,
        tags=["test"],
        timeout_seconds=300,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


def create_test_app(mock_api_key: ApiKey) -> FastAPI:
    """Create a test FastAPI app with properly overridden auth."""
    from src.auth.middleware import verify_api_key
    from src.db.session import get_db

    app = FastAPI()
    app.include_router(cases.router, prefix="/api/v1")

    async def mock_verify_api_key():
        return mock_api_key

    async def mock_get_db():
        return AsyncMock()

    app.dependency_overrides[verify_api_key] = mock_verify_api_key
    app.dependency_overrides[get_db] = mock_get_db

    return app


# =============================================================================
# GET /cases/{case_id} Tests
# =============================================================================


@pytest.mark.asyncio
async def test_get_case_returns_case(sample_case: EvalCase, mock_api_key: ApiKey):
    """GET /cases/{id} should return case when found."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.get_case.return_value = sample_case

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get(f"/api/v1/cases/{sample_case.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(sample_case.id)
    assert data["name"] == sample_case.name
    assert data["description"] == sample_case.description


@pytest.mark.asyncio
async def test_get_case_returns_404_when_not_found(mock_api_key: ApiKey):
    """GET /cases/{id} should return 404 when case not found."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.get_case.return_value = None

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            case_id = uuid4()
            response = await client.get(f"/api/v1/cases/{case_id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Case not found"


@pytest.mark.asyncio
async def test_get_case_enforces_project_scoping(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """GET /cases/{id} should pass project_id to service for scoping."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.get_case.return_value = sample_case

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            await client.get(f"/api/v1/cases/{sample_case.id}")

    # Verify project_id was passed to service
    mock_service.get_case.assert_called_once()
    call_args = mock_service.get_case.call_args
    assert call_args[0][0] == mock_api_key.project_id


# =============================================================================
# PATCH /cases/{case_id} Tests
# =============================================================================


@pytest.mark.asyncio
async def test_update_case_returns_updated_case(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """PATCH /cases/{id} should return updated case."""
    app = create_test_app(mock_api_key)

    updated_case = sample_case.model_copy(update={"name": "updated-name"})
    mock_service = AsyncMock()
    mock_service.update_case.return_value = updated_case

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"name": "updated-name"},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "updated-name"


@pytest.mark.asyncio
async def test_update_case_returns_404_when_not_found(mock_api_key: ApiKey):
    """PATCH /cases/{id} should return 404 when case not found."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.update_case.return_value = None

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            case_id = uuid4()
            response = await client.patch(
                f"/api/v1/cases/{case_id}",
                json={"name": "new-name"},
            )

    assert response.status_code == 404
    assert response.json()["detail"] == "Case not found"


@pytest.mark.asyncio
async def test_update_case_partial_update(sample_case: EvalCase, mock_api_key: ApiKey):
    """PATCH /cases/{id} should allow partial updates."""
    app = create_test_app(mock_api_key)

    updated_case = sample_case.model_copy(update={"description": "New description"})
    mock_service = AsyncMock()
    mock_service.update_case.return_value = updated_case

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"description": "New description"},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "New description"
    assert data["name"] == sample_case.name


@pytest.mark.asyncio
async def test_update_case_enforces_project_scoping(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """PATCH /cases/{id} should pass project_id to service for scoping."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.update_case.return_value = sample_case

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"name": "test"},
            )

    mock_service.update_case.assert_called_once()
    call_args = mock_service.update_case.call_args
    assert call_args[0][0] == mock_api_key.project_id


# =============================================================================
# DELETE /cases/{case_id} Tests
# =============================================================================


@pytest.mark.asyncio
async def test_delete_case_returns_204(sample_case: EvalCase, mock_api_key: ApiKey):
    """DELETE /cases/{id} should return 204 on success."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.delete_case.return_value = True

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.delete(f"/api/v1/cases/{sample_case.id}")

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_case_returns_404_when_not_found(mock_api_key: ApiKey):
    """DELETE /cases/{id} should return 404 when case not found."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.delete_case.return_value = False

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            case_id = uuid4()
            response = await client.delete(f"/api/v1/cases/{case_id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Case not found"


@pytest.mark.asyncio
async def test_delete_case_enforces_project_scoping(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """DELETE /cases/{id} should pass project_id to service for scoping."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()
    mock_service.delete_case.return_value = True

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            await client.delete(f"/api/v1/cases/{sample_case.id}")

    mock_service.delete_case.assert_called_once()
    call_args = mock_service.delete_case.call_args
    assert call_args[0][0] == mock_api_key.project_id


# =============================================================================
# API Key Scope Tests
# =============================================================================


@pytest.mark.asyncio
async def test_get_case_requires_read_scope():
    """GET /cases/{id} should require READ scope."""
    from src.auth.middleware import verify_api_key
    from src.db.session import get_db

    # Create key without READ scope
    no_read_key = ApiKey(
        id=uuid4(),
        key_prefix="noread01",
        name="No Read Key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.EXECUTE],  # No READ scope
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )

    app = FastAPI()
    app.include_router(cases.router, prefix="/api/v1")

    async def mock_verify_api_key():
        return no_read_key

    async def mock_get_db():
        return AsyncMock()

    app.dependency_overrides[verify_api_key] = mock_verify_api_key
    app.dependency_overrides[get_db] = mock_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(f"/api/v1/cases/{uuid4()}")

    assert response.status_code == 403
    assert "read" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_case_requires_write_scope():
    """PATCH /cases/{id} should require WRITE scope."""
    from src.auth.middleware import verify_api_key
    from src.db.session import get_db

    # Create key without WRITE scope
    no_write_key = ApiKey(
        id=uuid4(),
        key_prefix="nowrite1",
        name="No Write Key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ, ApiKeyScope.EXECUTE],  # No WRITE scope
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )

    app = FastAPI()
    app.include_router(cases.router, prefix="/api/v1")

    async def mock_verify_api_key():
        return no_write_key

    async def mock_get_db():
        return AsyncMock()

    app.dependency_overrides[verify_api_key] = mock_verify_api_key
    app.dependency_overrides[get_db] = mock_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.patch(
            f"/api/v1/cases/{uuid4()}",
            json={"name": "test"},
        )

    assert response.status_code == 403
    assert "write" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_delete_case_requires_write_scope():
    """DELETE /cases/{id} should require WRITE scope."""
    from src.auth.middleware import verify_api_key
    from src.db.session import get_db

    # Create key without WRITE scope
    no_write_key = ApiKey(
        id=uuid4(),
        key_prefix="nowrite2",
        name="No Write Key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ],  # No WRITE scope
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )

    app = FastAPI()
    app.include_router(cases.router, prefix="/api/v1")

    async def mock_verify_api_key():
        return no_write_key

    async def mock_get_db():
        return AsyncMock()

    app.dependency_overrides[verify_api_key] = mock_verify_api_key
    app.dependency_overrides[get_db] = mock_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete(f"/api/v1/cases/{uuid4()}")

    assert response.status_code == 403
    assert "write" in response.json()["detail"].lower()


# =============================================================================
# Validation Tests
# =============================================================================


@pytest.mark.asyncio
async def test_update_case_validates_name_format(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """PATCH /cases/{id} should validate name format."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            # Invalid name with special characters
            response = await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"name": "invalid name with spaces!"},
            )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_update_case_validates_min_score_range(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """PATCH /cases/{id} should validate min_score is between 0 and 1."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            # min_score > 1 should fail
            response = await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"min_score": 1.5},
            )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_case_validates_timeout_range(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """PATCH /cases/{id} should validate timeout_seconds is positive and <= 3600."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            # timeout_seconds > 3600 should fail
            response = await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"timeout_seconds": 7200},
            )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_case_validates_empty_scorers(
    sample_case: EvalCase, mock_api_key: ApiKey
):
    """PATCH /cases/{id} should validate that scorers list is not empty."""
    app = create_test_app(mock_api_key)

    mock_service = AsyncMock()

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            # Empty scorers should fail
            response = await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"scorers": []},
            )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_scope_grants_all_access(sample_case: EvalCase):
    """ADMIN scope should grant access to all endpoints."""
    from src.auth.middleware import verify_api_key
    from src.db.session import get_db

    admin_key = ApiKey(
        id=uuid4(),
        key_prefix="adminkey",
        name="Admin Key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.ADMIN],  # Only ADMIN scope
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )

    app = FastAPI()
    app.include_router(cases.router, prefix="/api/v1")

    async def mock_verify_api_key():
        return admin_key

    async def mock_get_db():
        return AsyncMock()

    app.dependency_overrides[verify_api_key] = mock_verify_api_key
    app.dependency_overrides[get_db] = mock_get_db

    mock_service = AsyncMock()
    mock_service.get_case.return_value = sample_case
    mock_service.update_case.return_value = sample_case
    mock_service.delete_case.return_value = True

    with patch("src.routers.cases.SuiteService", return_value=mock_service):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            # GET should work with ADMIN
            response = await client.get(f"/api/v1/cases/{sample_case.id}")
            assert response.status_code == 200

            # PATCH should work with ADMIN
            response = await client.patch(
                f"/api/v1/cases/{sample_case.id}",
                json={"name": "updated"},
            )
            assert response.status_code == 200

            # DELETE should work with ADMIN
            response = await client.delete(f"/api/v1/cases/{sample_case.id}")
            assert response.status_code == 204
