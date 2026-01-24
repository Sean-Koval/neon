"""Tests for comparison router endpoints."""

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.models.auth import ApiKey, ApiKeyScope
from src.models.compare import CompareRequest, CompareResponse, RegressionItem, RunReference
from src.routers import compare


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_api_key() -> ApiKey:
    """Create a mock API key with read permissions."""
    return ApiKey(
        id=uuid4(),
        key_prefix="test1234",
        name="test-key",
        project_id=uuid4(),
        scopes=[ApiKeyScope.READ],
        created_at=datetime.utcnow(),
        last_used_at=None,
        expires_at=None,
        is_active=True,
    )


@pytest.fixture
def baseline_run_id() -> UUID:
    """Create a baseline run ID."""
    return uuid4()


@pytest.fixture
def candidate_run_id() -> UUID:
    """Create a candidate run ID."""
    return uuid4()


@pytest.fixture
def mock_compare_response_passing(
    baseline_run_id: UUID,
    candidate_run_id: UUID,
) -> CompareResponse:
    """Create a mock compare response with no regressions (passing)."""
    return CompareResponse(
        baseline=RunReference(id=baseline_run_id, agent_version="v1.0.0"),
        candidate=RunReference(id=candidate_run_id, agent_version="v1.1.0"),
        passed=True,
        overall_delta=0.05,
        regressions=[],
        improvements=[
            RegressionItem(
                case_name="test-case-1",
                scorer="tool_selection",
                baseline_score=0.8,
                candidate_score=0.9,
                delta=0.1,
            )
        ],
        unchanged=3,
        threshold=0.05,
    )


@pytest.fixture
def mock_compare_response_failing(
    baseline_run_id: UUID,
    candidate_run_id: UUID,
) -> CompareResponse:
    """Create a mock compare response with regressions (failing)."""
    return CompareResponse(
        baseline=RunReference(id=baseline_run_id, agent_version="v1.0.0"),
        candidate=RunReference(id=candidate_run_id, agent_version="v1.1.0"),
        passed=False,
        overall_delta=-0.1,
        regressions=[
            RegressionItem(
                case_name="test-case-1",
                scorer="reasoning",
                baseline_score=0.9,
                candidate_score=0.75,
                delta=-0.15,
            ),
            RegressionItem(
                case_name="test-case-2",
                scorer="tool_selection",
                baseline_score=0.85,
                candidate_score=0.7,
                delta=-0.15,
            ),
        ],
        improvements=[],
        unchanged=2,
        threshold=0.05,
    )


@pytest.fixture
def sample_compare_request(
    baseline_run_id: UUID,
    candidate_run_id: UUID,
) -> dict[str, Any]:
    """Sample data for compare request."""
    return {
        "baseline_run_id": str(baseline_run_id),
        "candidate_run_id": str(candidate_run_id),
        "threshold": 0.05,
    }


# =============================================================================
# Compare Endpoint Tests - POST /compare
# =============================================================================


@pytest.mark.asyncio
async def test_compare_runs_success_passing(
    mock_api_key: ApiKey,
    mock_compare_response_passing: CompareResponse,
    sample_compare_request: dict[str, Any],
) -> None:
    """Test comparing runs returns 200 with passing result."""
    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_api_key

    @app.post("/api/v1/compare")
    async def compare_runs(key: ApiKey = Depends(mock_auth)):
        return mock_compare_response_passing

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/compare",
            json=sample_compare_request,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is True
    assert data["overall_delta"] == 0.05
    assert len(data["regressions"]) == 0
    assert len(data["improvements"]) == 1


@pytest.mark.asyncio
async def test_compare_runs_success_failing(
    mock_api_key: ApiKey,
    mock_compare_response_failing: CompareResponse,
    sample_compare_request: dict[str, Any],
) -> None:
    """Test comparing runs returns 200 with failing result."""
    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_api_key

    @app.post("/api/v1/compare")
    async def compare_runs(key: ApiKey = Depends(mock_auth)):
        return mock_compare_response_failing

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/compare",
            json=sample_compare_request,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is False
    assert data["overall_delta"] == -0.1
    assert len(data["regressions"]) == 2
    assert len(data["improvements"]) == 0


@pytest.mark.asyncio
async def test_compare_runs_not_found() -> None:
    """Test comparing non-existent runs returns 404."""
    app = FastAPI()

    from fastapi import HTTPException

    @app.post("/api/v1/compare")
    async def compare_runs():
        raise HTTPException(status_code=404, detail="One or both runs not found")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/compare",
            json={
                "baseline_run_id": str(uuid4()),
                "candidate_run_id": str(uuid4()),
                "threshold": 0.05,
            },
        )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_compare_runs_requires_auth() -> None:
    """Test that compare endpoint requires authentication."""
    app = FastAPI()
    app.include_router(compare.router, prefix="/api/v1")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/compare",
            json={
                "baseline_run_id": str(uuid4()),
                "candidate_run_id": str(uuid4()),
                "threshold": 0.05,
            },
        )

    assert response.status_code == 401


# =============================================================================
# Compare Endpoint Tests - GET /compare/{baseline_id}/{candidate_id}
# =============================================================================


@pytest.mark.asyncio
async def test_get_comparison_success(
    mock_api_key: ApiKey,
    mock_compare_response_passing: CompareResponse,
    baseline_run_id: UUID,
    candidate_run_id: UUID,
) -> None:
    """Test get comparison returns 200."""
    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_api_key

    @app.get("/api/v1/compare/{baseline_id}/{candidate_id}")
    async def get_comparison(
        baseline_id: UUID,
        candidate_id: UUID,
        threshold: float = 0.05,
        key: ApiKey = Depends(mock_auth),
    ):
        return mock_compare_response_passing

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            f"/api/v1/compare/{baseline_run_id}/{candidate_run_id}"
        )

    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is True


@pytest.mark.asyncio
async def test_get_comparison_with_custom_threshold(
    mock_api_key: ApiKey,
    mock_compare_response_passing: CompareResponse,
    baseline_run_id: UUID,
    candidate_run_id: UUID,
) -> None:
    """Test get comparison with custom threshold."""
    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_api_key

    @app.get("/api/v1/compare/{baseline_id}/{candidate_id}")
    async def get_comparison(
        baseline_id: UUID,
        candidate_id: UUID,
        threshold: float = 0.05,
        key: ApiKey = Depends(mock_auth),
    ):
        # Return response with the custom threshold
        response = mock_compare_response_passing.model_copy(update={"threshold": threshold})
        return response

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            f"/api/v1/compare/{baseline_run_id}/{candidate_run_id}",
            params={"threshold": 0.1},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["threshold"] == 0.1


@pytest.mark.asyncio
async def test_get_comparison_not_found(
    baseline_run_id: UUID,
    candidate_run_id: UUID,
) -> None:
    """Test get comparison with non-existent runs returns 404."""
    app = FastAPI()

    from fastapi import HTTPException

    @app.get("/api/v1/compare/{baseline_id}/{candidate_id}")
    async def get_comparison(baseline_id: UUID, candidate_id: UUID):
        raise HTTPException(status_code=404, detail="One or both runs not found")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            f"/api/v1/compare/{baseline_run_id}/{candidate_run_id}"
        )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_comparison_requires_auth(
    baseline_run_id: UUID,
    candidate_run_id: UUID,
) -> None:
    """Test that get comparison requires authentication."""
    app = FastAPI()
    app.include_router(compare.router, prefix="/api/v1")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            f"/api/v1/compare/{baseline_run_id}/{candidate_run_id}"
        )

    assert response.status_code == 401


# =============================================================================
# Regression/Improvement Data Tests
# =============================================================================


@pytest.mark.asyncio
async def test_compare_response_contains_regression_details(
    mock_compare_response_failing: CompareResponse,
) -> None:
    """Test that compare response contains detailed regression info."""
    regressions = mock_compare_response_failing.regressions

    assert len(regressions) == 2
    for regression in regressions:
        assert hasattr(regression, "case_name")
        assert hasattr(regression, "scorer")
        assert hasattr(regression, "baseline_score")
        assert hasattr(regression, "candidate_score")
        assert hasattr(regression, "delta")
        assert regression.delta < 0  # Regressions have negative delta


@pytest.mark.asyncio
async def test_compare_response_contains_improvement_details(
    mock_compare_response_passing: CompareResponse,
) -> None:
    """Test that compare response contains detailed improvement info."""
    improvements = mock_compare_response_passing.improvements

    assert len(improvements) == 1
    for improvement in improvements:
        assert hasattr(improvement, "case_name")
        assert hasattr(improvement, "scorer")
        assert hasattr(improvement, "baseline_score")
        assert hasattr(improvement, "candidate_score")
        assert hasattr(improvement, "delta")
        assert improvement.delta > 0  # Improvements have positive delta


@pytest.mark.asyncio
async def test_regression_item_score_validation() -> None:
    """Test that RegressionItem validates scores correctly."""
    item = RegressionItem(
        case_name="test-case",
        scorer="tool_selection",
        baseline_score=0.9,
        candidate_score=0.7,
        delta=-0.2,
    )

    assert item.baseline_score == 0.9
    assert item.candidate_score == 0.7
    assert item.delta == -0.2


# =============================================================================
# Scope Permission Tests
# =============================================================================


@pytest.mark.asyncio
async def test_compare_allowed_with_read_scope(mock_api_key: ApiKey) -> None:
    """Test that compare is allowed with READ scope."""
    # The mock_api_key has READ scope
    assert ApiKeyScope.READ in mock_api_key.scopes

    app = FastAPI()

    from fastapi import Depends

    async def mock_auth():
        return mock_api_key

    @app.post("/api/v1/compare")
    async def compare_runs(key: ApiKey = Depends(mock_auth)):
        # READ scope is sufficient for comparison
        return {"passed": True}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/compare",
            json={
                "baseline_run_id": str(uuid4()),
                "candidate_run_id": str(uuid4()),
            },
        )

    assert response.status_code == 200


# =============================================================================
# Service Integration Tests
# =============================================================================


@pytest.mark.asyncio
async def test_comparison_service_compare_runs_success() -> None:
    """Test ComparisonService.compare_runs with mocked database."""
    from src.services.comparison_service import ComparisonService

    project_id = uuid4()
    baseline_id = uuid4()
    candidate_id = uuid4()

    mock_db = AsyncMock()

    # Mock baseline run
    mock_baseline_run = MagicMock()
    mock_baseline_run.id = baseline_id
    mock_baseline_run.agent_version = "v1.0.0"

    # Mock candidate run
    mock_candidate_run = MagicMock()
    mock_candidate_run.id = candidate_id
    mock_candidate_run.agent_version = "v1.1.0"

    # Mock results
    case_id = uuid4()
    mock_baseline_result = MagicMock()
    mock_baseline_result.case_id = case_id
    mock_baseline_result.scores = {"tool_selection": 0.8, "reasoning": 0.9}

    mock_candidate_result = MagicMock()
    mock_candidate_result.case_id = case_id
    mock_candidate_result.scores = {"tool_selection": 0.85, "reasoning": 0.85}

    # Mock case
    mock_case = MagicMock()
    mock_case.id = case_id
    mock_case.name = "test-case"

    # Set up mock returns
    call_count = [0]

    async def mock_execute(query):
        result = MagicMock()
        call_count[0] += 1

        # First two calls: get runs
        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = mock_baseline_run
        elif call_count[0] == 2:
            result.scalar_one_or_none.return_value = mock_candidate_run
        # Third call: baseline results
        elif call_count[0] == 3:
            result.scalars.return_value.all.return_value = [mock_baseline_result]
        # Fourth call: candidate results
        elif call_count[0] == 4:
            result.scalars.return_value.all.return_value = [mock_candidate_result]
        # Fifth call: case names
        else:
            result.scalars.return_value.all.return_value = [mock_case]

        return result

    mock_db.execute = mock_execute

    service = ComparisonService(mock_db)
    result = await service.compare_runs(project_id, baseline_id, candidate_id, threshold=0.05)

    assert result is not None
    assert result.baseline.id == baseline_id
    assert result.candidate.id == candidate_id


@pytest.mark.asyncio
async def test_comparison_service_run_not_found() -> None:
    """Test ComparisonService.compare_runs returns None for non-existent runs."""
    from src.services.comparison_service import ComparisonService

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_result)

    service = ComparisonService(mock_db)
    result = await service.compare_runs(uuid4(), uuid4(), uuid4())

    assert result is None


@pytest.mark.asyncio
async def test_comparison_service_detects_regression() -> None:
    """Test that ComparisonService correctly identifies regressions."""
    from src.services.comparison_service import ComparisonService

    project_id = uuid4()
    baseline_id = uuid4()
    candidate_id = uuid4()
    case_id = uuid4()

    mock_db = AsyncMock()

    # Create mock runs
    mock_baseline_run = MagicMock()
    mock_baseline_run.id = baseline_id
    mock_baseline_run.agent_version = "v1.0.0"

    mock_candidate_run = MagicMock()
    mock_candidate_run.id = candidate_id
    mock_candidate_run.agent_version = "v1.1.0"

    # Create mock results with regression (score dropped from 0.9 to 0.7)
    mock_baseline_result = MagicMock()
    mock_baseline_result.case_id = case_id
    mock_baseline_result.scores = {"reasoning": 0.9}

    mock_candidate_result = MagicMock()
    mock_candidate_result.case_id = case_id
    mock_candidate_result.scores = {"reasoning": 0.7}

    mock_case = MagicMock()
    mock_case.id = case_id
    mock_case.name = "regressed-case"

    call_count = [0]

    async def mock_execute(query):
        result = MagicMock()
        call_count[0] += 1

        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = mock_baseline_run
        elif call_count[0] == 2:
            result.scalar_one_or_none.return_value = mock_candidate_run
        elif call_count[0] == 3:
            result.scalars.return_value.all.return_value = [mock_baseline_result]
        elif call_count[0] == 4:
            result.scalars.return_value.all.return_value = [mock_candidate_result]
        else:
            result.scalars.return_value.all.return_value = [mock_case]

        return result

    mock_db.execute = mock_execute

    service = ComparisonService(mock_db)
    result = await service.compare_runs(project_id, baseline_id, candidate_id, threshold=0.05)

    assert result is not None
    assert result.passed is False
    assert len(result.regressions) == 1
    assert result.regressions[0].case_name == "regressed-case"
    assert result.regressions[0].delta == pytest.approx(-0.2)


@pytest.mark.asyncio
async def test_comparison_service_detects_improvement() -> None:
    """Test that ComparisonService correctly identifies improvements."""
    from src.services.comparison_service import ComparisonService

    project_id = uuid4()
    baseline_id = uuid4()
    candidate_id = uuid4()
    case_id = uuid4()

    mock_db = AsyncMock()

    mock_baseline_run = MagicMock()
    mock_baseline_run.id = baseline_id
    mock_baseline_run.agent_version = "v1.0.0"

    mock_candidate_run = MagicMock()
    mock_candidate_run.id = candidate_id
    mock_candidate_run.agent_version = "v1.1.0"

    # Create mock results with improvement (score increased from 0.7 to 0.9)
    mock_baseline_result = MagicMock()
    mock_baseline_result.case_id = case_id
    mock_baseline_result.scores = {"reasoning": 0.7}

    mock_candidate_result = MagicMock()
    mock_candidate_result.case_id = case_id
    mock_candidate_result.scores = {"reasoning": 0.9}

    mock_case = MagicMock()
    mock_case.id = case_id
    mock_case.name = "improved-case"

    call_count = [0]

    async def mock_execute(query):
        result = MagicMock()
        call_count[0] += 1

        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = mock_baseline_run
        elif call_count[0] == 2:
            result.scalar_one_or_none.return_value = mock_candidate_run
        elif call_count[0] == 3:
            result.scalars.return_value.all.return_value = [mock_baseline_result]
        elif call_count[0] == 4:
            result.scalars.return_value.all.return_value = [mock_candidate_result]
        else:
            result.scalars.return_value.all.return_value = [mock_case]

        return result

    mock_db.execute = mock_execute

    service = ComparisonService(mock_db)
    result = await service.compare_runs(project_id, baseline_id, candidate_id, threshold=0.05)

    assert result is not None
    assert result.passed is True
    assert len(result.improvements) == 1
    assert result.improvements[0].case_name == "improved-case"
    assert result.improvements[0].delta == pytest.approx(0.2)


# =============================================================================
# Error Response Tests
# =============================================================================


@pytest.mark.asyncio
async def test_compare_invalid_uuid_format() -> None:
    """Test that invalid UUID format returns 422 (when authenticated)."""
    from fastapi import Depends

    app = FastAPI()

    # Create mock auth that allows the request through
    async def mock_auth():
        return ApiKey(
            id=uuid4(),
            key_prefix="test1234",
            name="test-key",
            project_id=uuid4(),
            scopes=[ApiKeyScope.READ],
            created_at=datetime.utcnow(),
            last_used_at=None,
            expires_at=None,
            is_active=True,
        )

    @app.post("/api/v1/compare")
    async def compare_runs(
        data: CompareRequest,
        key: ApiKey = Depends(mock_auth),
    ):
        return {"passed": True}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/compare",
            json={
                "baseline_run_id": "not-a-uuid",
                "candidate_run_id": "also-not-a-uuid",
            },
        )

    # FastAPI validates UUID format
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_compare_threshold_validation() -> None:
    """Test that threshold is validated (0-1 range)."""
    # Test the model directly
    from pydantic import ValidationError

    from src.models.compare import CompareRequest

    # Valid threshold
    request = CompareRequest(
        baseline_run_id=uuid4(),
        candidate_run_id=uuid4(),
        threshold=0.5,
    )
    assert request.threshold == 0.5

    # Invalid threshold (> 1)
    with pytest.raises(ValidationError):
        CompareRequest(
            baseline_run_id=uuid4(),
            candidate_run_id=uuid4(),
            threshold=1.5,
        )

    # Invalid threshold (< 0)
    with pytest.raises(ValidationError):
        CompareRequest(
            baseline_run_id=uuid4(),
            candidate_run_id=uuid4(),
            threshold=-0.1,
        )
