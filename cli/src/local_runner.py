"""Local execution runner for CLI mode.

Enables running evaluations locally without the API server.
Uses SQLite for result storage and connects to local MLflow.
"""

import asyncio
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

# Add api/src to path to import scorers and mlflow client
_api_src_path = str(Path(__file__).parent.parent.parent.parent / "api" / "src")
if _api_src_path not in sys.path:
    sys.path.insert(0, _api_src_path)

# Import agent loader
from agent import AgentLoadError, AgentProtocol, load_agent

from src.config import get_config_dir
from src.loader import EvalCaseSchema, EvalSuiteSchema, load_suite


def _get_default_scorers():
    """Lazy-load scorers to avoid import issues at module load time."""
    from scorers import GroundingScorer, ReasoningScorer, ToolSelectionScorer
    return {
        "tool_selection": ToolSelectionScorer(),
        "reasoning": ReasoningScorer(),
        "grounding": GroundingScorer(),
    }


# Local SQLite imports
try:
    import sqlite3
except ImportError:
    raise ImportError("sqlite3 is required for local mode")

# MLflow imports
try:
    import mlflow
    from mlflow import MlflowClient
except ImportError:
    raise ImportError("mlflow is required for local mode. Install with: pip install mlflow>=3.7")


@dataclass
class LocalCase:
    """Local representation of an eval case."""

    id: str
    name: str
    description: str | None
    input: dict[str, Any]
    expected_tools: list[str] | None
    expected_tool_sequence: list[str] | None
    expected_output_contains: list[str] | None
    expected_output_pattern: str | None
    scorers: list[str]
    scorer_config: dict[str, Any] | None
    min_score: float
    timeout_seconds: int
    tags: list[str]


@dataclass
class LocalSuite:
    """Local representation of an eval suite."""

    id: str
    name: str
    description: str | None
    agent_id: str
    config: dict[str, Any]
    cases: list[LocalCase]


@dataclass
class LocalResult:
    """Local representation of an eval result."""

    id: str
    run_id: str
    case_id: str
    case_name: str
    mlflow_run_id: str | None
    mlflow_trace_id: str | None
    status: str
    output: dict[str, Any] | None
    scores: dict[str, float]
    score_details: dict[str, Any] | None
    passed: bool
    execution_time_ms: int
    error: str | None
    created_at: str


@dataclass
class LocalRun:
    """Local representation of an eval run."""

    id: str
    suite_id: str
    suite_name: str
    agent_version: str | None
    trigger: str
    status: str
    config: dict[str, Any] | None
    summary: dict[str, Any] | None
    started_at: str | None
    completed_at: str | None
    created_at: str
    results: list[LocalResult] = field(default_factory=list)


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


class LocalDatabase:
    """SQLite database for local result storage."""

    def __init__(self, db_path: Path | None = None):
        """Initialize local database.

        Args:
            db_path: Path to SQLite database. Defaults to ~/.agent-eval/results.db
        """
        if db_path is None:
            config_dir = get_config_dir()
            config_dir.mkdir(parents=True, exist_ok=True)
            db_path = config_dir / "results.db"

        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        """Initialize database schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    suite_id TEXT NOT NULL,
                    suite_name TEXT NOT NULL,
                    agent_version TEXT,
                    trigger TEXT NOT NULL,
                    status TEXT NOT NULL,
                    config TEXT,
                    summary TEXT,
                    started_at TEXT,
                    completed_at TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS results (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    case_id TEXT NOT NULL,
                    case_name TEXT NOT NULL,
                    mlflow_run_id TEXT,
                    mlflow_trace_id TEXT,
                    status TEXT NOT NULL,
                    output TEXT,
                    scores TEXT NOT NULL,
                    score_details TEXT,
                    passed INTEGER NOT NULL,
                    execution_time_ms INTEGER,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES runs(id)
                );

                CREATE INDEX IF NOT EXISTS idx_runs_suite ON runs(suite_id);
                CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
                CREATE INDEX IF NOT EXISTS idx_results_run ON results(run_id);
            """)

    def save_run(self, run: LocalRun) -> None:
        """Save a run to the database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO runs
                (id, suite_id, suite_name, agent_version, trigger, status, config, summary,
                 started_at, completed_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run.id,
                    run.suite_id,
                    run.suite_name,
                    run.agent_version,
                    run.trigger,
                    run.status,
                    json.dumps(run.config) if run.config else None,
                    json.dumps(run.summary) if run.summary else None,
                    run.started_at,
                    run.completed_at,
                    run.created_at,
                ),
            )

    def save_result(self, result: LocalResult) -> None:
        """Save a result to the database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO results
                (id, run_id, case_id, case_name, mlflow_run_id, mlflow_trace_id, status,
                 output, scores, score_details, passed, execution_time_ms, error, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result.id,
                    result.run_id,
                    result.case_id,
                    result.case_name,
                    result.mlflow_run_id,
                    result.mlflow_trace_id,
                    result.status,
                    json.dumps(result.output) if result.output else None,
                    json.dumps(result.scores),
                    json.dumps(result.score_details) if result.score_details else None,
                    1 if result.passed else 0,
                    result.execution_time_ms,
                    result.error,
                    result.created_at,
                ),
            )

    def get_run(self, run_id: str) -> LocalRun | None:
        """Get a run by ID."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM runs WHERE id = ?", (run_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None

            run = LocalRun(
                id=row["id"],
                suite_id=row["suite_id"],
                suite_name=row["suite_name"],
                agent_version=row["agent_version"],
                trigger=row["trigger"],
                status=row["status"],
                config=json.loads(row["config"]) if row["config"] else None,
                summary=json.loads(row["summary"]) if row["summary"] else None,
                started_at=row["started_at"],
                completed_at=row["completed_at"],
                created_at=row["created_at"],
            )

            # Load results
            cursor = conn.execute(
                "SELECT * FROM results WHERE run_id = ?", (run_id,)
            )
            for result_row in cursor:
                run.results.append(
                    LocalResult(
                        id=result_row["id"],
                        run_id=result_row["run_id"],
                        case_id=result_row["case_id"],
                        case_name=result_row["case_name"],
                        mlflow_run_id=result_row["mlflow_run_id"],
                        mlflow_trace_id=result_row["mlflow_trace_id"],
                        status=result_row["status"],
                        output=json.loads(result_row["output"]) if result_row["output"] else None,
                        scores=json.loads(result_row["scores"]),
                        score_details=json.loads(result_row["score_details"]) if result_row["score_details"] else None,
                        passed=bool(result_row["passed"]),
                        execution_time_ms=result_row["execution_time_ms"] or 0,
                        error=result_row["error"],
                        created_at=result_row["created_at"],
                    )
                )

            return run

    def list_runs(
        self,
        suite_name: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[LocalRun]:
        """List runs with optional filters."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row

            query = "SELECT * FROM runs WHERE 1=1"
            params: list[Any] = []

            if suite_name:
                query += " AND suite_name = ?"
                params.append(suite_name)
            if status:
                query += " AND status = ?"
                params.append(status)

            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)

            cursor = conn.execute(query, params)
            runs = []
            for row in cursor:
                runs.append(
                    LocalRun(
                        id=row["id"],
                        suite_id=row["suite_id"],
                        suite_name=row["suite_name"],
                        agent_version=row["agent_version"],
                        trigger=row["trigger"],
                        status=row["status"],
                        config=json.loads(row["config"]) if row["config"] else None,
                        summary=json.loads(row["summary"]) if row["summary"] else None,
                        started_at=row["started_at"],
                        completed_at=row["completed_at"],
                        created_at=row["created_at"],
                    )
                )
            return runs

    def get_results_for_run(
        self, run_id: str, failed_only: bool = False
    ) -> list[LocalResult]:
        """Get results for a run."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row

            query = "SELECT * FROM results WHERE run_id = ?"
            params: list[Any] = [run_id]

            if failed_only:
                query += " AND passed = 0"

            cursor = conn.execute(query, params)
            results = []
            for row in cursor:
                results.append(
                    LocalResult(
                        id=row["id"],
                        run_id=row["run_id"],
                        case_id=row["case_id"],
                        case_name=row["case_name"],
                        mlflow_run_id=row["mlflow_run_id"],
                        mlflow_trace_id=row["mlflow_trace_id"],
                        status=row["status"],
                        output=json.loads(row["output"]) if row["output"] else None,
                        scores=json.loads(row["scores"]),
                        score_details=json.loads(row["score_details"]) if row["score_details"] else None,
                        passed=bool(row["passed"]),
                        execution_time_ms=row["execution_time_ms"] or 0,
                        error=row["error"],
                        created_at=row["created_at"],
                    )
                )
            return results


class LocalMLflowClient:
    """MLflow client for local execution mode."""

    def __init__(self, tracking_uri: str | None = None):
        """Initialize MLflow client for local mode.

        Args:
            tracking_uri: MLflow tracking URI. Defaults to MLFLOW_TRACKING_URI env var
                         or http://localhost:5000.
        """
        self._tracking_uri = tracking_uri or os.environ.get(
            "MLFLOW_TRACKING_URI", "http://localhost:5000"
        )
        mlflow.set_tracking_uri(self._tracking_uri)
        self._client = MlflowClient(self._tracking_uri)
        self._current_experiment_id: str | None = None

    @property
    def tracking_uri(self) -> str:
        """Get the MLflow tracking URI."""
        return self._tracking_uri

    def set_experiment(self, name: str) -> str:
        """Set or create an experiment."""
        if not name.startswith("neon-local-"):
            name = f"neon-local-{name}"

        experiment = mlflow.set_experiment(name)
        self._current_experiment_id = experiment.experiment_id
        return experiment.experiment_id

    def execute_with_tracing(
        self,
        agent_fn: Callable[..., Any],
        input_data: dict[str, Any],
        run_name: str | None = None,
        tags: dict[str, str] | None = None,
        timeout_seconds: int | None = None,
    ) -> dict[str, Any]:
        """Execute an agent function with MLflow tracing.

        Returns:
            Dict with mlflow_run_id, mlflow_trace_id, output, status, error,
            execution_time_ms, and trace_summary.
        """
        neon_tags = {"neon.source": "neon-local"}
        if tags:
            neon_tags.update({
                f"neon.{k}" if not k.startswith("neon.") else k: v
                for k, v in tags.items()
            })

        with mlflow.start_run(run_name=run_name, tags=neon_tags) as mlflow_run:
            start_time = time.time()
            status = "success"
            error = None
            output = None
            trace = None

            try:
                # Enable MLflow tracing
                mlflow.tracing.enable()

                # Execute the agent
                output = agent_fn(**input_data)

                # Get trace
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

            # Extract trace summary
            trace_summary = None
            trace_id = None
            if trace:
                trace_id = trace.info.request_id
                trace_summary = self._extract_trace_summary(trace)

            return {
                "mlflow_run_id": mlflow_run.info.run_id,
                "mlflow_trace_id": trace_id,
                "output": output,
                "status": status,
                "error": error,
                "execution_time_ms": execution_time_ms,
                "trace_summary": trace_summary,
            }

    def _extract_trace_summary(self, trace: Any) -> dict[str, Any] | None:
        """Extract summary from MLflow trace."""
        try:
            from mlflow.entities import SpanType

            spans = list(trace.data.spans) if trace.data else []
            tool_spans = [s for s in spans if s.span_type == SpanType.TOOL]
            llm_spans = [s for s in spans if s.span_type == SpanType.CHAT_MODEL]

            total_tokens = 0
            input_tokens = 0
            output_tokens = 0

            for span in llm_spans:
                attrs = span.attributes or {}
                total_tokens += attrs.get("llm.token_count.total", 0)
                input_tokens += attrs.get("llm.token_count.prompt", 0)
                output_tokens += attrs.get("llm.token_count.completion", 0)

            status = trace.info.status if trace.info else "UNKNOWN"

            return {
                "trace_id": trace.info.request_id,
                "total_spans": len(spans),
                "tool_calls": [s.name for s in tool_spans],
                "llm_calls": len(llm_spans),
                "total_tokens": total_tokens,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "duration_ms": trace.info.execution_time_ms or 0,
                "status": status,
            }
        except Exception:
            return None


class CaseModelAdapter:
    """Adapter to make LocalCase work with scorers that expect EvalCaseModel."""

    def __init__(self, case: LocalCase):
        self._case = case

    @property
    def id(self) -> str:
        return self._case.id

    @property
    def name(self) -> str:
        return self._case.name

    @property
    def description(self) -> str | None:
        return self._case.description

    @property
    def input(self) -> dict[str, Any]:
        return self._case.input

    @property
    def expected_tools(self) -> list[str] | None:
        return self._case.expected_tools

    @property
    def expected_tool_sequence(self) -> list[str] | None:
        return self._case.expected_tool_sequence

    @property
    def expected_output_contains(self) -> list[str] | None:
        return self._case.expected_output_contains

    @property
    def expected_output_pattern(self) -> str | None:
        return self._case.expected_output_pattern

    @property
    def scorers(self) -> list[str]:
        return self._case.scorers

    @property
    def scorer_config(self) -> dict[str, Any] | None:
        return self._case.scorer_config

    @property
    def min_score(self) -> float:
        return self._case.min_score

    @property
    def timeout_seconds(self) -> int:
        return self._case.timeout_seconds

    @property
    def tags(self) -> list[str]:
        return self._case.tags


class LocalRunner:
    """Local evaluation runner - executes evaluations without API server."""

    def __init__(
        self,
        db: LocalDatabase | None = None,
        mlflow_client: LocalMLflowClient | None = None,
        scorers: dict[str, Any] | None = None,
    ):
        """Initialize the local runner.

        Args:
            db: Local database for storing results. Defaults to ~/.agent-eval/results.db
            mlflow_client: MLflow client for tracing. Defaults to local MLflow instance.
            scorers: Optional scorer dictionary. Defaults to built-in scorers.
        """
        self.db = db or LocalDatabase()
        self.mlflow_client = mlflow_client or LocalMLflowClient()
        self._scorers = scorers

    @property
    def scorers(self) -> dict[str, Any]:
        """Get the scorers, lazy-loading defaults if needed."""
        if self._scorers is None:
            self._scorers = _get_default_scorers()
        return self._scorers

    @scorers.setter
    def scorers(self, value: dict[str, Any]) -> None:
        """Set the scorers."""
        self._scorers = value

    def load_suite_from_file(self, suite_path: Path) -> LocalSuite:
        """Load an eval suite from a YAML file.

        Args:
            suite_path: Path to the YAML suite file.

        Returns:
            LocalSuite object.
        """
        suite_data = load_suite(suite_path)

        cases = []
        for case_data in suite_data.get("cases", []):
            cases.append(
                LocalCase(
                    id=str(uuid4()),
                    name=case_data["name"],
                    description=case_data.get("description"),
                    input=case_data["input"],
                    expected_tools=case_data.get("expected_tools"),
                    expected_tool_sequence=case_data.get("expected_tool_sequence"),
                    expected_output_contains=case_data.get("expected_output_contains"),
                    expected_output_pattern=case_data.get("expected_output_pattern"),
                    scorers=case_data.get("scorers", suite_data.get("default_scorers", ["tool_selection", "reasoning"])),
                    scorer_config=case_data.get("scorer_config"),
                    min_score=case_data.get("min_score", suite_data.get("default_min_score", 0.7)),
                    timeout_seconds=case_data.get("timeout_seconds", suite_data.get("default_timeout_seconds", 300)),
                    tags=case_data.get("tags", []),
                )
            )

        config = {
            "parallel": suite_data.get("parallel", True),
            "stop_on_failure": suite_data.get("stop_on_failure", False),
        }

        return LocalSuite(
            id=str(uuid4()),
            name=suite_data["name"],
            description=suite_data.get("description"),
            agent_id=suite_data.get("agent_id", ""),
            config=config,
            cases=cases,
        )

    def execute_run(
        self,
        suite: LocalSuite,
        agent: AgentProtocol | Callable[..., Any],
        agent_version: str | None = None,
        parallel: bool | None = None,
    ) -> LocalRun:
        """Execute all cases in a suite.

        Args:
            suite: The eval suite to run.
            agent: The agent to test.
            agent_version: Version identifier for the agent.
            parallel: Override parallel execution setting.

        Returns:
            LocalRun with results.
        """
        # Create run record
        run = LocalRun(
            id=str(uuid4()),
            suite_id=suite.id,
            suite_name=suite.name,
            agent_version=agent_version,
            trigger="cli-local",
            status="running",
            config=suite.config,
            summary=None,
            started_at=datetime.utcnow().isoformat(),
            completed_at=None,
            created_at=datetime.utcnow().isoformat(),
        )

        # Set up MLflow experiment
        self.mlflow_client.set_experiment(suite.name)

        # Save initial run state
        self.db.save_run(run)

        try:
            # Determine execution mode
            use_parallel = parallel if parallel is not None else suite.config.get("parallel", True)
            stop_on_failure = suite.config.get("stop_on_failure", False)

            # Execute cases
            if use_parallel:
                # Run async for parallel execution
                results = asyncio.run(self._execute_cases_parallel(run, suite, agent))
            else:
                results = []
                for case in suite.cases:
                    result = self._execute_case(run, case, suite, agent)
                    results.append(result)
                    if stop_on_failure and not result.passed:
                        break

            run.results = results

            # Calculate summary
            run.summary = self._calculate_summary(results)
            run.status = "completed"
            run.completed_at = datetime.utcnow().isoformat()

        except Exception as e:
            run.status = "failed"
            run.completed_at = datetime.utcnow().isoformat()
            run.summary = {"error": str(e)}

        # Save final run state
        self.db.save_run(run)
        return run

    async def _execute_cases_parallel(
        self,
        run: LocalRun,
        suite: LocalSuite,
        agent: AgentProtocol | Callable[..., Any],
    ) -> list[LocalResult]:
        """Execute cases in parallel using asyncio."""
        loop = asyncio.get_event_loop()

        async def run_case(case: LocalCase) -> LocalResult:
            # Run in thread pool to avoid blocking
            return await loop.run_in_executor(
                None, self._execute_case, run, case, suite, agent
            )

        tasks = [run_case(case) for case in suite.cases]
        return await asyncio.gather(*tasks)

    def _execute_case(
        self,
        run: LocalRun,
        case: LocalCase,
        suite: LocalSuite,
        agent: AgentProtocol | Callable[..., Any],
    ) -> LocalResult:
        """Execute a single test case with MLflow tracing.

        Args:
            run: The parent eval run.
            case: The test case to execute.
            suite: The parent eval suite.
            agent: The agent to test.

        Returns:
            LocalResult with execution results.
        """
        status = "success"
        output: dict[str, Any] | None = None
        error: str | None = None
        scores: dict[str, float] = {}
        score_details: dict[str, Any] = {}
        mlflow_run_id: str | None = None
        mlflow_trace_id: str | None = None
        execution_time_ms: int = 0

        try:
            # Build agent callable
            query = case.input.get("query", "")
            context = case.input.get("context", {})

            # Create wrapper function for agent execution
            def agent_callable(query: str, context: dict[str, Any] | None = None) -> Any:
                if hasattr(agent, "run"):
                    return agent.run(query, context)
                return agent(query, context)

            # Execute agent with MLflow tracing
            run_name = f"{run.id[:8]}/{case.name}"
            tags = {
                "run_id": run.id,
                "case_name": case.name,
                "suite_name": suite.name,
            }
            if run.agent_version:
                tags["agent_version"] = run.agent_version

            exec_result = self.mlflow_client.execute_with_tracing(
                agent_fn=agent_callable,
                input_data={"query": query, "context": context},
                run_name=run_name,
                tags=tags,
                timeout_seconds=case.timeout_seconds,
            )

            # Extract results
            mlflow_run_id = exec_result["mlflow_run_id"]
            mlflow_trace_id = exec_result["mlflow_trace_id"]
            execution_time_ms = exec_result["execution_time_ms"]

            if exec_result["status"] == "success":
                output = exec_result["output"]
                status = "success"
            else:
                status = "error"
                error = exec_result["error"]

            # Add trace summary to score_details
            if exec_result.get("trace_summary"):
                score_details["trace_summary"] = exec_result["trace_summary"]

            # Run scorers if execution was successful
            if status == "success" and output is not None:
                case_adapter = CaseModelAdapter(case)
                for scorer_name in case.scorers:
                    scorer = self.scorers.get(scorer_name)
                    if scorer:
                        scorer_result = asyncio.run(
                            scorer.score(
                                case=case_adapter,
                                output=output,
                                config=case.scorer_config,
                            )
                        )
                        scores[scorer_name] = scorer_result.score
                        score_details[scorer_name] = {
                            "score": scorer_result.score,
                            "reason": scorer_result.reason,
                            "evidence": scorer_result.evidence,
                        }

        except TimeoutError:
            status = "timeout"
            error = f"Execution timed out after {case.timeout_seconds}s"
        except Exception as e:
            status = "error"
            error = str(e)

        # Calculate pass/fail
        avg_score = sum(scores.values()) / len(scores) if scores else 0.0
        passed = avg_score >= case.min_score and status == "success"

        # Create result
        result = LocalResult(
            id=str(uuid4()),
            run_id=run.id,
            case_id=case.id,
            case_name=case.name,
            mlflow_run_id=mlflow_run_id,
            mlflow_trace_id=mlflow_trace_id,
            status=status,
            output=output,
            scores=scores,
            score_details=score_details,
            passed=passed,
            execution_time_ms=execution_time_ms,
            error=error,
            created_at=datetime.utcnow().isoformat(),
        )

        # Save result
        self.db.save_result(result)
        return result

    def _calculate_summary(self, results: list[LocalResult]) -> dict[str, Any]:
        """Calculate summary statistics for a run."""
        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = sum(1 for r in results if not r.passed and r.status == "success")
        errored = sum(1 for r in results if r.status in ("error", "timeout"))

        # Calculate average scores
        all_scores: dict[str, list[float]] = {}
        for result in results:
            for scorer, score in result.scores.items():
                if scorer not in all_scores:
                    all_scores[scorer] = []
                all_scores[scorer].append(score)

        scores_by_type = {
            scorer: sum(scores) / len(scores)
            for scorer, scores in all_scores.items()
        }

        avg_score = (
            sum(sum(scores) for scores in all_scores.values())
            / sum(len(scores) for scores in all_scores.values())
            if all_scores
            else 0.0
        )

        total_time = sum(r.execution_time_ms or 0 for r in results)

        return {
            "total_cases": total,
            "passed": passed,
            "failed": failed,
            "errored": errored,
            "avg_score": round(avg_score, 4),
            "scores_by_type": {k: round(v, 4) for k, v in scores_by_type.items()},
            "execution_time_ms": total_time,
        }


def compare_local_runs(
    baseline_id: str,
    candidate_id: str,
    threshold: float = 0.05,
    db: LocalDatabase | None = None,
) -> dict[str, Any]:
    """Compare two local runs and identify regressions.

    Args:
        baseline_id: ID of the baseline run.
        candidate_id: ID of the candidate run.
        threshold: Regression threshold (0-1).
        db: Local database. Defaults to ~/.agent-eval/results.db.

    Returns:
        Comparison result dictionary.
    """
    db = db or LocalDatabase()

    baseline = db.get_run(baseline_id)
    candidate = db.get_run(candidate_id)

    if not baseline:
        raise ValueError(f"Baseline run not found: {baseline_id}")
    if not candidate:
        raise ValueError(f"Candidate run not found: {candidate_id}")

    baseline_results = db.get_results_for_run(baseline_id)
    candidate_results = db.get_results_for_run(candidate_id)

    # Build lookup by case name
    baseline_by_case = {r.case_name: r for r in baseline_results}
    candidate_by_case = {r.case_name: r for r in candidate_results}

    regressions = []
    improvements = []
    unchanged = 0

    # Compare matching cases
    for case_name in set(baseline_by_case.keys()) & set(candidate_by_case.keys()):
        baseline_result = baseline_by_case[case_name]
        candidate_result = candidate_by_case[case_name]

        for scorer in set(baseline_result.scores.keys()) & set(candidate_result.scores.keys()):
            baseline_score = baseline_result.scores[scorer]
            candidate_score = candidate_result.scores[scorer]
            delta = candidate_score - baseline_score

            if delta < -threshold:
                regressions.append({
                    "case_name": case_name,
                    "scorer": scorer,
                    "baseline_score": baseline_score,
                    "candidate_score": candidate_score,
                    "delta": delta,
                })
            elif delta > threshold:
                improvements.append({
                    "case_name": case_name,
                    "scorer": scorer,
                    "baseline_score": baseline_score,
                    "candidate_score": candidate_score,
                    "delta": delta,
                })
            else:
                unchanged += 1

    # Calculate overall delta
    baseline_avg = baseline.summary.get("avg_score", 0) if baseline.summary else 0
    candidate_avg = candidate.summary.get("avg_score", 0) if candidate.summary else 0
    overall_delta = candidate_avg - baseline_avg

    return {
        "passed": len(regressions) == 0,
        "threshold": threshold,
        "overall_delta": overall_delta,
        "baseline": {
            "id": baseline.id,
            "agent_version": baseline.agent_version,
            "suite_name": baseline.suite_name,
            "summary": baseline.summary,
        },
        "candidate": {
            "id": candidate.id,
            "agent_version": candidate.agent_version,
            "suite_name": candidate.suite_name,
            "summary": candidate.summary,
        },
        "regressions": regressions,
        "improvements": improvements,
        "unchanged": unchanged,
    }
