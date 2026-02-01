/**
 * @neon/temporal-client
 *
 * Temporal client wrapper for the Neon platform.
 * Provides type-safe access to workflows and queries.
 */

import {
  Client,
  Connection,
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";
import type {
  AgentRunResult,
  AgentProgress,
  AgentStatus,
  StartAgentRunInput,
  EvalRunResult,
  WorkflowStatus,
} from "@neon/shared";

/**
 * Temporal client configuration
 */
export interface TemporalClientConfig {
  address?: string;
  namespace?: string;
  taskQueue?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<TemporalClientConfig> = {
  address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  namespace: process.env.TEMPORAL_NAMESPACE || "default",
  taskQueue: process.env.TEMPORAL_TASK_QUEUE || "agent-workers",
};

/**
 * Neon Temporal Client
 *
 * Provides a type-safe interface for interacting with Neon's Temporal workflows.
 */
export class NeonTemporalClient {
  private client: WorkflowClient | null = null;
  private connection: Connection | null = null;
  private config: Required<TemporalClientConfig>;

  constructor(config: TemporalClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Connect to Temporal server
   */
  async connect(): Promise<void> {
    if (this.client) return;

    this.connection = await Connection.connect({
      address: this.config.address,
    });

    this.client = new WorkflowClient({
      connection: this.connection,
      namespace: this.config.namespace,
    });
  }

  /**
   * Disconnect from Temporal server
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.client = null;
    }
  }

  /**
   * Get the workflow client
   */
  private getClient(): WorkflowClient {
    if (!this.client) {
      throw new Error("Not connected. Call connect() first.");
    }
    return this.client;
  }

  // ==================== Agent Workflows ====================

  /**
   * Start an agent run workflow
   */
  async startAgentRun(input: StartAgentRunInput): Promise<{
    workflowId: string;
    runId: string;
  }> {
    const client = this.getClient();
    const workflowId = `agent-${input.projectId}-${Date.now()}`;

    const handle = await client.start("agentRunWorkflow", {
      workflowId,
      taskQueue: this.config.taskQueue,
      args: [input],
    });

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    };
  }

  /**
   * Get agent run handle
   * Note: Returns untyped handle since we don't have the workflow type at runtime
   */
  getAgentRunHandle(workflowId: string): WorkflowHandle {
    return this.getClient().getHandle(workflowId);
  }

  /**
   * Get agent run status
   */
  async getAgentStatus(workflowId: string): Promise<AgentStatus> {
    const handle = this.getAgentRunHandle(workflowId);
    return handle.query<AgentStatus>("status");
  }

  /**
   * Get agent run progress
   */
  async getAgentProgress(workflowId: string): Promise<AgentProgress> {
    const handle = this.getAgentRunHandle(workflowId);
    return handle.query<AgentProgress>("progress");
  }

  /**
   * Send approval signal to agent
   */
  async approveAgent(
    workflowId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    const handle = this.getAgentRunHandle(workflowId);
    await handle.signal("approval", approved, reason);
  }

  /**
   * Cancel an agent run
   */
  async cancelAgent(workflowId: string): Promise<void> {
    const handle = this.getAgentRunHandle(workflowId);
    await handle.signal("cancel");
  }

  /**
   * Wait for agent run result
   */
  async waitForAgentResult(workflowId: string): Promise<AgentRunResult> {
    const handle = this.getAgentRunHandle(workflowId);
    return handle.result() as Promise<AgentRunResult>;
  }

  // ==================== Evaluation Workflows ====================

  /**
   * Start an evaluation run workflow
   */
  async startEvalRun(input: {
    runId: string;
    projectId: string;
    agentId: string;
    agentVersion: string;
    dataset: { items: Array<{ input: Record<string, unknown>; expected?: Record<string, unknown> }> };
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    scorers: string[];
  }): Promise<{
    workflowId: string;
    runId: string;
  }> {
    const client = this.getClient();
    const workflowId = `eval-${input.runId}`;

    const handle = await client.start("evalRunWorkflow", {
      workflowId,
      taskQueue: this.config.taskQueue,
      args: [input],
    });

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    };
  }

  /**
   * Get eval run handle
   * Note: Returns untyped handle since we don't have the workflow type at runtime
   */
  getEvalRunHandle(workflowId: string): WorkflowHandle {
    return this.getClient().getHandle(workflowId);
  }

  /**
   * Get eval run progress
   */
  async getEvalProgress(workflowId: string): Promise<{
    completed: number;
    total: number;
  }> {
    const handle = this.getEvalRunHandle(workflowId);
    return handle.query<{ completed: number; total: number }>("progress");
  }

  /**
   * Wait for eval run result
   */
  async waitForEvalResult(workflowId: string): Promise<EvalRunResult> {
    const handle = this.getEvalRunHandle(workflowId);
    return handle.result() as Promise<EvalRunResult>;
  }

  // ==================== A/B Test Workflows ====================

  /**
   * Start an A/B test workflow
   */
  async startABTest(input: {
    experimentId: string;
    projectId: string;
    variantA: {
      agentId: string;
      agentVersion: string;
      tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    };
    variantB: {
      agentId: string;
      agentVersion: string;
      tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    };
    dataset: { items: Array<{ input: Record<string, unknown>; expected?: Record<string, unknown> }> };
    scorers: string[];
    significanceThreshold?: number;
  }): Promise<{
    workflowId: string;
    runId: string;
  }> {
    const client = this.getClient();
    const workflowId = `experiment-${input.experimentId}`;

    const handle = await client.start("abTestWorkflow", {
      workflowId,
      taskQueue: this.config.taskQueue,
      args: [input],
    });

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    };
  }

  // ==================== Generic Workflow Methods ====================

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
    const handle = this.getClient().getHandle(workflowId);
    const description = await handle.describe();

    return {
      workflowId: description.workflowId,
      runId: description.runId,
      status: description.status.name as WorkflowStatus["status"],
      startTime: description.startTime,
      closeTime: description.closeTime,
      memo: description.memo,
    };
  }

  /**
   * List workflows
   */
  async listWorkflows(
    query?: string
  ): Promise<Array<{ workflowId: string; runId: string; status: string }>> {
    const client = this.getClient();
    const workflows: Array<{ workflowId: string; runId: string; status: string }> = [];

    for await (const workflow of client.list({ query })) {
      workflows.push({
        workflowId: workflow.workflowId,
        runId: workflow.runId,
        status: workflow.status.name,
      });
    }

    return workflows;
  }

  /**
   * Terminate a workflow
   */
  async terminateWorkflow(workflowId: string, reason?: string): Promise<void> {
    const handle = this.getClient().getHandle(workflowId);
    await handle.terminate(reason);
  }
}

/**
 * Create a new Temporal client instance
 */
export function createTemporalClient(
  config?: TemporalClientConfig
): NeonTemporalClient {
  return new NeonTemporalClient(config);
}

/**
 * Singleton instance for convenience
 */
let defaultClient: NeonTemporalClient | null = null;

/**
 * Get the default Temporal client instance
 */
export async function getTemporalClient(): Promise<NeonTemporalClient> {
  if (!defaultClient) {
    defaultClient = new NeonTemporalClient();
    await defaultClient.connect();
  }
  return defaultClient;
}

export { temporal } from "./temporal";
