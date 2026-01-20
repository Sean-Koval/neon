"""SQLAlchemy database models."""

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    ARRAY,
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


# =============================================================================
# Projects and Auth
# =============================================================================


class ProjectModel(Base):
    """Project database model."""

    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    mlflow_tracking_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    mlflow_experiment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    api_keys: Mapped[list["ApiKeyModel"]] = relationship(back_populates="project")
    suites: Mapped[list["EvalSuiteModel"]] = relationship(back_populates="project")
    runs: Mapped[list["EvalRunModel"]] = relationship(back_populates="project")


class ApiKeyModel(Base):
    """API key database model."""

    __tablename__ = "api_keys"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    key_prefix: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    project_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    scopes: Mapped[list[str]] = mapped_column(ARRAY(Text), default=["read"])
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    project: Mapped["ProjectModel"] = relationship(back_populates="api_keys")


# =============================================================================
# Eval Suites and Cases
# =============================================================================


class EvalSuiteModel(Base):
    """Eval suite database model."""

    __tablename__ = "eval_suites"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_id: Mapped[str] = mapped_column(String(255), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_suite_project_name"),)

    # Relationships
    project: Mapped["ProjectModel"] = relationship(back_populates="suites")
    cases: Mapped[list["EvalCaseModel"]] = relationship(
        back_populates="suite", cascade="all, delete-orphan"
    )
    runs: Mapped[list["EvalRunModel"]] = relationship(back_populates="suite")


class EvalCaseModel(Base):
    """Eval case database model."""

    __tablename__ = "eval_cases"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    suite_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eval_suites.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    input: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    expected_tools: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    expected_tool_sequence: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    expected_output_contains: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    expected_output_pattern: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    scorers: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=["tool_selection", "reasoning"]
    )
    scorer_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    min_score: Mapped[float] = mapped_column(Float, default=0.7)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=[])
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (UniqueConstraint("suite_id", "name", name="uq_case_suite_name"),)

    # Relationships
    suite: Mapped["EvalSuiteModel"] = relationship(back_populates="cases")
    results: Mapped[list["EvalResultModel"]] = relationship(back_populates="case")


# =============================================================================
# Eval Runs and Results
# =============================================================================


class EvalRunModel(Base):
    """Eval run database model."""

    __tablename__ = "eval_runs"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    suite_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eval_suites.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE")
    )
    agent_version: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    trigger: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_eval_runs_project_status", "project_id", "status"),
    )

    # Relationships
    suite: Mapped["EvalSuiteModel"] = relationship(back_populates="runs")
    project: Mapped["ProjectModel"] = relationship(back_populates="runs")
    results: Mapped[list["EvalResultModel"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class EvalResultModel(Base):
    """Eval result database model."""

    __tablename__ = "eval_results"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eval_runs.id", ondelete="CASCADE"), index=True
    )
    case_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eval_cases.id", ondelete="CASCADE"), index=True
    )
    mlflow_run_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mlflow_trace_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    output: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    scores: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False)
    score_details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    execution_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    run: Mapped["EvalRunModel"] = relationship(back_populates="results")
    case: Mapped["EvalCaseModel"] = relationship(back_populates="results")
