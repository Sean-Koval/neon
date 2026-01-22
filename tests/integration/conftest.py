"""Integration test configuration and fixtures.

These fixtures support end-to-end integration tests that verify
the complete evaluation flow without external dependencies.
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Generator
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

# Add required paths for imports
_root_path = Path(__file__).parent.parent.parent
_api_src_path = _root_path / "api" / "src"
_cli_src_path = _root_path / "cli" / "src"
_examples_path = _root_path / "examples"

if str(_api_src_path) not in sys.path:
    sys.path.insert(0, str(_api_src_path))
if str(_cli_src_path) not in sys.path:
    sys.path.insert(0, str(_cli_src_path))
if str(_root_path) not in sys.path:
    sys.path.insert(0, str(_root_path))


def pytest_configure(config):
    """Configure custom pytest markers."""
    config.addinivalue_line(
        "markers",
        "integration: marks tests as integration tests (may be slower)",
    )


# ============================================================================
# Mock Agent Fixtures
# ============================================================================


@pytest.fixture
def mock_agent_pass():
    """Create a mock agent that returns passing responses."""

    def run(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        context = context or {}
        query_lower = query.lower()

        # Return appropriate responses based on query
        if "2 + 2" in query_lower or "2+2" in query_lower:
            return {
                "output": "The answer is 4.",
                "tools_called": [],
                "reasoning": "Simple arithmetic: 2 + 2 = 4",
            }
        elif "capital" in query_lower and "france" in query_lower:
            return {
                "output": "The capital of France is Paris.",
                "tools_called": ["web_search"] if context.get("require_search") else [],
                "reasoning": "Found via search",
            }
        elif "tokyo" in query_lower and "new york" in query_lower:
            return {
                "output": "Tokyo has approximately 14 million people. New York has about 8.3 million. Tokyo is larger.",
                "tools_called": ["web_search", "web_search"] if context.get("require_search") else [],
                "reasoning": "Compared population data",
            }
        else:
            return {
                "output": f"I processed: {query}",
                "tools_called": [],
                "reasoning": "Generic response",
            }

    return run


@pytest.fixture
def mock_agent_fail():
    """Create a mock agent that returns failing responses."""

    def run(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "output": "I don't know.",
            "tools_called": ["wrong_tool"],
            "reasoning": "",
        }

    return run


@pytest.fixture
def mock_agent_error():
    """Create a mock agent that raises exceptions."""

    def run(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        raise RuntimeError("Simulated agent error")

    return run


@pytest.fixture
def mock_agent_timeout():
    """Create a mock agent that times out."""
    import time

    def run(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        time.sleep(10)  # Sleep longer than typical test timeout
        return {"output": "Should not reach here", "tools_called": [], "reasoning": ""}

    return run


@pytest.fixture
def mock_agent_class():
    """Create mock agent as a class with run method."""
    from examples.agents.mock_agent import MockAgent

    return MockAgent(scenario="pass_all")


# ============================================================================
# MLflow Mock Fixtures
# ============================================================================


@pytest.fixture
def mock_mlflow_client():
    """Create a mock MLflow client that doesn't require MLflow server."""
    from src.services.mlflow_client import ExecutionResult, TraceSummary

    mock = MagicMock()
    mock._current_experiment_id = "test-experiment-id"

    # set_experiment returns experiment ID
    mock.set_experiment = MagicMock(return_value="test-experiment-id")

    # Create default trace summary
    def make_trace_summary():
        return TraceSummary(
            trace_id="trace-" + str(uuid4())[:8],
            total_spans=3,
            tool_calls=["web_search"],
            llm_calls=1,
            total_tokens=150,
            input_tokens=50,
            output_tokens=100,
            duration_ms=200,
            status="OK",
            error=None,
        )

    # execute_with_tracing executes agent and returns result
    def execute_with_tracing(
        agent_fn,
        input_data,
        run_name=None,
        tags=None,
        timeout_seconds=None,
    ):
        import time

        start = time.time()
        try:
            output = agent_fn(**input_data)
            execution_time_ms = int((time.time() - start) * 1000)
            return ExecutionResult(
                mlflow_run_id="run-" + str(uuid4())[:8],
                mlflow_trace_id="trace-" + str(uuid4())[:8],
                output=output,
                status="success",
                error=None,
                execution_time_ms=execution_time_ms,
                trace_summary=make_trace_summary(),
            )
        except Exception as e:
            execution_time_ms = int((time.time() - start) * 1000)
            return ExecutionResult(
                mlflow_run_id="run-" + str(uuid4())[:8],
                mlflow_trace_id=None,
                output=None,
                status="error",
                error=str(e),
                execution_time_ms=execution_time_ms,
                trace_summary=None,
            )

    mock.execute_with_tracing = MagicMock(side_effect=execute_with_tracing)

    return mock


@pytest.fixture
def mock_local_mlflow_client():
    """Create a mock local MLflow client for CLI tests."""

    mock = MagicMock()
    mock._tracking_uri = "http://localhost:5000"
    mock.tracking_uri = "http://localhost:5000"
    mock._current_experiment_id = "test-experiment-id"

    mock.set_experiment = MagicMock(return_value="test-experiment-id")

    def execute_with_tracing(
        agent_fn,
        input_data,
        run_name=None,
        tags=None,
        timeout_seconds=None,
    ):
        import time

        start = time.time()
        try:
            output = agent_fn(**input_data)
            execution_time_ms = int((time.time() - start) * 1000)
            return {
                "mlflow_run_id": "run-" + str(uuid4())[:8],
                "mlflow_trace_id": "trace-" + str(uuid4())[:8],
                "output": output,
                "status": "success",
                "error": None,
                "execution_time_ms": execution_time_ms,
                "trace_summary": {
                    "trace_id": "trace-" + str(uuid4())[:8],
                    "total_spans": 2,
                    "tool_calls": [],
                    "llm_calls": 1,
                    "total_tokens": 100,
                    "input_tokens": 30,
                    "output_tokens": 70,
                    "duration_ms": execution_time_ms,
                    "status": "OK",
                },
            }
        except Exception as e:
            execution_time_ms = int((time.time() - start) * 1000)
            return {
                "mlflow_run_id": "run-" + str(uuid4())[:8],
                "mlflow_trace_id": None,
                "output": None,
                "status": "error",
                "error": str(e),
                "execution_time_ms": execution_time_ms,
                "trace_summary": None,
            }

    mock.execute_with_tracing = MagicMock(side_effect=execute_with_tracing)

    return mock


# ============================================================================
# Database Fixtures
# ============================================================================


@pytest.fixture
def temp_db_path(tmp_path) -> Path:
    """Create a temporary database path."""
    return tmp_path / "test_results.db"


@pytest.fixture
def local_database(temp_db_path):
    """Create a local SQLite database for testing."""
    from local_runner import LocalDatabase

    return LocalDatabase(db_path=temp_db_path)


@pytest.fixture
async def async_db_session():
    """Create an async in-memory SQLite session for API tests."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    from src.models.db import Base

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        yield session

    await engine.dispose()


# ============================================================================
# Suite Fixtures
# ============================================================================


@pytest.fixture
def simple_suite_path() -> Path:
    """Get path to the simple-suite.yaml example."""
    return _examples_path / "suites" / "simple-suite.yaml"


@pytest.fixture
def test_suite_yaml(tmp_path) -> Path:
    """Create a test suite YAML file."""
    suite_content = """
name: test-integration-suite
description: Suite for integration tests

default_scorers:
  - tool_selection
  - reasoning

default_min_score: 0.5
default_timeout_seconds: 30

cases:
  - name: arithmetic_test
    description: Test simple arithmetic
    input:
      query: "What is 2 + 2?"
      context: {}
    expected_tools: []
    expected_output_contains:
      - "4"
    min_score: 0.5
    tags:
      - arithmetic

  - name: search_test
    description: Test with tool usage
    input:
      query: "What is the capital of France?"
      context:
        require_search: true
    expected_tools:
      - web_search
    expected_output_contains:
      - "Paris"
    scorers:
      - tool_selection
      - reasoning
      - grounding
    tags:
      - search
"""
    suite_path = tmp_path / "test-suite.yaml"
    suite_path.write_text(suite_content)
    return suite_path


@pytest.fixture
def failing_suite_yaml(tmp_path) -> Path:
    """Create a test suite that should produce failures."""
    suite_content = """
name: failing-suite
description: Suite designed to fail

default_scorers:
  - tool_selection

default_min_score: 0.9
default_timeout_seconds: 30

cases:
  - name: impossible_test
    description: Test that should fail
    input:
      query: "Tell me something random"
      context: {}
    expected_tools:
      - specific_tool_not_called
    expected_output_contains:
      - "impossible_string_not_in_output"
    min_score: 0.99
"""
    suite_path = tmp_path / "failing-suite.yaml"
    suite_path.write_text(suite_content)
    return suite_path


# ============================================================================
# Model Fixtures
# ============================================================================


@pytest.fixture
def sample_project_id() -> str:
    """Generate a sample project ID."""
    return str(uuid4())


@pytest.fixture
def sample_suite_model(sample_project_id):
    """Create a sample EvalSuiteModel for testing."""
    from src.models.db import EvalCaseModel, EvalSuiteModel

    suite_id = uuid4()
    suite = MagicMock(spec=EvalSuiteModel)
    suite.id = suite_id
    suite.project_id = uuid4()
    suite.name = "test-suite"
    suite.description = "Test suite for integration tests"
    suite.agent_id = "test_agent:run"
    suite.config = {"parallel": True}
    suite.created_at = datetime.utcnow()
    suite.updated_at = datetime.utcnow()

    # Create mock cases
    case1 = MagicMock(spec=EvalCaseModel)
    case1.id = uuid4()
    case1.suite_id = suite_id
    case1.name = "test_case_1"
    case1.description = "First test case"
    case1.input = {"query": "What is 2 + 2?", "context": {}}
    case1.expected_tools = []
    case1.expected_tool_sequence = None
    case1.expected_output_contains = ["4"]
    case1.expected_output_pattern = None
    case1.scorers = ["tool_selection", "reasoning"]
    case1.scorer_config = None
    case1.min_score = 0.5
    case1.timeout_seconds = 30
    case1.tags = ["arithmetic"]

    case2 = MagicMock(spec=EvalCaseModel)
    case2.id = uuid4()
    case2.suite_id = suite_id
    case2.name = "test_case_2"
    case2.description = "Second test case with tools"
    case2.input = {"query": "What is the capital of France?", "context": {"require_search": True}}
    case2.expected_tools = ["web_search"]
    case2.expected_tool_sequence = None
    case2.expected_output_contains = ["Paris"]
    case2.expected_output_pattern = None
    case2.scorers = ["tool_selection", "reasoning", "grounding"]
    case2.scorer_config = None
    case2.min_score = 0.5
    case2.timeout_seconds = 30
    case2.tags = ["search"]

    suite.cases = [case1, case2]

    return suite


@pytest.fixture
def sample_run_model(sample_suite_model, sample_project_id):
    """Create a sample EvalRunModel for testing."""
    from src.models.db import EvalRunModel

    run = MagicMock(spec=EvalRunModel)
    run.id = uuid4()
    run.suite_id = sample_suite_model.id
    run.project_id = uuid4()
    run.agent_version = "test-version-1.0"
    run.trigger = "test"
    run.trigger_ref = None
    run.status = "pending"
    run.config = {}
    run.summary = None
    run.started_at = None
    run.completed_at = None
    run.created_at = datetime.utcnow()

    return run


# ============================================================================
# Scorer Fixtures
# ============================================================================


@pytest.fixture
def mock_scorers():
    """Create mock scorers that return configurable scores."""
    from src.scorers.base import ScorerResult

    scorers = {}

    for scorer_name in ["tool_selection", "reasoning", "grounding"]:
        scorer = MagicMock()
        scorer.name = scorer_name

        async def mock_score(case, output, config=None, _name=scorer_name):
            # Return good score for pass scenarios
            if output.get("output") and "don't know" not in output.get("output", "").lower():
                return ScorerResult(
                    score=0.85,
                    reason=f"Good {_name} result",
                    evidence=[f"{_name} check passed"],
                )
            else:
                return ScorerResult(
                    score=0.2,
                    reason=f"Poor {_name} result",
                    evidence=[f"{_name} check failed"],
                )

        scorer.score = AsyncMock(side_effect=mock_score)
        scorers[scorer_name] = scorer

    return scorers


@pytest.fixture
def real_scorers():
    """Get actual scorer instances for integration tests."""
    from src.scorers.grounding import GroundingScorer
    from src.scorers.reasoning import ReasoningScorer
    from src.scorers.tool_selection import ToolSelectionScorer

    return {
        "tool_selection": ToolSelectionScorer(),
        "reasoning": ReasoningScorer(),
        "grounding": GroundingScorer(),
    }


# ============================================================================
# Cleanup Fixtures
# ============================================================================


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset module-level singletons between tests."""
    yield
    # Clean up after each test
    try:
        from src.services.mlflow_client import reset_mlflow_client

        reset_mlflow_client()
    except ImportError:
        pass


@pytest.fixture(autouse=True)
def clean_env():
    """Clean environment variables that might affect tests."""
    # Store original values
    original_env = {
        "MLFLOW_TRACKING_URI": os.environ.get("MLFLOW_TRACKING_URI"),
        "NEON_API_URL": os.environ.get("NEON_API_URL"),
        "NEON_API_KEY": os.environ.get("NEON_API_KEY"),
    }

    yield

    # Restore original values
    for key, value in original_env.items():
        if value is not None:
            os.environ[key] = value
        elif key in os.environ:
            del os.environ[key]
