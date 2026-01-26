"""MLflow integration client for Neon.

This module provides the MLflow integration layer for Neon, handling:
- Experiment management
- Run creation with tags
- Trace capture from agent execution
- Trace querying by tag
- TraceSummary extraction

Requires MLflow 3.7+ for tracing features.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Generator

import mlflow
from mlflow import MlflowClient
from mlflow.entities import SpanType, Trace

from src.config import settings

if TYPE_CHECKING:
    from mlflow.entities import Run, Span


@dataclass
class TraceSummary:
    """Summary statistics extracted from an MLflow trace."""

    trace_id: str
    total_spans: int
    tool_calls: list[str]
    llm_calls: int
    total_tokens: int
    input_tokens: int
    output_tokens: int
    duration_ms: int
    status: str
    error: str | None = None


@dataclass
class ExecutionResult:
    """Result of executing an agent with tracing."""

    mlflow_run_id: str
    mlflow_trace_id: str | None
    output: Any
    status: str  # "success", "error", "timeout"
    error: str | None
    execution_time_ms: int
    trace_summary: TraceSummary | None = None


@dataclass
class RunInfo:
    """Information about an MLflow run."""

    run_id: str
    experiment_id: str
    status: str
    start_time: int
    end_time: int | None
    tags: dict[str, str] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)


class MLflowClientError(Exception):
    """Base exception for MLflow client errors."""

    pass


class ExperimentNotFoundError(MLflowClientError):
    """Raised when experiment is not found."""

    pass


class TraceNotFoundError(MLflowClientError):
    """Raised when trace is not found."""

    pass


class NeonMLflowClient:
    """MLflow client wrapper for Neon agent evaluation.

    This client provides a high-level interface for MLflow operations
    required by Neon, including experiment management, traced execution,
    and trace querying.

    Example:
        client = NeonMLflowClient()
        client.set_experiment("my-project")

        # Execute agent with tracing
        result = client.execute_with_tracing(
            agent_fn=my_agent.run,
            input_data={"query": "test"},
            tags={"case_name": "test_case"}
        )

        # Query traces
        traces = client.search_traces_by_tag("case_name", "test_case")
    """

    def __init__(self, tracking_uri: str | None = None) -> None:
        """Initialize the MLflow client.

        Args:
            tracking_uri: MLflow tracking server URI. Defaults to settings.
        """
        self._tracking_uri = tracking_uri or settings.mlflow_tracking_uri
        mlflow.set_tracking_uri(self._tracking_uri)
        self._client = MlflowClient(self._tracking_uri)
        self._current_experiment_id: str | None = None

    @property
    def tracking_uri(self) -> str:
        """Get the MLflow tracking URI."""
        return self._tracking_uri

    @property
    def client(self) -> MlflowClient:
        """Get the underlying MlflowClient."""
        return self._client

    def set_experiment(self, name: str) -> str:
        """Set or create an experiment.

        Args:
            name: Experiment name (will be prefixed with "neon-" if not already).

        Returns:
            The experiment ID.
        """
        if not name.startswith("neon-"):
            name = f"neon-{name}"

        experiment = mlflow.set_experiment(name)
        self._current_experiment_id = experiment.experiment_id
        return experiment.experiment_id

    def get_experiment(self, name: str) -> str:
        """Get an existing experiment by name.

        Args:
            name: Experiment name.

        Returns:
            The experiment ID.

        Raises:
            ExperimentNotFoundError: If experiment doesn't exist.
        """
        if not name.startswith("neon-"):
            name = f"neon-{name}"

        experiment = self._client.get_experiment_by_name(name)
        if experiment is None:
            raise ExperimentNotFoundError(f"Experiment '{name}' not found")
        return experiment.experiment_id

    @contextmanager
    def start_run(
        self,
        run_name: str | None = None,
        tags: dict[str, str] | None = None,
        nested: bool = False,
    ) -> Generator[Run, None, None]:
        """Start an MLflow run with tags.

        Args:
            run_name: Optional name for the run.
            tags: Tags to apply to the run.
            nested: Whether this is a nested run.

        Yields:
            The active MLflow Run object.
        """
        neon_tags = {"neon.source": "neon-eval"}
        if tags:
            neon_tags.update({f"neon.{k}" if not k.startswith("neon.") else k: v for k, v in tags.items()})

        with mlflow.start_run(run_name=run_name, tags=neon_tags, nested=nested) as run:
            yield run

    def execute_with_tracing(
        self,
        agent_fn: Callable[..., Any],
        input_data: dict[str, Any],
        run_name: str | None = None,
        tags: dict[str, str] | None = None,
        timeout_seconds: int | None = None,
    ) -> ExecutionResult:
        """Execute an agent function with MLflow tracing.

        This wraps the agent execution in an MLflow run and captures
        the trace generated by the agent.

        Args:
            agent_fn: The agent function to execute.
            input_data: Input data to pass to the agent.
            run_name: Optional name for the run.
            tags: Tags to apply to the run.
            timeout_seconds: Execution timeout (not enforced here, for tracking).

        Returns:
            ExecutionResult with trace information.
        """
        if self._current_experiment_id is None:
            raise MLflowClientError("No experiment set. Call set_experiment() first.")

        effective_timeout = timeout_seconds or settings.default_timeout_seconds
        run_tags = tags or {}
        run_tags["timeout_seconds"] = str(effective_timeout)

        with self.start_run(run_name=run_name, tags=run_tags) as mlflow_run:
            start_time = time.time()
            status = "success"
            error = None
            output = None
            trace: Trace | None = None

            try:
                # Enable MLflow tracing for this execution
                mlflow.tracing.enable()

                # Execute the agent
                output = agent_fn(**input_data)

                # Get the trace captured during execution
                trace = mlflow.get_last_active_trace()

            except Exception as e:
                status = "error"
                error = str(e)

            execution_time_ms = int((time.time() - start_time) * 1000)

            # Log metrics
            mlflow.log_metrics({
                "execution_time_ms": execution_time_ms,
                "status_success": 1 if status == "success" else 0,
            })

            # Extract trace summary if available
            trace_summary: TraceSummary | None = None
            trace_id: str | None = None
            if trace:
                trace_id = trace.info.request_id
                trace_summary = self.extract_trace_summary(trace)

            return ExecutionResult(
                mlflow_run_id=mlflow_run.info.run_id,
                mlflow_trace_id=trace_id,
                output=output,
                status=status,
                error=error,
                execution_time_ms=execution_time_ms,
                trace_summary=trace_summary,
            )

    def get_trace(self, trace_id: str) -> Trace:
        """Get a trace by ID.

        Args:
            trace_id: The trace ID (request_id).

        Returns:
            The Trace object.

        Raises:
            TraceNotFoundError: If trace doesn't exist.
        """
        try:
            trace = self._client.get_trace(trace_id)
            if trace is None:
                raise TraceNotFoundError(f"Trace '{trace_id}' not found")
            return trace
        except Exception as e:
            if "not found" in str(e).lower():
                raise TraceNotFoundError(f"Trace '{trace_id}' not found") from e
            raise

    def search_traces_by_tag(
        self,
        tag_key: str,
        tag_value: str,
        experiment_ids: list[str] | None = None,
        max_results: int = 100,
    ) -> list[Trace]:
        """Search for traces by tag.

        Args:
            tag_key: Tag key to search for.
            tag_value: Tag value to match.
            experiment_ids: Optional list of experiment IDs to search.
                Defaults to current experiment.
            max_results: Maximum number of results.

        Returns:
            List of matching Trace objects.
        """
        if experiment_ids is None:
            if self._current_experiment_id is None:
                raise MLflowClientError("No experiment set and no experiment_ids provided")
            experiment_ids = [self._current_experiment_id]

        # Normalize tag key
        if not tag_key.startswith("neon."):
            tag_key = f"neon.{tag_key}"

        # Search traces using MLflow's search API
        filter_string = f"tags.`{tag_key}` = '{tag_value}'"

        traces = self._client.search_traces(
            experiment_ids=experiment_ids,
            filter_string=filter_string,
            max_results=max_results,
        )

        return list(traces)

    def search_runs_by_tag(
        self,
        tag_key: str,
        tag_value: str,
        experiment_ids: list[str] | None = None,
        max_results: int = 100,
    ) -> list[RunInfo]:
        """Search for runs by tag.

        Args:
            tag_key: Tag key to search for.
            tag_value: Tag value to match.
            experiment_ids: Optional list of experiment IDs.
            max_results: Maximum number of results.

        Returns:
            List of RunInfo objects.
        """
        if experiment_ids is None:
            if self._current_experiment_id is None:
                raise MLflowClientError("No experiment set and no experiment_ids provided")
            experiment_ids = [self._current_experiment_id]

        # Normalize tag key
        if not tag_key.startswith("neon."):
            tag_key = f"neon.{tag_key}"

        filter_string = f"tags.`{tag_key}` = '{tag_value}'"

        runs = self._client.search_runs(
            experiment_ids=experiment_ids,
            filter_string=filter_string,
            max_results=max_results,
        )

        return [
            RunInfo(
                run_id=run.info.run_id,
                experiment_id=run.info.experiment_id,
                status=run.info.status,
                start_time=run.info.start_time,
                end_time=run.info.end_time,
                tags=run.data.tags,
                metrics=run.data.metrics,
            )
            for run in runs
        ]

    def extract_trace_summary(self, trace: Trace) -> TraceSummary:
        """Extract summary statistics from a trace.

        Args:
            trace: The MLflow Trace object.

        Returns:
            TraceSummary with extracted statistics.
        """
        # Get all spans
        spans: list[Span] = list(trace.data.spans) if trace.data else []

        # Filter by span type
        tool_spans = [s for s in spans if s.span_type == SpanType.TOOL]
        llm_spans = [s for s in spans if s.span_type == SpanType.CHAT_MODEL]

        # Extract token counts from LLM spans
        total_tokens = 0
        input_tokens = 0
        output_tokens = 0

        for span in llm_spans:
            attrs = span.attributes or {}
            total_tokens += attrs.get("llm.token_count.total", 0)
            input_tokens += attrs.get("llm.token_count.prompt", 0)
            output_tokens += attrs.get("llm.token_count.completion", 0)

        # Get trace status
        status = trace.info.status if trace.info else "UNKNOWN"
        error = None
        if status == "ERROR" and trace.data:
            # Try to extract error from root span
            root_spans = [s for s in spans if s.parent_id is None]
            if root_spans and root_spans[0].events:
                for event in root_spans[0].events:
                    if event.name == "exception":
                        error = event.attributes.get("exception.message", "Unknown error")
                        break

        return TraceSummary(
            trace_id=trace.info.request_id,
            total_spans=len(spans),
            tool_calls=[s.name for s in tool_spans],
            llm_calls=len(llm_spans),
            total_tokens=total_tokens,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=trace.info.execution_time_ms or 0,
            status=status,
            error=error,
        )

    def get_tool_spans(self, trace: Trace) -> list[Span]:
        """Extract tool call spans from a trace.

        Args:
            trace: The MLflow Trace object.

        Returns:
            List of tool-type Span objects.
        """
        if not trace.data:
            return []
        return [s for s in trace.data.spans if s.span_type == SpanType.TOOL]

    def get_llm_spans(self, trace: Trace) -> list[Span]:
        """Extract LLM call spans from a trace.

        Args:
            trace: The MLflow Trace object.

        Returns:
            List of LLM-type Span objects.
        """
        if not trace.data:
            return []
        return [s for s in trace.data.spans if s.span_type == SpanType.CHAT_MODEL]


# Module-level singleton for convenience
_default_client: NeonMLflowClient | None = None


def get_mlflow_client() -> NeonMLflowClient:
    """Get or create the default MLflow client singleton.

    Returns:
        The NeonMLflowClient instance.
    """
    global _default_client
    if _default_client is None:
        _default_client = NeonMLflowClient()
    return _default_client


def reset_mlflow_client() -> None:
    """Reset the default MLflow client singleton (useful for testing)."""
    global _default_client
    _default_client = None
