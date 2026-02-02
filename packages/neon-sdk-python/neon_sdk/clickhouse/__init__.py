"""
Neon ClickHouse Client

Provides connection to ClickHouse for trace/span/score storage.

Requires the `clickhouse` optional dependency:
    pip install neon-sdk[clickhouse]
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

try:
    import clickhouse_connect
    from clickhouse_connect.driver import Client as ClickHouseClient
except ImportError as e:
    raise ImportError(
        "ClickHouse support requires the 'clickhouse' extra. "
        "Install with: pip install neon-sdk[clickhouse]"
    ) from e


# =============================================================================
# Configuration
# =============================================================================


@dataclass
class ClickHouseConfig:
    """ClickHouse client configuration."""

    host: str = field(
        default_factory=lambda: os.environ.get("CLICKHOUSE_HOST", "localhost")
    )
    port: int = field(
        default_factory=lambda: int(os.environ.get("CLICKHOUSE_PORT", "8123"))
    )
    username: str = field(
        default_factory=lambda: os.environ.get("CLICKHOUSE_USER", "default")
    )
    password: str = field(
        default_factory=lambda: os.environ.get("CLICKHOUSE_PASSWORD", "")
    )
    database: str = field(
        default_factory=lambda: os.environ.get("CLICKHOUSE_DATABASE", "neon")
    )


# =============================================================================
# Record Types
# =============================================================================


@dataclass
class TraceRecord:
    """Trace record as stored in ClickHouse."""

    project_id: str
    trace_id: str
    name: str
    timestamp: datetime
    end_time: datetime | None
    duration_ms: int
    status: str  # "unset" | "ok" | "error"
    metadata: dict[str, str]
    agent_id: str | None = None
    agent_version: str | None = None
    workflow_id: str | None = None
    run_id: str | None = None
    total_tokens: int = 0
    total_cost: float = 0.0
    llm_calls: int = 0
    tool_calls: int = 0


@dataclass
class SpanRecord:
    """Span record as stored in ClickHouse."""

    project_id: str
    trace_id: str
    span_id: str
    parent_span_id: str | None
    name: str
    kind: str  # "internal" | "server" | "client" | "producer" | "consumer"
    span_type: str  # "span" | "generation" | "tool" | "retrieval" | "event"
    timestamp: datetime
    end_time: datetime | None
    duration_ms: int
    status: str  # "unset" | "ok" | "error"
    status_message: str = ""
    model: str | None = None
    model_parameters: dict[str, str] = field(default_factory=dict)
    input: str = ""
    output: str = ""
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None
    tool_name: str | None = None
    tool_input: str = ""
    tool_output: str = ""
    attributes: dict[str, str] = field(default_factory=dict)


@dataclass
class ScoreRecord:
    """Score record as stored in ClickHouse."""

    project_id: str
    score_id: str
    trace_id: str
    span_id: str | None
    run_id: str | None
    case_id: str | None
    name: str
    value: float
    score_type: str  # "numeric" | "categorical" | "boolean"
    string_value: str | None
    comment: str
    source: str  # "api" | "sdk" | "annotation" | "eval" | "temporal"
    config_id: str | None
    author_id: str | None
    timestamp: datetime


# =============================================================================
# Dashboard Types
# =============================================================================


@dataclass
class DailyStats:
    """Daily statistics."""

    date: date
    trace_count: int
    error_count: int
    total_tokens: int
    total_cost: float


@dataclass
class ScoreTrendPoint:
    """Score trend data point."""

    date: date
    name: str
    avg_score: float
    min_score: float
    max_score: float
    score_count: int


@dataclass
class DurationStats:
    """Duration statistics with percentiles."""

    date: date
    avg_duration_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    min_duration_ms: float
    max_duration_ms: float
    trace_count: int


@dataclass
class DashboardSummary:
    """Dashboard summary aggregates."""

    total_runs: int
    passed_runs: int
    failed_runs: int
    pass_rate: float
    avg_duration_ms: float
    total_tokens: int
    total_cost: float


# =============================================================================
# ClickHouse Client
# =============================================================================


class NeonClickHouseClient:
    """
    Neon ClickHouse Client.

    Provides access to ClickHouse for trace/span/score storage and analytics.

    Example:
        ```python
        from neon_sdk.clickhouse import NeonClickHouseClient, ClickHouseConfig

        client = NeonClickHouseClient()

        # Insert traces
        await client.insert_traces([trace_record])

        # Query traces
        traces = await client.query_traces(
            project_id="proj-123",
            status="ok",
            limit=50,
        )

        # Get dashboard summary
        summary = await client.get_dashboard_summary(
            project_id="proj-123",
            start_date="2024-01-01",
            end_date="2024-01-31",
        )
        ```
    """

    def __init__(self, config: ClickHouseConfig | None = None) -> None:
        self._config = config or ClickHouseConfig()
        self._client: ClickHouseClient | None = None

    def _get_client(self) -> ClickHouseClient:
        """Get or create ClickHouse client."""
        if self._client is None:
            self._client = clickhouse_connect.get_client(
                host=self._config.host,
                port=self._config.port,
                username=self._config.username,
                password=self._config.password,
                database=self._config.database,
            )
        return self._client

    def close(self) -> None:
        """Close the client connection."""
        if self._client:
            self._client.close()
            self._client = None

    # ==================== Insert Operations ====================

    def insert_traces(self, traces: list[TraceRecord]) -> None:
        """Insert traces into ClickHouse."""
        client = self._get_client()
        data = [
            {
                "project_id": t.project_id,
                "trace_id": t.trace_id,
                "name": t.name,
                "timestamp": t.timestamp,
                "end_time": t.end_time,
                "duration_ms": t.duration_ms,
                "status": t.status,
                "metadata": t.metadata,
                "agent_id": t.agent_id,
                "agent_version": t.agent_version,
                "workflow_id": t.workflow_id,
                "run_id": t.run_id,
                "total_tokens": t.total_tokens,
                "total_cost": t.total_cost,
                "llm_calls": t.llm_calls,
                "tool_calls": t.tool_calls,
            }
            for t in traces
        ]
        client.insert("traces", data)

    def insert_spans(self, spans: list[SpanRecord]) -> None:
        """Insert spans into ClickHouse."""
        client = self._get_client()
        data = [
            {
                "project_id": s.project_id,
                "trace_id": s.trace_id,
                "span_id": s.span_id,
                "parent_span_id": s.parent_span_id,
                "name": s.name,
                "kind": s.kind,
                "span_type": s.span_type,
                "timestamp": s.timestamp,
                "end_time": s.end_time,
                "duration_ms": s.duration_ms,
                "status": s.status,
                "status_message": s.status_message,
                "model": s.model,
                "model_parameters": s.model_parameters,
                "input": s.input,
                "output": s.output,
                "input_tokens": s.input_tokens,
                "output_tokens": s.output_tokens,
                "total_tokens": s.total_tokens,
                "cost_usd": s.cost_usd,
                "tool_name": s.tool_name,
                "tool_input": s.tool_input,
                "tool_output": s.tool_output,
                "attributes": s.attributes,
            }
            for s in spans
        ]
        client.insert("spans", data)

    def insert_scores(self, scores: list[ScoreRecord]) -> None:
        """Insert scores into ClickHouse."""
        client = self._get_client()
        data = [
            {
                "project_id": s.project_id,
                "score_id": s.score_id,
                "trace_id": s.trace_id,
                "span_id": s.span_id,
                "run_id": s.run_id,
                "case_id": s.case_id,
                "name": s.name,
                "value": s.value,
                "score_type": s.score_type,
                "string_value": s.string_value,
                "comment": s.comment,
                "source": s.source,
                "config_id": s.config_id,
                "author_id": s.author_id,
                "timestamp": s.timestamp,
            }
            for s in scores
        ]
        client.insert("scores", data)

    # ==================== Query Operations ====================

    def query_traces(
        self,
        project_id: str,
        status: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Query traces with filters."""
        client = self._get_client()

        conditions = ["project_id = {project_id:String}"]
        params: dict[str, Any] = {"project_id": project_id, "limit": limit, "offset": offset}

        if status:
            conditions.append("status = {status:String}")
            params["status"] = status
        if start_date:
            conditions.append("timestamp >= {start_date:DateTime64(3)}")
            params["start_date"] = start_date
        if end_date:
            conditions.append("timestamp <= {end_date:DateTime64(3)}")
            params["end_date"] = end_date

        query = f"""
            SELECT *
            FROM traces
            WHERE {' AND '.join(conditions)}
            ORDER BY timestamp DESC
            LIMIT {{limit:UInt32}}
            OFFSET {{offset:UInt32}}
        """

        result = client.query(query, parameters=params)
        return [dict(zip(result.column_names, row, strict=False)) for row in result.result_rows]

    def get_trace_with_spans(
        self, project_id: str, trace_id: str
    ) -> dict[str, Any] | None:
        """Get a single trace with all its spans."""
        client = self._get_client()

        # Get trace
        trace_result = client.query(
            """
            SELECT * FROM traces
            WHERE project_id = {project_id:String} AND trace_id = {trace_id:String}
            LIMIT 1
            """,
            parameters={"project_id": project_id, "trace_id": trace_id},
        )

        if not trace_result.result_rows:
            return None

        trace = dict(zip(trace_result.column_names, trace_result.result_rows[0], strict=False))

        # Get spans
        spans_result = client.query(
            """
            SELECT * FROM spans
            WHERE project_id = {project_id:String} AND trace_id = {trace_id:String}
            ORDER BY timestamp ASC
            """,
            parameters={"project_id": project_id, "trace_id": trace_id},
        )

        spans = [
            dict(zip(spans_result.column_names, row, strict=False))
            for row in spans_result.result_rows
        ]

        return {"trace": trace, "spans": spans}

    def get_scores_for_trace(
        self, project_id: str, trace_id: str
    ) -> list[dict[str, Any]]:
        """Get scores for a trace."""
        client = self._get_client()

        result = client.query(
            """
            SELECT * FROM scores
            WHERE project_id = {project_id:String} AND trace_id = {trace_id:String}
            ORDER BY timestamp DESC
            """,
            parameters={"project_id": project_id, "trace_id": trace_id},
        )

        return [dict(zip(result.column_names, row, strict=False)) for row in result.result_rows]

    # ==================== Dashboard Operations ====================

    def get_daily_stats(
        self, project_id: str, start_date: str, end_date: str
    ) -> list[DailyStats]:
        """Get daily statistics."""
        client = self._get_client()

        result = client.query(
            """
            SELECT
                date,
                sum(trace_count) as trace_count,
                sum(error_count) as error_count,
                sum(total_tokens) as total_tokens,
                sum(total_cost) as total_cost
            FROM daily_stats_mv
            WHERE project_id = {project_id:String}
              AND date >= {start_date:Date}
              AND date <= {end_date:Date}
            GROUP BY date
            ORDER BY date ASC
            """,
            parameters={
                "project_id": project_id,
                "start_date": start_date,
                "end_date": end_date,
            },
        )

        return [
            DailyStats(
                date=row[0],
                trace_count=row[1],
                error_count=row[2],
                total_tokens=row[3],
                total_cost=row[4],
            )
            for row in result.result_rows
        ]

    def get_score_trends(
        self,
        project_id: str,
        start_date: str,
        end_date: str,
        scorer_name: str | None = None,
    ) -> list[ScoreTrendPoint]:
        """Get score trends with min/max values."""
        client = self._get_client()

        conditions = [
            "project_id = {project_id:String}",
            "date >= {start_date:Date}",
            "date <= {end_date:Date}",
        ]
        params: dict[str, Any] = {
            "project_id": project_id,
            "start_date": start_date,
            "end_date": end_date,
        }

        if scorer_name:
            conditions.append("name = {scorer_name:String}")
            params["scorer_name"] = scorer_name

        result = client.query(
            f"""
            SELECT
                date,
                name,
                avgMerge(avg_score_state) as avg_score,
                minMerge(min_score_state) as min_score,
                maxMerge(max_score_state) as max_score,
                countMerge(score_count_state) as score_count
            FROM score_trends_full_mv
            WHERE {' AND '.join(conditions)}
            GROUP BY date, name
            ORDER BY date ASC, name ASC
            """,
            parameters=params,
        )

        return [
            ScoreTrendPoint(
                date=row[0],
                name=row[1],
                avg_score=row[2],
                min_score=row[3],
                max_score=row[4],
                score_count=row[5],
            )
            for row in result.result_rows
        ]

    def get_duration_stats(
        self, project_id: str, start_date: str, end_date: str
    ) -> list[DurationStats]:
        """Get duration statistics with percentiles."""
        client = self._get_client()

        result = client.query(
            """
            SELECT
                date,
                avgMerge(avg_duration_state) as avg_duration_ms,
                quantileMerge(0.5)(p50_state) as p50_ms,
                quantileMerge(0.95)(p95_state) as p95_ms,
                quantileMerge(0.99)(p99_state) as p99_ms,
                minMerge(min_duration_state) as min_duration_ms,
                maxMerge(max_duration_state) as max_duration_ms,
                countMerge(trace_count_state) as trace_count
            FROM duration_stats_mv
            WHERE project_id = {project_id:String}
              AND date >= {start_date:Date}
              AND date <= {end_date:Date}
            GROUP BY date
            ORDER BY date ASC
            """,
            parameters={
                "project_id": project_id,
                "start_date": start_date,
                "end_date": end_date,
            },
        )

        return [
            DurationStats(
                date=row[0],
                avg_duration_ms=row[1],
                p50_ms=row[2],
                p95_ms=row[3],
                p99_ms=row[4],
                min_duration_ms=row[5],
                max_duration_ms=row[6],
                trace_count=row[7],
            )
            for row in result.result_rows
        ]

    def get_dashboard_summary(
        self, project_id: str, start_date: str, end_date: str
    ) -> DashboardSummary:
        """Get aggregated dashboard summary for a date range."""
        client = self._get_client()

        result = client.query(
            """
            SELECT
                count() as total_runs,
                countIf(status = 'ok') as passed_runs,
                countIf(status = 'error') as failed_runs,
                if(count() > 0, countIf(status = 'ok') / count(), 0) as pass_rate,
                if(count() > 0, avg(duration_ms), 0) as avg_duration_ms,
                sum(total_tokens) as total_tokens,
                sum(total_cost) as total_cost
            FROM traces
            WHERE project_id = {project_id:String}
              AND timestamp >= {start_date:Date}
              AND timestamp <= {end_date:Date} + INTERVAL 1 DAY
            """,
            parameters={
                "project_id": project_id,
                "start_date": start_date,
                "end_date": end_date,
            },
        )

        if result.result_rows:
            row = result.result_rows[0]
            return DashboardSummary(
                total_runs=row[0],
                passed_runs=row[1],
                failed_runs=row[2],
                pass_rate=row[3],
                avg_duration_ms=row[4],
                total_tokens=row[5],
                total_cost=row[6],
            )

        return DashboardSummary(
            total_runs=0,
            passed_runs=0,
            failed_runs=0,
            pass_rate=0.0,
            avg_duration_ms=0.0,
            total_tokens=0,
            total_cost=0.0,
        )


# =============================================================================
# Convenience Functions
# =============================================================================


def create_clickhouse_client(
    config: ClickHouseConfig | None = None,
) -> NeonClickHouseClient:
    """Create a new ClickHouse client instance."""
    return NeonClickHouseClient(config)


# Singleton for convenience
_default_client: NeonClickHouseClient | None = None


def get_clickhouse_client() -> NeonClickHouseClient:
    """Get the default ClickHouse client instance (singleton)."""
    global _default_client
    if _default_client is None:
        _default_client = NeonClickHouseClient()
    return _default_client


__all__ = [
    # Config
    "ClickHouseConfig",
    # Record types
    "TraceRecord",
    "SpanRecord",
    "ScoreRecord",
    # Dashboard types
    "DailyStats",
    "ScoreTrendPoint",
    "DurationStats",
    "DashboardSummary",
    # Client
    "NeonClickHouseClient",
    "create_clickhouse_client",
    "get_clickhouse_client",
]
