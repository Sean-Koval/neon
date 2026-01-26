/**
 * Temporal namespace export
 *
 * Provides a convenient namespace for Temporal operations.
 */

import { createTemporalClient, NeonTemporalClient } from "./index";

let client: NeonTemporalClient | null = null;

async function getClient(): Promise<NeonTemporalClient> {
  if (!client) {
    client = createTemporalClient();
    await client.connect();
  }
  return client;
}

/**
 * Temporal namespace for workflow operations
 */
export const temporal = {
  /**
   * Workflow operations
   */
  workflow: {
    /**
     * Start a workflow
     */
    async start<T>(
      workflowName: string,
      options: {
        workflowId: string;
        taskQueue: string;
        args: T[];
      }
    ) {
      const c = await getClient();
      // This is a simplified version - the actual implementation
      // would use the underlying Temporal client
      if (workflowName === "agentRunWorkflow") {
        return c.startAgentRun(options.args[0] as Parameters<NeonTemporalClient["startAgentRun"]>[0]);
      }
      if (workflowName === "evalRunWorkflow") {
        return c.startEvalRun(options.args[0] as Parameters<NeonTemporalClient["startEvalRun"]>[0]);
      }
      throw new Error(`Unknown workflow: ${workflowName}`);
    },

    /**
     * Get workflow handle
     */
    async getHandle(workflowId: string) {
      const c = await getClient();
      return {
        async query<T>(queryName: string): Promise<T> {
          if (queryName === "status") {
            return c.getAgentStatus(workflowId) as Promise<T>;
          }
          if (queryName === "progress") {
            return c.getAgentProgress(workflowId) as Promise<T>;
          }
          throw new Error(`Unknown query: ${queryName}`);
        },
        async signal(signalName: string, ...args: unknown[]): Promise<void> {
          if (signalName === "approval") {
            await c.approveAgent(workflowId, args[0] as boolean, args[1] as string);
          } else if (signalName === "cancel") {
            await c.cancelAgent(workflowId);
          }
        },
        async result<T>(): Promise<T> {
          return c.waitForAgentResult(workflowId) as Promise<T>;
        },
        async terminate(reason?: string): Promise<void> {
          await c.terminateWorkflow(workflowId, reason);
        },
      };
    },

    /**
     * List workflows
     */
    async list(query?: string) {
      const c = await getClient();
      return c.listWorkflows(query);
    },
  },

  /**
   * Client operations
   */
  client: {
    /**
     * Connect to Temporal
     */
    async connect() {
      const c = await getClient();
      return c;
    },

    /**
     * Disconnect from Temporal
     */
    async disconnect() {
      if (client) {
        await client.disconnect();
        client = null;
      }
    },
  },
};
