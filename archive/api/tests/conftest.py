"""Test configuration and fixtures."""

from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.config import Settings
from src.models.db import EvalCaseModel, EvalSuiteModel


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


# Grounding scorer specific fixtures


@pytest.fixture
def mock_suite() -> EvalSuiteModel:
    """Create a mock eval suite."""
    suite = MagicMock(spec=EvalSuiteModel)
    suite.id = uuid4()
    suite.name = "test-suite"
    suite.agent_id = "test-agent"
    return suite


@pytest.fixture
def make_eval_case(mock_suite: EvalSuiteModel):
    """Factory fixture to create EvalCaseModel instances."""

    def _make_case(
        name: str = "test-case",
        input_data: dict[str, Any] | None = None,
        expected_tools: list[str] | None = None,
        expected_tool_sequence: list[str] | None = None,
        expected_output_contains: list[str] | None = None,
        expected_output_pattern: str | None = None,
        scorers: list[str] | None = None,
        min_score: float = 0.7,
    ) -> EvalCaseModel:
        case = MagicMock(spec=EvalCaseModel)
        case.id = uuid4()
        case.suite_id = mock_suite.id
        case.name = name
        case.input = input_data or {"query": "test query"}
        case.expected_tools = expected_tools
        case.expected_tool_sequence = expected_tool_sequence
        case.expected_output_contains = expected_output_contains
        case.expected_output_pattern = expected_output_pattern
        case.scorers = scorers or ["grounding"]
        case.scorer_config = None
        case.min_score = min_score
        case.timeout_seconds = 300
        case.tags = []
        case.created_at = datetime.utcnow()
        case.updated_at = datetime.utcnow()
        return case

    return _make_case


@pytest.fixture
def mock_llm_judge_response():
    """Factory for creating mock LLM judge responses."""

    def _make_response(
        score: int = 8,
        factual_accuracy: int = 3,
        evidence_support: int = 3,
        content_match: int = 2,
        grounded_claims: list[str] | None = None,
        ungrounded_claims: list[str] | None = None,
        reason: str = "Response is well grounded",
    ) -> dict[str, Any]:
        return {
            "score": score,
            "factual_accuracy": factual_accuracy,
            "evidence_support": evidence_support,
            "content_match": content_match,
            "grounded_claims": grounded_claims or ["Claim 1 is supported"],
            "ungrounded_claims": ungrounded_claims or [],
            "reason": reason,
        }

    return _make_response


@pytest.fixture
def mock_llm_judge(mock_llm_judge_response) -> AsyncMock:
    """Create a mock LLM judge."""
    mock = AsyncMock()
    mock.evaluate = AsyncMock(return_value=mock_llm_judge_response())
    return mock
