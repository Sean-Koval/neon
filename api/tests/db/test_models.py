"""Tests for SQLAlchemy database models."""

from uuid import uuid4

from sqlalchemy import inspect

from src.models.db import (
    ApiKeyModel,
    Base,
    EvalCaseModel,
    EvalResultModel,
    EvalRunModel,
    EvalSuiteModel,
    ProjectModel,
)


class TestProjectModel:
    """Tests for ProjectModel."""

    def test_create_project_model(self) -> None:
        """Test creating a ProjectModel instance."""
        project_id = uuid4()
        project = ProjectModel(
            id=project_id,
            name="Test Project",
            slug="test-project",
            mlflow_tracking_uri="http://localhost:5000",
            mlflow_experiment_id="exp-123",
            settings={"key": "value"},
        )

        assert project.id == project_id
        assert project.name == "Test Project"
        assert project.slug == "test-project"
        assert project.mlflow_tracking_uri == "http://localhost:5000"
        assert project.mlflow_experiment_id == "exp-123"
        assert project.settings == {"key": "value"}

    def test_project_model_column_defaults(self) -> None:
        """Test ProjectModel has correct column defaults defined."""
        mapper = inspect(ProjectModel)
        settings_col = mapper.columns["settings"]
        # Verify settings column has a default defined
        assert settings_col.default is not None

    def test_project_model_nullable_columns(self) -> None:
        """Test ProjectModel nullable columns."""
        project = ProjectModel(
            name="Test",
            slug="test",
        )
        # These should be None when not provided (nullable)
        assert project.mlflow_tracking_uri is None
        assert project.mlflow_experiment_id is None

    def test_project_tablename(self) -> None:
        """Test ProjectModel table name."""
        assert ProjectModel.__tablename__ == "projects"


class TestApiKeyModel:
    """Tests for ApiKeyModel."""

    def test_create_api_key_model(self) -> None:
        """Test creating an ApiKeyModel instance."""
        key_id = uuid4()
        project_id = uuid4()
        api_key = ApiKeyModel(
            id=key_id,
            key_prefix="ae_live_",
            key_hash="hashed_key",
            name="Test Key",
            project_id=project_id,
            scopes=["read", "write"],
            is_active=True,
        )

        assert api_key.id == key_id
        assert api_key.key_prefix == "ae_live_"
        assert api_key.key_hash == "hashed_key"
        assert api_key.name == "Test Key"
        assert api_key.project_id == project_id
        assert api_key.scopes == ["read", "write"]
        assert api_key.is_active is True

    def test_api_key_model_column_defaults(self) -> None:
        """Test ApiKeyModel has correct column defaults defined."""
        mapper = inspect(ApiKeyModel)
        scopes_col = mapper.columns["scopes"]
        is_active_col = mapper.columns["is_active"]
        # Verify defaults are defined
        assert scopes_col.default is not None
        assert is_active_col.default is not None

    def test_api_key_model_nullable_columns(self) -> None:
        """Test ApiKeyModel nullable columns."""
        api_key = ApiKeyModel(
            key_prefix="ae_live_",
            key_hash="hashed_key",
            name="Test Key",
            project_id=uuid4(),
        )
        # These should be None when not provided (nullable)
        assert api_key.last_used_at is None
        assert api_key.expires_at is None

    def test_api_key_tablename(self) -> None:
        """Test ApiKeyModel table name."""
        assert ApiKeyModel.__tablename__ == "api_keys"

    def test_api_key_has_key_prefix_index(self) -> None:
        """Test that key_prefix column has an index."""
        mapper = inspect(ApiKeyModel)
        key_prefix_col = mapper.columns["key_prefix"]
        assert key_prefix_col.index is True

    def test_api_key_has_project_id_index(self) -> None:
        """Test that project_id column has an index."""
        mapper = inspect(ApiKeyModel)
        project_id_col = mapper.columns["project_id"]
        assert project_id_col.index is True


class TestEvalSuiteModel:
    """Tests for EvalSuiteModel."""

    def test_create_eval_suite_model(self) -> None:
        """Test creating an EvalSuiteModel instance."""
        suite_id = uuid4()
        project_id = uuid4()
        suite = EvalSuiteModel(
            id=suite_id,
            project_id=project_id,
            name="core-tests",
            description="Core test suite",
            agent_id="research-agent",
            config={"default_scorers": ["tool_selection"]},
        )

        assert suite.id == suite_id
        assert suite.project_id == project_id
        assert suite.name == "core-tests"
        assert suite.description == "Core test suite"
        assert suite.agent_id == "research-agent"
        assert suite.config == {"default_scorers": ["tool_selection"]}

    def test_eval_suite_model_column_defaults(self) -> None:
        """Test EvalSuiteModel has correct column defaults defined."""
        mapper = inspect(EvalSuiteModel)
        config_col = mapper.columns["config"]
        # Verify config has a default defined
        assert config_col.default is not None

    def test_eval_suite_model_nullable_columns(self) -> None:
        """Test EvalSuiteModel nullable columns."""
        suite = EvalSuiteModel(
            project_id=uuid4(),
            name="test-suite",
            agent_id="test-agent",
        )
        # Description should be None when not provided (nullable)
        assert suite.description is None

    def test_eval_suite_tablename(self) -> None:
        """Test EvalSuiteModel table name."""
        assert EvalSuiteModel.__tablename__ == "eval_suites"

    def test_eval_suite_unique_constraint(self) -> None:
        """Test that EvalSuiteModel has unique constraint on (project_id, name)."""
        constraints = EvalSuiteModel.__table__.constraints
        unique_constraints = [c for c in constraints if c.name == "uq_suite_project_name"]
        assert len(unique_constraints) == 1


class TestEvalCaseModel:
    """Tests for EvalCaseModel."""

    def test_create_eval_case_model(self) -> None:
        """Test creating an EvalCaseModel instance."""
        case_id = uuid4()
        suite_id = uuid4()
        case = EvalCaseModel(
            id=case_id,
            suite_id=suite_id,
            name="factual_search",
            description="Test factual search",
            input={"query": "What is the capital of France?"},
            expected_tools=["web_search"],
            expected_output_contains=["Paris"],
            scorers=["tool_selection", "reasoning"],
            min_score=0.8,
            timeout_seconds=300,
            tags=["search", "factual"],
        )

        assert case.id == case_id
        assert case.suite_id == suite_id
        assert case.name == "factual_search"
        assert case.description == "Test factual search"
        assert case.input == {"query": "What is the capital of France?"}
        assert case.expected_tools == ["web_search"]
        assert case.expected_output_contains == ["Paris"]
        assert case.scorers == ["tool_selection", "reasoning"]
        assert case.min_score == 0.8
        assert case.timeout_seconds == 300
        assert case.tags == ["search", "factual"]

    def test_eval_case_model_column_defaults(self) -> None:
        """Test EvalCaseModel has correct column defaults defined."""
        mapper = inspect(EvalCaseModel)
        scorers_col = mapper.columns["scorers"]
        min_score_col = mapper.columns["min_score"]
        timeout_col = mapper.columns["timeout_seconds"]
        tags_col = mapper.columns["tags"]
        # Verify defaults are defined
        assert scorers_col.default is not None
        assert min_score_col.default is not None
        assert timeout_col.default is not None
        assert tags_col.default is not None

    def test_eval_case_model_nullable_columns(self) -> None:
        """Test EvalCaseModel nullable columns."""
        case = EvalCaseModel(
            suite_id=uuid4(),
            name="test-case",
            input={"query": "test"},
        )
        # These should be None when not provided (nullable)
        assert case.expected_tools is None
        assert case.expected_tool_sequence is None
        assert case.expected_output_contains is None
        assert case.expected_output_pattern is None
        assert case.scorer_config is None

    def test_eval_case_tablename(self) -> None:
        """Test EvalCaseModel table name."""
        assert EvalCaseModel.__tablename__ == "eval_cases"

    def test_eval_case_unique_constraint(self) -> None:
        """Test that EvalCaseModel has unique constraint on (suite_id, name)."""
        constraints = EvalCaseModel.__table__.constraints
        unique_constraints = [c for c in constraints if c.name == "uq_case_suite_name"]
        assert len(unique_constraints) == 1


class TestEvalRunModel:
    """Tests for EvalRunModel."""

    def test_create_eval_run_model(self) -> None:
        """Test creating an EvalRunModel instance."""
        run_id = uuid4()
        suite_id = uuid4()
        project_id = uuid4()
        run = EvalRunModel(
            id=run_id,
            suite_id=suite_id,
            project_id=project_id,
            agent_version="abc123",
            trigger="ci",
            trigger_ref="PR-456",
            status="running",
            config={"parallel": True},
            summary={"total_cases": 10, "passed": 8},
        )

        assert run.id == run_id
        assert run.suite_id == suite_id
        assert run.project_id == project_id
        assert run.agent_version == "abc123"
        assert run.trigger == "ci"
        assert run.trigger_ref == "PR-456"
        assert run.status == "running"
        assert run.config == {"parallel": True}
        assert run.summary == {"total_cases": 10, "passed": 8}

    def test_eval_run_model_column_defaults(self) -> None:
        """Test EvalRunModel has correct column defaults defined."""
        mapper = inspect(EvalRunModel)
        status_col = mapper.columns["status"]
        # Verify status has a default defined
        assert status_col.default is not None

    def test_eval_run_model_nullable_columns(self) -> None:
        """Test EvalRunModel nullable columns."""
        run = EvalRunModel(
            suite_id=uuid4(),
            project_id=uuid4(),
            trigger="manual",
        )
        # These should be None when not provided (nullable)
        assert run.agent_version is None
        assert run.trigger_ref is None
        assert run.config is None
        assert run.summary is None
        assert run.started_at is None
        assert run.completed_at is None

    def test_eval_run_tablename(self) -> None:
        """Test EvalRunModel table name."""
        assert EvalRunModel.__tablename__ == "eval_runs"

    def test_eval_run_has_suite_id_index(self) -> None:
        """Test that suite_id column has an index."""
        mapper = inspect(EvalRunModel)
        suite_id_col = mapper.columns["suite_id"]
        assert suite_id_col.index is True

    def test_eval_run_has_agent_version_index(self) -> None:
        """Test that agent_version column has an index."""
        mapper = inspect(EvalRunModel)
        agent_version_col = mapper.columns["agent_version"]
        assert agent_version_col.index is True

    def test_eval_run_has_project_status_composite_index(self) -> None:
        """Test that there is a composite index on (project_id, status)."""
        indexes = list(EvalRunModel.__table__.indexes)
        composite_index = None
        for idx in indexes:
            if idx.name == "idx_eval_runs_project_status":
                composite_index = idx
                break

        assert composite_index is not None
        column_names = [col.name for col in composite_index.columns]
        assert "project_id" in column_names
        assert "status" in column_names


class TestEvalResultModel:
    """Tests for EvalResultModel."""

    def test_create_eval_result_model(self) -> None:
        """Test creating an EvalResultModel instance."""
        result_id = uuid4()
        run_id = uuid4()
        case_id = uuid4()
        result = EvalResultModel(
            id=result_id,
            run_id=run_id,
            case_id=case_id,
            mlflow_run_id="mlflow-run-123",
            mlflow_trace_id="trace-456",
            status="success",
            output={"output": "Paris is the capital of France"},
            scores={"tool_selection": 0.9, "reasoning": 0.85},
            score_details={"tool_selection": {"score": 0.9, "reason": "Correct tool used"}},
            passed=True,
            execution_time_ms=1200,
        )

        assert result.id == result_id
        assert result.run_id == run_id
        assert result.case_id == case_id
        assert result.mlflow_run_id == "mlflow-run-123"
        assert result.mlflow_trace_id == "trace-456"
        assert result.status == "success"
        assert result.output == {"output": "Paris is the capital of France"}
        assert result.scores == {"tool_selection": 0.9, "reasoning": 0.85}
        assert result.passed is True
        assert result.execution_time_ms == 1200

    def test_eval_result_model_with_error(self) -> None:
        """Test EvalResultModel with error status."""
        result = EvalResultModel(
            run_id=uuid4(),
            case_id=uuid4(),
            status="error",
            scores={},
            passed=False,
            error="Agent timed out",
        )

        assert result.status == "error"
        assert result.passed is False
        assert result.error == "Agent timed out"

    def test_eval_result_tablename(self) -> None:
        """Test EvalResultModel table name."""
        assert EvalResultModel.__tablename__ == "eval_results"

    def test_eval_result_has_run_id_index(self) -> None:
        """Test that run_id column has an index."""
        mapper = inspect(EvalResultModel)
        run_id_col = mapper.columns["run_id"]
        assert run_id_col.index is True

    def test_eval_result_has_case_id_index(self) -> None:
        """Test that case_id column has an index."""
        mapper = inspect(EvalResultModel)
        case_id_col = mapper.columns["case_id"]
        assert case_id_col.index is True


class TestModelRelationships:
    """Tests for model relationships."""

    def test_project_has_api_keys_relationship(self) -> None:
        """Test that ProjectModel has api_keys relationship."""
        mapper = inspect(ProjectModel)
        assert "api_keys" in mapper.relationships

    def test_project_has_suites_relationship(self) -> None:
        """Test that ProjectModel has suites relationship."""
        mapper = inspect(ProjectModel)
        assert "suites" in mapper.relationships

    def test_project_has_runs_relationship(self) -> None:
        """Test that ProjectModel has runs relationship."""
        mapper = inspect(ProjectModel)
        assert "runs" in mapper.relationships

    def test_api_key_has_project_relationship(self) -> None:
        """Test that ApiKeyModel has project relationship."""
        mapper = inspect(ApiKeyModel)
        assert "project" in mapper.relationships

    def test_eval_suite_has_project_relationship(self) -> None:
        """Test that EvalSuiteModel has project relationship."""
        mapper = inspect(EvalSuiteModel)
        assert "project" in mapper.relationships

    def test_eval_suite_has_cases_relationship(self) -> None:
        """Test that EvalSuiteModel has cases relationship."""
        mapper = inspect(EvalSuiteModel)
        assert "cases" in mapper.relationships

    def test_eval_suite_has_runs_relationship(self) -> None:
        """Test that EvalSuiteModel has runs relationship."""
        mapper = inspect(EvalSuiteModel)
        assert "runs" in mapper.relationships

    def test_eval_case_has_suite_relationship(self) -> None:
        """Test that EvalCaseModel has suite relationship."""
        mapper = inspect(EvalCaseModel)
        assert "suite" in mapper.relationships

    def test_eval_case_has_results_relationship(self) -> None:
        """Test that EvalCaseModel has results relationship."""
        mapper = inspect(EvalCaseModel)
        assert "results" in mapper.relationships

    def test_eval_run_has_suite_relationship(self) -> None:
        """Test that EvalRunModel has suite relationship."""
        mapper = inspect(EvalRunModel)
        assert "suite" in mapper.relationships

    def test_eval_run_has_project_relationship(self) -> None:
        """Test that EvalRunModel has project relationship."""
        mapper = inspect(EvalRunModel)
        assert "project" in mapper.relationships

    def test_eval_run_has_results_relationship(self) -> None:
        """Test that EvalRunModel has results relationship."""
        mapper = inspect(EvalRunModel)
        assert "results" in mapper.relationships

    def test_eval_result_has_run_relationship(self) -> None:
        """Test that EvalResultModel has run relationship."""
        mapper = inspect(EvalResultModel)
        assert "run" in mapper.relationships

    def test_eval_result_has_case_relationship(self) -> None:
        """Test that EvalResultModel has case relationship."""
        mapper = inspect(EvalResultModel)
        assert "case" in mapper.relationships


class TestForeignKeyConstraints:
    """Tests for foreign key constraints."""

    def test_api_key_project_fk(self) -> None:
        """Test ApiKeyModel has foreign key to projects."""
        fks = list(ApiKeyModel.__table__.foreign_keys)
        fk_targets = [fk.target_fullname for fk in fks]
        assert "projects.id" in fk_targets

    def test_eval_suite_project_fk(self) -> None:
        """Test EvalSuiteModel has foreign key to projects."""
        fks = list(EvalSuiteModel.__table__.foreign_keys)
        fk_targets = [fk.target_fullname for fk in fks]
        assert "projects.id" in fk_targets

    def test_eval_case_suite_fk(self) -> None:
        """Test EvalCaseModel has foreign key to eval_suites."""
        fks = list(EvalCaseModel.__table__.foreign_keys)
        fk_targets = [fk.target_fullname for fk in fks]
        assert "eval_suites.id" in fk_targets

    def test_eval_run_suite_fk(self) -> None:
        """Test EvalRunModel has foreign key to eval_suites."""
        fks = list(EvalRunModel.__table__.foreign_keys)
        fk_targets = [fk.target_fullname for fk in fks]
        assert "eval_suites.id" in fk_targets

    def test_eval_run_project_fk(self) -> None:
        """Test EvalRunModel has foreign key to projects."""
        fks = list(EvalRunModel.__table__.foreign_keys)
        fk_targets = [fk.target_fullname for fk in fks]
        assert "projects.id" in fk_targets

    def test_eval_result_run_fk(self) -> None:
        """Test EvalResultModel has foreign key to eval_runs."""
        fks = list(EvalResultModel.__table__.foreign_keys)
        fk_targets = [fk.target_fullname for fk in fks]
        assert "eval_runs.id" in fk_targets

    def test_eval_result_case_fk(self) -> None:
        """Test EvalResultModel has foreign key to eval_cases."""
        fks = list(EvalResultModel.__table__.foreign_keys)
        fk_targets = [fk.target_fullname for fk in fks]
        assert "eval_cases.id" in fk_targets


class TestCascadeDeletes:
    """Tests for cascade delete configuration."""

    def test_api_key_cascade_delete(self) -> None:
        """Test that ApiKeyModel has cascade delete on project."""
        fks = list(ApiKeyModel.__table__.foreign_keys)
        project_fk = [fk for fk in fks if fk.target_fullname == "projects.id"][0]
        assert project_fk.ondelete == "CASCADE"

    def test_eval_suite_cascade_delete(self) -> None:
        """Test that EvalSuiteModel has cascade delete on project."""
        fks = list(EvalSuiteModel.__table__.foreign_keys)
        project_fk = [fk for fk in fks if fk.target_fullname == "projects.id"][0]
        assert project_fk.ondelete == "CASCADE"

    def test_eval_case_cascade_delete(self) -> None:
        """Test that EvalCaseModel has cascade delete on suite."""
        fks = list(EvalCaseModel.__table__.foreign_keys)
        suite_fk = [fk for fk in fks if fk.target_fullname == "eval_suites.id"][0]
        assert suite_fk.ondelete == "CASCADE"

    def test_eval_run_suite_cascade_delete(self) -> None:
        """Test that EvalRunModel has cascade delete on suite."""
        fks = list(EvalRunModel.__table__.foreign_keys)
        suite_fk = [fk for fk in fks if fk.target_fullname == "eval_suites.id"][0]
        assert suite_fk.ondelete == "CASCADE"

    def test_eval_run_project_cascade_delete(self) -> None:
        """Test that EvalRunModel has cascade delete on project."""
        fks = list(EvalRunModel.__table__.foreign_keys)
        project_fk = [fk for fk in fks if fk.target_fullname == "projects.id"][0]
        assert project_fk.ondelete == "CASCADE"

    def test_eval_result_run_cascade_delete(self) -> None:
        """Test that EvalResultModel has cascade delete on run."""
        fks = list(EvalResultModel.__table__.foreign_keys)
        run_fk = [fk for fk in fks if fk.target_fullname == "eval_runs.id"][0]
        assert run_fk.ondelete == "CASCADE"

    def test_eval_result_case_cascade_delete(self) -> None:
        """Test that EvalResultModel has cascade delete on case."""
        fks = list(EvalResultModel.__table__.foreign_keys)
        case_fk = [fk for fk in fks if fk.target_fullname == "eval_cases.id"][0]
        assert case_fk.ondelete == "CASCADE"


class TestBaseMetadata:
    """Tests for Base declarative metadata."""

    def test_all_models_registered(self) -> None:
        """Test that all models are registered with Base."""
        table_names = set(Base.metadata.tables.keys())
        expected_tables = {
            "projects",
            "api_keys",
            "eval_suites",
            "eval_cases",
            "eval_runs",
            "eval_results",
        }
        assert expected_tables.issubset(table_names)
