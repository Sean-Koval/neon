"""
Neon Temporal Client

Provides type-safe access to Neon's Temporal workflows for durable execution.

Requires the `temporal` optional dependency:
    pip install neon-sdk[temporal]
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

try:
    from temporalio.client import Client, WorkflowHandle
except ImportError as e:
    raise ImportError(
        "Temporal support requires the 'temporal' extra. "
        "Install with: pip install neon-sdk[temporal]"
    ) from e


# =============================================================================
# Configuration
# =============================================================================


@dataclass
class TemporalClientConfig:
    """Temporal client configuration."""

    address: str = field(
        default_factory=lambda: os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
    )
    namespace: str = field(
        default_factory=lambda: os.environ.get("TEMPORAL_NAMESPACE", "default")
    )
    task_queue: str = field(
        default_factory=lambda: os.environ.get("TEMPORAL_TASK_QUEUE", "agent-workers")
    )


# =============================================================================
# Input/Output Types
# =============================================================================


@dataclass
class StartAgentRunInput:
    """Input for starting an agent run."""

    project_id: str
    agent_id: str
    agent_version: str
    input_data: dict[str, Any]
    tools: list[dict[str, Any]] | None = None
    metadata: dict[str, str] | None = None


@dataclass
class AgentProgress:
    """Agent run progress."""

    current_step: int
    total_steps: int | None
    current_action: str | None
    messages: list[dict[str, Any]]


@dataclass
class AgentStatus:
    """Agent run status."""

    status: str  # "pending" | "running" | "completed" | "failed" | "cancelled"
    started_at: datetime | None
    completed_at: datetime | None
    error: str | None


@dataclass
class WorkflowInfo:
    """Workflow status information."""

    workflow_id: str
    run_id: str
    status: str
    start_time: datetime | None
    close_time: datetime | None
    memo: dict[str, Any] | None


@dataclass
class StartEvalRunInput:
    """Input for starting an evaluation run."""

    run_id: str
    project_id: str
    agent_id: str
    agent_version: str
    dataset: dict[str, Any]
    tools: list[dict[str, Any]]
    scorers: list[str]


@dataclass
class EvalProgress:
    """Evaluation run progress."""

    completed: int
    total: int


# =============================================================================
# Temporal Client
# =============================================================================


class NeonTemporalClient:
    """
    Neon Temporal Client.

    Provides a type-safe interface for interacting with Neon's Temporal workflows.

    Example:
        ```python
        from neon_sdk.temporal import NeonTemporalClient, TemporalClientConfig

        client = NeonTemporalClient()
        await client.connect()

        # Start an agent run
        result = await client.start_agent_run(StartAgentRunInput(
            project_id="proj-123",
            agent_id="agent-456",
            agent_version="1.0.0",
            input_data={"query": "Hello, world!"},
        ))

        # Check status
        status = await client.get_agent_status(result["workflow_id"])
        print(status)

        await client.disconnect()
        ```
    """

    def __init__(self, config: TemporalClientConfig | None = None) -> None:
        self._config = config or TemporalClientConfig()
        self._client: Client | None = None

    async def connect(self) -> None:
        """Connect to Temporal server."""
        if self._client:
            return

        self._client = await Client.connect(
            self._config.address,
            namespace=self._config.namespace,
        )

    async def disconnect(self) -> None:
        """Disconnect from Temporal server."""
        # Note: temporalio Client doesn't have explicit close, but we clear reference
        self._client = None

    def _get_client(self) -> Client:
        """Get the Temporal client, raising if not connected."""
        if not self._client:
            raise RuntimeError("Not connected. Call connect() first.")
        return self._client

    # ==================== Agent Workflows ====================

    async def start_agent_run(
        self, input_data: StartAgentRunInput
    ) -> dict[str, str]:
        """
        Start an agent run workflow.

        Returns:
            Dict with workflow_id and run_id
        """
        client = self._get_client()
        workflow_id = f"agent-{input_data.project_id}-{int(datetime.now().timestamp() * 1000)}"

        handle = await client.start_workflow(
            "agentRunWorkflow",
            {
                "projectId": input_data.project_id,
                "agentId": input_data.agent_id,
                "agentVersion": input_data.agent_version,
                "input": input_data.input_data,
                "tools": input_data.tools or [],
                "metadata": input_data.metadata or {},
            },
            id=workflow_id,
            task_queue=self._config.task_queue,
        )

        return {
            "workflow_id": handle.id,
            "run_id": handle.result_run_id or "",
        }

    def get_agent_handle(self, workflow_id: str) -> WorkflowHandle[Any, Any]:
        """Get a workflow handle for an agent run."""
        return self._get_client().get_workflow_handle(workflow_id)

    async def get_agent_status(self, workflow_id: str) -> AgentStatus:
        """Get agent run status."""
        handle = self.get_agent_handle(workflow_id)
        result = await handle.query("status")
        return AgentStatus(
            status=result.get("status", "unknown"),
            started_at=result.get("startedAt"),
            completed_at=result.get("completedAt"),
            error=result.get("error"),
        )

    async def get_agent_progress(self, workflow_id: str) -> AgentProgress:
        """Get agent run progress."""
        handle = self.get_agent_handle(workflow_id)
        result = await handle.query("progress")
        return AgentProgress(
            current_step=result.get("currentStep", 0),
            total_steps=result.get("totalSteps"),
            current_action=result.get("currentAction"),
            messages=result.get("messages", []),
        )

    async def approve_agent(
        self, workflow_id: str, approved: bool, reason: str | None = None
    ) -> None:
        """Send approval signal to agent workflow."""
        handle = self.get_agent_handle(workflow_id)
        await handle.signal("approval", approved, reason)

    async def cancel_agent(self, workflow_id: str) -> None:
        """Cancel an agent run."""
        handle = self.get_agent_handle(workflow_id)
        await handle.signal("cancel")

    async def wait_for_agent_result(self, workflow_id: str) -> dict[str, Any]:
        """Wait for agent run to complete and return result."""
        handle = self.get_agent_handle(workflow_id)
        return await handle.result()

    # ==================== Evaluation Workflows ====================

    async def start_eval_run(self, input_data: StartEvalRunInput) -> dict[str, str]:
        """
        Start an evaluation run workflow.

        Returns:
            Dict with workflow_id and run_id
        """
        client = self._get_client()
        workflow_id = f"eval-{input_data.run_id}"

        handle = await client.start_workflow(
            "evalRunWorkflow",
            {
                "runId": input_data.run_id,
                "projectId": input_data.project_id,
                "agentId": input_data.agent_id,
                "agentVersion": input_data.agent_version,
                "dataset": input_data.dataset,
                "tools": input_data.tools,
                "scorers": input_data.scorers,
            },
            id=workflow_id,
            task_queue=self._config.task_queue,
        )

        return {
            "workflow_id": handle.id,
            "run_id": handle.result_run_id or "",
        }

    def get_eval_handle(self, workflow_id: str) -> WorkflowHandle[Any, Any]:
        """Get a workflow handle for an eval run."""
        return self._get_client().get_workflow_handle(workflow_id)

    async def get_eval_progress(self, workflow_id: str) -> EvalProgress:
        """Get evaluation run progress."""
        handle = self.get_eval_handle(workflow_id)
        result = await handle.query("progress")
        return EvalProgress(
            completed=result.get("completed", 0),
            total=result.get("total", 0),
        )

    async def wait_for_eval_result(self, workflow_id: str) -> dict[str, Any]:
        """Wait for evaluation run to complete and return result."""
        handle = self.get_eval_handle(workflow_id)
        return await handle.result()

    # ==================== Generic Workflow Methods ====================

    async def get_workflow_status(self, workflow_id: str) -> WorkflowInfo:
        """Get workflow status and metadata."""
        handle = self._get_client().get_workflow_handle(workflow_id)
        desc = await handle.describe()

        return WorkflowInfo(
            workflow_id=desc.id,
            run_id=desc.run_id or "",
            status=desc.status.name if desc.status else "UNKNOWN",
            start_time=desc.start_time,
            close_time=desc.close_time,
            memo=dict(desc.memo) if desc.memo else None,
        )

    async def list_workflows(
        self, query: str | None = None
    ) -> list[dict[str, str]]:
        """List workflows matching the query."""
        client = self._get_client()
        workflows: list[dict[str, str]] = []

        async for workflow in client.list_workflows(query=query or ""):
            workflows.append({
                "workflow_id": workflow.id,
                "run_id": workflow.run_id or "",
                "status": workflow.status.name if workflow.status else "UNKNOWN",
            })

        return workflows

    async def terminate_workflow(
        self, workflow_id: str, reason: str | None = None
    ) -> None:
        """Terminate a workflow."""
        handle = self._get_client().get_workflow_handle(workflow_id)
        await handle.terminate(reason=reason)


# =============================================================================
# Convenience Functions
# =============================================================================


def create_temporal_client(
    config: TemporalClientConfig | None = None,
) -> NeonTemporalClient:
    """Create a new Temporal client instance."""
    return NeonTemporalClient(config)


# Singleton for convenience
_default_client: NeonTemporalClient | None = None


async def get_temporal_client() -> NeonTemporalClient:
    """Get the default Temporal client instance (singleton)."""
    global _default_client
    if _default_client is None:
        _default_client = NeonTemporalClient()
        await _default_client.connect()
    return _default_client


__all__ = [
    "TemporalClientConfig",
    "StartAgentRunInput",
    "AgentProgress",
    "AgentStatus",
    "WorkflowInfo",
    "StartEvalRunInput",
    "EvalProgress",
    "NeonTemporalClient",
    "create_temporal_client",
    "get_temporal_client",
]
