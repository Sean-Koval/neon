"""Tests for evaluation Pydantic models.

Tests cover:
- Model instantiation with valid data
- JSON serialization/deserialization round-trips
- Validation edge cases (boundary values, invalid values)
- Field constraints
- Model validators
"""

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.models.eval import (
    CompareRequest,
    EvalCase,
    EvalCaseBase,
    EvalResult,
    EvalResultList,
    EvalResultStatus,
    EvalRun,
    EvalRunCreate,
    EvalRunList,
    EvalRunStatus,
    EvalRunSummary,
    EvalSuite,
    EvalSuiteBase,
    EvalSuiteList,
    ImprovementDetail,
    RegressionDetail,
    ScoreDetail,
    ScorerType,
    TriggerType,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def valid_case_data() -> dict:
    """Valid EvalCaseBase data."""
    return {
        "name": "test_case_1",
        "description": "A test case",
        "input": {"query": "What is 2+2?"},
        "expected_tools": ["calculator"],
        "expected_output_contains": ["4"],
        "scorers": [ScorerType.TOOL_SELECTION, ScorerType.REASONING],
        "min_score": 0.7,
        "tags": ["math", "simple"],
        "timeout_seconds": 60,
    }


@pytest.fixture
def valid_suite_data(valid_case_data: dict) -> dict:
    """Valid EvalSuiteBase data."""
    return {
        "name": "test_suite",
        "description": "A test suite",
        "agent_id": "test-agent-v1",
        "default_scorers": [ScorerType.TOOL_SELECTION],
        "default_min_score": 0.8,
        "default_timeout_seconds": 120,
        "parallel": True,
        "stop_on_failure": False,
    }


@pytest.fixture
def valid_run_summary_data() -> dict:
    """Valid EvalRunSummary data."""
    return {
        "total_cases": 10,
        "passed": 7,
        "failed": 2,
        "errored": 1,
        "avg_score": 0.75,
        "scores_by_type": {
            "tool_selection": 0.8,
            "reasoning": 0.7,
        },
        "execution_time_ms": 5000,
    }


@pytest.fixture
def valid_result_data() -> dict:
    """Valid EvalResult data."""
    return {
        "id": uuid4(),
        "run_id": uuid4(),
        "case_id": uuid4(),
        "case_name": "test_case",
        "mlflow_run_id": "mlflow-123",
        "mlflow_trace_id": "trace-456",
        "status": EvalResultStatus.SUCCESS,
        "output": {"result": "4"},
        "scores": {"tool_selection": 0.9, "reasoning": 0.8},
        "score_details": {
            "tool_selection": {
                "score": 0.9,
                "reason": "Correct tool selected",
                "evidence": ["Used calculator for math"],
            }
        },
        "passed": True,
        "execution_time_ms": 150,
        "error": None,
        "created_at": datetime.now(UTC),
    }


# =============================================================================
# ScorerType Enum Tests
# =============================================================================


class TestScorerType:
    """Tests for ScorerType enum."""

    def test_all_values_exist(self) -> None:
        """All expected scorer types should exist."""
        assert ScorerType.TOOL_SELECTION == "tool_selection"
        assert ScorerType.REASONING == "reasoning"
        assert ScorerType.GROUNDING == "grounding"
        assert ScorerType.EFFICIENCY == "efficiency"
        assert ScorerType.CUSTOM == "custom"

    def test_string_serialization(self) -> None:
        """Enum should serialize to string value."""
        # str(Enum) includes the class name, .value gives just the string
        assert ScorerType.TOOL_SELECTION.value == "tool_selection"
        # In JSON serialization, Pydantic uses the value
        assert ScorerType.TOOL_SELECTION == "tool_selection"  # str enum comparison


class TestEvalRunStatus:
    """Tests for EvalRunStatus enum."""

    def test_all_statuses_exist(self) -> None:
        """All expected statuses should exist."""
        assert EvalRunStatus.PENDING == "pending"
        assert EvalRunStatus.RUNNING == "running"
        assert EvalRunStatus.COMPLETED == "completed"
        assert EvalRunStatus.FAILED == "failed"
        assert EvalRunStatus.CANCELLED == "cancelled"


class TestEvalResultStatus:
    """Tests for EvalResultStatus enum."""

    def test_all_statuses_exist(self) -> None:
        """All expected result statuses should exist."""
        assert EvalResultStatus.SUCCESS == "success"
        assert EvalResultStatus.FAILED == "failed"
        assert EvalResultStatus.ERROR == "error"
        assert EvalResultStatus.TIMEOUT == "timeout"


class TestTriggerType:
    """Tests for TriggerType enum."""

    def test_all_triggers_exist(self) -> None:
        """All expected trigger types should exist."""
        assert TriggerType.MANUAL == "manual"
        assert TriggerType.CI == "ci"
        assert TriggerType.SCHEDULED == "scheduled"


# =============================================================================
# EvalCaseBase Tests
# =============================================================================


class TestEvalCaseBase:
    """Tests for EvalCaseBase model."""

    def test_valid_creation(self, valid_case_data: dict) -> None:
        """Should create with valid data."""
        case = EvalCaseBase(**valid_case_data)
        assert case.name == "test_case_1"
        assert case.min_score == 0.7

    def test_minimal_creation(self) -> None:
        """Should create with only required fields."""
        case = EvalCaseBase(
            name="minimal_case",
            input={"query": "test"},
        )
        assert case.name == "minimal_case"
        assert case.min_score == 0.7  # default
        assert case.timeout_seconds == 300  # default
        assert case.scorers == [ScorerType.TOOL_SELECTION, ScorerType.REASONING]

    def test_name_validation_valid(self) -> None:
        """Valid names should pass validation."""
        valid_names = [
            "test_case",
            "test-case",
            "test.case",
            "TestCase123",
            "test_case_1",
        ]
        for name in valid_names:
            case = EvalCaseBase(name=name, input={"query": "test"})
            assert case.name == name

    def test_name_validation_invalid(self) -> None:
        """Invalid names should fail validation."""
        invalid_names = [
            "test case",  # space
            "test@case",  # special char
            "test/case",  # slash
            "",  # empty
        ]
        for name in invalid_names:
            with pytest.raises(ValidationError):
                EvalCaseBase(name=name, input={"query": "test"})

    def test_min_score_boundary_valid(self) -> None:
        """Valid min_score boundaries should pass."""
        # Lower bound
        case = EvalCaseBase(name="test", input={"q": "t"}, min_score=0.0)
        assert case.min_score == 0.0

        # Upper bound
        case = EvalCaseBase(name="test", input={"q": "t"}, min_score=1.0)
        assert case.min_score == 1.0

    def test_min_score_boundary_invalid(self) -> None:
        """Invalid min_score should fail validation."""
        with pytest.raises(ValidationError):
            EvalCaseBase(name="test", input={"q": "t"}, min_score=-0.1)

        with pytest.raises(ValidationError):
            EvalCaseBase(name="test", input={"q": "t"}, min_score=1.1)

    def test_timeout_boundary_valid(self) -> None:
        """Valid timeout boundaries should pass."""
        # Lower bound
        case = EvalCaseBase(name="test", input={"q": "t"}, timeout_seconds=1)
        assert case.timeout_seconds == 1

        # Upper bound
        case = EvalCaseBase(name="test", input={"q": "t"}, timeout_seconds=3600)
        assert case.timeout_seconds == 3600

    def test_timeout_boundary_invalid(self) -> None:
        """Invalid timeout should fail validation."""
        with pytest.raises(ValidationError):
            EvalCaseBase(name="test", input={"q": "t"}, timeout_seconds=0)

        with pytest.raises(ValidationError):
            EvalCaseBase(name="test", input={"q": "t"}, timeout_seconds=3601)

    def test_empty_scorers_invalid(self) -> None:
        """Empty scorers list should fail validation."""
        with pytest.raises(ValidationError):
            EvalCaseBase(name="test", input={"q": "t"}, scorers=[])

    def test_both_tool_expectations_invalid(self) -> None:
        """Setting both expected_tools and expected_tool_sequence should fail."""
        with pytest.raises(ValidationError) as exc_info:
            EvalCaseBase(
                name="test",
                input={"q": "t"},
                expected_tools=["tool1"],
                expected_tool_sequence=["tool1", "tool2"],
            )
        assert "Cannot specify both" in str(exc_info.value)

    def test_json_serialization_roundtrip(self, valid_case_data: dict) -> None:
        """Model should serialize to JSON and back correctly."""
        case = EvalCaseBase(**valid_case_data)
        json_str = case.model_dump_json()
        parsed = json.loads(json_str)
        case_restored = EvalCaseBase(**parsed)

        assert case_restored.name == case.name
        assert case_restored.min_score == case.min_score
        assert case_restored.input == case.input


# =============================================================================
# EvalSuiteBase Tests
# =============================================================================


class TestEvalSuiteBase:
    """Tests for EvalSuiteBase model."""

    def test_valid_creation(self, valid_suite_data: dict) -> None:
        """Should create with valid data."""
        suite = EvalSuiteBase(**valid_suite_data)
        assert suite.name == "test_suite"
        assert suite.agent_id == "test-agent-v1"

    def test_minimal_creation(self) -> None:
        """Should create with only required fields."""
        suite = EvalSuiteBase(
            name="minimal_suite",
            agent_id="agent-1",
        )
        assert suite.name == "minimal_suite"
        assert suite.default_min_score == 0.7
        assert suite.parallel is True

    def test_name_validation_invalid(self) -> None:
        """Invalid suite names should fail validation."""
        with pytest.raises(ValidationError):
            EvalSuiteBase(name="invalid name", agent_id="agent")

    def test_default_min_score_boundary(self) -> None:
        """Default min_score should validate boundaries."""
        # Valid
        suite = EvalSuiteBase(name="test", agent_id="agent", default_min_score=0.0)
        assert suite.default_min_score == 0.0

        # Invalid
        with pytest.raises(ValidationError):
            EvalSuiteBase(name="test", agent_id="agent", default_min_score=1.5)

    def test_json_serialization_roundtrip(self, valid_suite_data: dict) -> None:
        """Model should serialize to JSON and back correctly."""
        suite = EvalSuiteBase(**valid_suite_data)
        json_str = suite.model_dump_json()
        parsed = json.loads(json_str)
        suite_restored = EvalSuiteBase(**parsed)

        assert suite_restored.name == suite.name
        assert suite_restored.agent_id == suite.agent_id


# =============================================================================
# EvalRunSummary Tests
# =============================================================================


class TestEvalRunSummary:
    """Tests for EvalRunSummary model."""

    def test_valid_creation(self, valid_run_summary_data: dict) -> None:
        """Should create with valid data."""
        summary = EvalRunSummary(**valid_run_summary_data)
        assert summary.total_cases == 10
        assert summary.passed == 7
        assert summary.avg_score == 0.75

    def test_counts_must_sum_to_total(self) -> None:
        """passed + failed + errored must equal total_cases."""
        with pytest.raises(ValidationError) as exc_info:
            EvalRunSummary(
                total_cases=10,
                passed=5,
                failed=3,
                errored=1,  # 5+3+1 = 9, not 10
                avg_score=0.7,
                execution_time_ms=1000,
            )
        assert "passed + failed + errored must equal total_cases" in str(exc_info.value)

    def test_avg_score_boundary(self) -> None:
        """avg_score should be between 0 and 1."""
        with pytest.raises(ValidationError):
            EvalRunSummary(
                total_cases=1,
                passed=1,
                failed=0,
                errored=0,
                avg_score=1.5,
                execution_time_ms=100,
            )

    def test_non_negative_counts(self) -> None:
        """Counts should not be negative."""
        with pytest.raises(ValidationError):
            EvalRunSummary(
                total_cases=-1,
                passed=0,
                failed=0,
                errored=0,
                avg_score=0.5,
                execution_time_ms=100,
            )


# =============================================================================
# EvalRunCreate Tests
# =============================================================================


class TestEvalRunCreate:
    """Tests for EvalRunCreate model."""

    def test_minimal_creation(self) -> None:
        """Should create with only defaults."""
        run = EvalRunCreate()
        assert run.trigger == TriggerType.MANUAL
        assert run.agent_version is None

    def test_full_creation(self) -> None:
        """Should create with all fields."""
        run = EvalRunCreate(
            agent_version="abc123",
            trigger=TriggerType.CI,
            trigger_ref="PR-456",
            config={"timeout_override": 600},
        )
        assert run.agent_version == "abc123"
        assert run.trigger == TriggerType.CI
        assert run.trigger_ref == "PR-456"


# =============================================================================
# EvalResult Tests
# =============================================================================


class TestEvalResult:
    """Tests for EvalResult model."""

    def test_valid_creation(self, valid_result_data: dict) -> None:
        """Should create with valid data."""
        result = EvalResult(**valid_result_data)
        assert result.passed is True
        assert result.status == EvalResultStatus.SUCCESS

    def test_error_required_for_error_status(self) -> None:
        """Error message required when status is ERROR."""
        with pytest.raises(ValidationError) as exc_info:
            EvalResult(
                id=uuid4(),
                run_id=uuid4(),
                case_id=uuid4(),
                case_name="test",
                status=EvalResultStatus.ERROR,
                passed=False,
                created_at=datetime.now(UTC),
                error=None,  # Should fail
            )
        assert "error must be set" in str(exc_info.value)

    def test_error_required_for_timeout_status(self) -> None:
        """Error message required when status is TIMEOUT."""
        with pytest.raises(ValidationError):
            EvalResult(
                id=uuid4(),
                run_id=uuid4(),
                case_id=uuid4(),
                case_name="test",
                status=EvalResultStatus.TIMEOUT,
                passed=False,
                created_at=datetime.now(UTC),
                error=None,  # Should fail
            )

    def test_error_status_with_error_message(self) -> None:
        """Should accept error status with error message."""
        result = EvalResult(
            id=uuid4(),
            run_id=uuid4(),
            case_id=uuid4(),
            case_name="test",
            status=EvalResultStatus.ERROR,
            passed=False,
            created_at=datetime.now(UTC),
            error="Something went wrong",
        )
        assert result.error == "Something went wrong"

    def test_json_serialization_roundtrip(self, valid_result_data: dict) -> None:
        """Model should serialize to JSON and back correctly."""
        result = EvalResult(**valid_result_data)
        json_str = result.model_dump_json()
        parsed = json.loads(json_str)
        result_restored = EvalResult(**parsed)

        assert result_restored.case_name == result.case_name
        assert result_restored.passed == result.passed


# =============================================================================
# ScoreDetail Tests
# =============================================================================


class TestScoreDetail:
    """Tests for ScoreDetail model."""

    def test_valid_creation(self) -> None:
        """Should create with valid data."""
        detail = ScoreDetail(
            score=0.85,
            reason="Tool was selected correctly",
            evidence=["Used calculator for arithmetic"],
        )
        assert detail.score == 0.85
        assert detail.reason == "Tool was selected correctly"

    def test_score_boundary_valid(self) -> None:
        """Score should be between 0 and 1."""
        detail = ScoreDetail(score=0.0, reason="No score")
        assert detail.score == 0.0

        detail = ScoreDetail(score=1.0, reason="Perfect score")
        assert detail.score == 1.0

    def test_score_boundary_invalid(self) -> None:
        """Score outside 0-1 should fail."""
        with pytest.raises(ValidationError):
            ScoreDetail(score=1.5, reason="Invalid")

    def test_empty_reason_invalid(self) -> None:
        """Empty reason should fail."""
        with pytest.raises(ValidationError):
            ScoreDetail(score=0.5, reason="")


# =============================================================================
# Comparison Model Tests
# =============================================================================


class TestCompareRequest:
    """Tests for CompareRequest model."""

    def test_valid_creation(self) -> None:
        """Should create with valid data."""
        request = CompareRequest(
            baseline_run_id=uuid4(),
            candidate_run_id=uuid4(),
            threshold=0.05,
        )
        assert request.threshold == 0.05

    def test_default_threshold(self) -> None:
        """Should use default threshold."""
        request = CompareRequest(
            baseline_run_id=uuid4(),
            candidate_run_id=uuid4(),
        )
        assert request.threshold == 0.05

    def test_threshold_boundary(self) -> None:
        """Threshold should be between 0 and 1."""
        with pytest.raises(ValidationError):
            CompareRequest(
                baseline_run_id=uuid4(),
                candidate_run_id=uuid4(),
                threshold=1.5,
            )


class TestRegressionDetail:
    """Tests for RegressionDetail model."""

    def test_valid_creation(self) -> None:
        """Should create with valid data."""
        detail = RegressionDetail(
            case_name="test_case",
            scorer="tool_selection",
            baseline_score=0.9,
            candidate_score=0.6,
            delta=-0.3,
        )
        assert detail.delta == -0.3


class TestImprovementDetail:
    """Tests for ImprovementDetail model."""

    def test_valid_creation(self) -> None:
        """Should create with valid data."""
        detail = ImprovementDetail(
            case_name="test_case",
            scorer="efficiency",
            baseline_score=0.7,
            candidate_score=0.85,
            delta=0.15,
        )
        assert detail.delta == 0.15


# =============================================================================
# List Model Tests
# =============================================================================


class TestEvalSuiteList:
    """Tests for EvalSuiteList model."""

    def test_empty_list(self) -> None:
        """Should accept empty list."""
        suite_list = EvalSuiteList(items=[], total=0)
        assert suite_list.total == 0


class TestEvalRunList:
    """Tests for EvalRunList model."""

    def test_negative_total_invalid(self) -> None:
        """Total should not be negative."""
        with pytest.raises(ValidationError):
            EvalRunList(items=[], total=-1)


class TestEvalResultList:
    """Tests for EvalResultList model."""

    def test_negative_total_invalid(self) -> None:
        """Total should not be negative."""
        with pytest.raises(ValidationError):
            EvalResultList(items=[], total=-1)


# =============================================================================
# Full Model Tests (with IDs and timestamps)
# =============================================================================


class TestEvalCase:
    """Tests for full EvalCase model (response model with IDs)."""

    def test_valid_creation(self) -> None:
        """Should create with all required fields."""
        now = datetime.now(UTC)
        case = EvalCase(
            id=uuid4(),
            suite_id=uuid4(),
            name="test_case",
            input={"query": "test"},
            created_at=now,
            updated_at=now,
        )
        assert case.name == "test_case"


class TestEvalSuite:
    """Tests for full EvalSuite model (response model with IDs)."""

    def test_valid_creation(self) -> None:
        """Should create with all required fields."""
        now = datetime.now(UTC)
        suite = EvalSuite(
            id=uuid4(),
            project_id=uuid4(),
            name="test_suite",
            agent_id="agent-1",
            created_at=now,
            updated_at=now,
            cases=[],
        )
        assert suite.name == "test_suite"


class TestEvalRun:
    """Tests for full EvalRun model (response model with IDs)."""

    def test_valid_creation(self) -> None:
        """Should create with all required fields."""
        now = datetime.now(UTC)
        run = EvalRun(
            id=uuid4(),
            suite_id=uuid4(),
            suite_name="test_suite",
            project_id=uuid4(),
            agent_version="v1.0.0",
            trigger=TriggerType.MANUAL,
            trigger_ref=None,
            status=EvalRunStatus.PENDING,
            config=None,
            summary=None,
            started_at=None,
            completed_at=None,
            created_at=now,
        )
        assert run.status == EvalRunStatus.PENDING
