"""
Neon API Client

Type-safe client for the Neon API.
"""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx

from neon_sdk.types import (
    CreateDatasetInput,
    CreateScoreInput,
    Dataset,
    EvalRun,
    EvalRunResult,
    Score,
    Trace,
    TraceFilters,
    TraceWithSpans,
)

# =============================================================================
# Configuration
# =============================================================================


@dataclass
class NeonConfig:
    """Client configuration."""

    api_key: str
    base_url: str = "https://api.neon.dev"
    timeout: float = 30.0


# =============================================================================
# API Namespaces
# =============================================================================


class TracesAPI:
    """Trace API methods."""

    def __init__(self, client: Neon) -> None:
        self._client = client

    async def list(self, filters: TraceFilters | None = None) -> list[Trace]:
        """List traces with optional filtering."""
        params: dict[str, Any] = {}
        if filters:
            if filters.project_id:
                params["project_id"] = filters.project_id
            if filters.status:
                params["status"] = filters.status.value
            if filters.start_date:
                params["start_date"] = filters.start_date.isoformat()
            if filters.end_date:
                params["end_date"] = filters.end_date.isoformat()
            if filters.agent_id:
                params["agent_id"] = filters.agent_id
            if filters.search:
                params["search"] = filters.search
            if filters.limit:
                params["limit"] = str(filters.limit)
            if filters.offset:
                params["offset"] = str(filters.offset)

        data = await self._client._request("GET", "/api/traces", params=params)
        return [Trace.model_validate(t) for t in data]

    async def get(self, trace_id: str) -> TraceWithSpans:
        """Get a single trace with all spans."""
        data = await self._client._request("GET", f"/api/traces/{trace_id}")
        return TraceWithSpans.model_validate(data)

    async def search(self, query: str, limit: int | None = None) -> list[Trace]:
        """Search traces by content."""
        params: dict[str, Any] = {"query": query}
        if limit:
            params["limit"] = str(limit)
        data = await self._client._request("GET", "/api/traces/search", params=params)
        return [Trace.model_validate(t) for t in data]


class ScoresAPI:
    """Score API methods."""

    def __init__(self, client: Neon) -> None:
        self._client = client

    async def create(self, input: CreateScoreInput) -> Score:
        """Create a score."""
        data = await self._client._request(
            "POST",
            "/api/scores",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Score.model_validate(data)

    async def create_batch(self, inputs: list[CreateScoreInput]) -> list[Score]:
        """Create multiple scores in batch."""
        data = await self._client._request(
            "POST",
            "/api/scores/batch",
            json=[i.model_dump(by_alias=True, exclude_none=True) for i in inputs],
        )
        return [Score.model_validate(s) for s in data]

    async def list(self, trace_id: str) -> list[Score]:
        """List scores for a trace."""
        data = await self._client._request("GET", f"/api/traces/{trace_id}/scores")
        return [Score.model_validate(s) for s in data]


class DatasetsAPI:
    """Dataset API methods."""

    def __init__(self, client: Neon) -> None:
        self._client = client

    async def create(self, input: CreateDatasetInput) -> Dataset:
        """Create a dataset."""
        data = await self._client._request(
            "POST",
            "/api/datasets",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Dataset.model_validate(data)

    async def add_items(
        self,
        dataset_id: str,
        items: list[dict[str, Any]],
    ) -> None:
        """Add items to a dataset."""
        await self._client._request(
            "POST",
            f"/api/datasets/{dataset_id}/items",
            json={"items": items},
        )

    async def list(self) -> list[Dataset]:
        """List datasets."""
        data = await self._client._request("GET", "/api/datasets")
        return [Dataset.model_validate(d) for d in data]

    async def get(self, dataset_id: str) -> Dataset:
        """Get a dataset."""
        data = await self._client._request("GET", f"/api/datasets/{dataset_id}")
        return Dataset.model_validate(data)


class EvalAPI:
    """Evaluation API methods."""

    def __init__(self, client: Neon) -> None:
        self._client = client

    async def run_suite(self, suite: dict[str, Any]) -> EvalRun:
        """Run a test suite."""
        data = await self._client._request("POST", "/api/eval/suite", json=suite)
        return EvalRun.model_validate(data)

    async def run_tests(self, tests: list[dict[str, Any]]) -> EvalRunResult:
        """Run individual tests."""
        data = await self._client._request(
            "POST",
            "/api/eval/tests",
            json={"tests": tests},
        )
        return EvalRunResult.model_validate(data)

    async def get_run_status(self, run_id: str) -> EvalRun:
        """Get evaluation run status."""
        data = await self._client._request("GET", f"/api/eval/runs/{run_id}")
        return EvalRun.model_validate(data)

    async def wait_for_run(
        self,
        run_id: str,
        poll_interval: float = 1.0,
    ) -> EvalRunResult:
        """Wait for evaluation run to complete."""
        while True:
            run = await self.get_run_status(run_id)
            if run.status.value == "completed":
                data = await self._client._request(
                    "GET", f"/api/eval/runs/{run_id}/result"
                )
                return EvalRunResult.model_validate(data)
            if run.status.value == "failed":
                raise RuntimeError(f"Evaluation run failed: {run.error_message}")
            await asyncio.sleep(poll_interval)


# =============================================================================
# Main Client
# =============================================================================


class Neon:
    """
    Neon API Client.

    Example:
        ```python
        client = Neon(NeonConfig(api_key="your-api-key"))

        # List traces
        traces = await client.traces.list()

        # Get a specific trace
        trace = await client.traces.get("trace-id")

        # Create a score
        score = await client.scores.create(CreateScoreInput(
            project_id="project-id",
            trace_id="trace-id",
            name="accuracy",
            value=0.95,
        ))
        ```
    """

    def __init__(self, config: NeonConfig) -> None:
        self._api_key = config.api_key
        self._base_url = config.base_url.rstrip("/")
        self._timeout = config.timeout

        # Initialize API namespaces
        self.traces = TracesAPI(self)
        self.scores = ScoresAPI(self)
        self.datasets = DatasetsAPI(self)
        self.eval = EvalAPI(self)

    async def _request(
        self,
        method: str,
        path: str,
        json: Any = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Make an authenticated API request."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(
                method=method,
                url=f"{self._base_url}{path}",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=json,
                params=params,
            )

            if not response.is_success:
                error = response.text
                raise RuntimeError(f"Neon API error: {response.status_code} {error}")

            return response.json()


class NeonSync:
    """
    Synchronous Neon API Client wrapper.

    Wraps the async client for synchronous usage.

    Example:
        ```python
        client = NeonSync(NeonConfig(api_key="your-api-key"))

        # List traces
        traces = client.traces.list()

        # Get a specific trace
        trace = client.traces.get("trace-id")
        ```
    """

    def __init__(self, config: NeonConfig) -> None:
        self._async_client = Neon(config)
        self.traces = SyncTracesAPI(self._async_client.traces)
        self.scores = SyncScoresAPI(self._async_client.scores)
        self.datasets = SyncDatasetsAPI(self._async_client.datasets)
        self.eval = SyncEvalAPI(self._async_client.eval)


_T = TypeVar("_T")


def _run_sync(coro: Coroutine[Any, Any, _T]) -> _T:
    """Run a coroutine synchronously."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # If there's an existing event loop, use a thread
        import threading

        result: _T | None = None
        exception: BaseException | None = None

        def run() -> None:
            nonlocal result, exception
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    result = new_loop.run_until_complete(coro)
                finally:
                    new_loop.close()
            except BaseException as e:
                exception = e

        thread = threading.Thread(target=run)
        thread.start()
        thread.join()

        if exception:
            raise exception
        return result  # type: ignore[return-value]
    else:
        return asyncio.run(coro)


class SyncTracesAPI:
    """Synchronous Traces API wrapper."""

    def __init__(self, async_api: TracesAPI) -> None:
        self._async = async_api

    def list(self, filters: TraceFilters | None = None) -> list[Trace]:
        return _run_sync(self._async.list(filters))

    def get(self, trace_id: str) -> TraceWithSpans:
        return _run_sync(self._async.get(trace_id))

    def search(self, query: str, limit: int | None = None) -> list[Trace]:
        return _run_sync(self._async.search(query, limit))


class SyncScoresAPI:
    """Synchronous Scores API wrapper."""

    def __init__(self, async_api: ScoresAPI) -> None:
        self._async = async_api

    def create(self, input: CreateScoreInput) -> Score:
        return _run_sync(self._async.create(input))

    def create_batch(self, inputs: list[CreateScoreInput]) -> list[Score]:
        return _run_sync(self._async.create_batch(inputs))

    def list(self, trace_id: str) -> list[Score]:
        return _run_sync(self._async.list(trace_id))


class SyncDatasetsAPI:
    """Synchronous Datasets API wrapper."""

    def __init__(self, async_api: DatasetsAPI) -> None:
        self._async = async_api

    def create(self, input: CreateDatasetInput) -> Dataset:
        return _run_sync(self._async.create(input))

    def add_items(self, dataset_id: str, items: list[dict[str, Any]]) -> None:
        return _run_sync(self._async.add_items(dataset_id, items))

    def list(self) -> list[Dataset]:
        return _run_sync(self._async.list())

    def get(self, dataset_id: str) -> Dataset:
        return _run_sync(self._async.get(dataset_id))


class SyncEvalAPI:
    """Synchronous Eval API wrapper."""

    def __init__(self, async_api: EvalAPI) -> None:
        self._async = async_api

    def run_suite(self, suite: dict[str, Any]) -> EvalRun:
        return _run_sync(self._async.run_suite(suite))

    def run_tests(self, tests: list[dict[str, Any]]) -> EvalRunResult:
        return _run_sync(self._async.run_tests(tests))

    def get_run_status(self, run_id: str) -> EvalRun:
        return _run_sync(self._async.get_run_status(run_id))

    def wait_for_run(self, run_id: str, poll_interval: float = 1.0) -> EvalRunResult:
        return _run_sync(self._async.wait_for_run(run_id, poll_interval))


def create_neon_client(config: NeonConfig) -> Neon:
    """Create a new async Neon client."""
    return Neon(config)


def create_neon_client_sync(config: NeonConfig) -> NeonSync:
    """Create a new synchronous Neon client."""
    return NeonSync(config)


__all__ = [
    "NeonConfig",
    "Neon",
    "NeonSync",
    "create_neon_client",
    "create_neon_client_sync",
]
