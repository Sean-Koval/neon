"use client";

/**
 * Workflow Hooks
 *
 * React hooks for Temporal workflow management.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * Workflow status
 */
export type WorkflowStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TERMINATED"
  | "TIMED_OUT";

/**
 * Workflow summary
 */
export interface WorkflowSummary {
  workflowId: string;
  runId: string;
  status: WorkflowStatus;
  startTime: string;
  closeTime: string | null;
  type: string;
}

/**
 * Workflow progress
 */
export interface WorkflowProgress {
  iteration: number;
  maxIterations: number;
  status: string;
}

/**
 * Hook for listing workflows
 */
export function useWorkflows(options?: {
  status?: WorkflowStatus;
  type?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["workflows", options],
    queryFn: async () => {
      // This would fetch from the Temporal API via our backend
      // For now, return mock data
      const workflows: WorkflowSummary[] = [
        {
          workflowId: "agent-demo-1",
          runId: "run-123",
          status: "RUNNING",
          startTime: new Date(Date.now() - 60000).toISOString(),
          closeTime: null,
          type: "agentRunWorkflow",
        },
        {
          workflowId: "eval-test-1",
          runId: "run-456",
          status: "COMPLETED",
          startTime: new Date(Date.now() - 3600000).toISOString(),
          closeTime: new Date(Date.now() - 3500000).toISOString(),
          type: "evalRunWorkflow",
        },
      ];

      // Filter by status if provided
      if (options?.status) {
        return workflows.filter((w) => w.status === options.status);
      }

      return workflows;
    },
    staleTime: 5000, // 5 seconds
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

/**
 * Hook for getting a single workflow
 */
export function useWorkflow(workflowId: string) {
  return useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      // This would fetch from Temporal
      return {
        workflowId,
        runId: "run-123",
        status: "RUNNING" as WorkflowStatus,
        startTime: new Date().toISOString(),
        closeTime: null,
        type: "agentRunWorkflow",
        memo: {},
      };
    },
    enabled: !!workflowId,
    staleTime: 5000,
    refetchInterval: 5000,
  });
}

/**
 * Hook for getting workflow progress
 */
export function useWorkflowProgress(workflowId: string) {
  return useQuery({
    queryKey: ["workflow", workflowId, "progress"],
    queryFn: async (): Promise<WorkflowProgress> => {
      // This would query the workflow
      return {
        iteration: 3,
        maxIterations: 10,
        status: "running",
      };
    },
    enabled: !!workflowId,
    staleTime: 2000,
    refetchInterval: 3000,
  });
}

/**
 * Hook for starting an agent run
 */
export function useStartAgentRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      agentId: string;
      agentVersion?: string;
      input: Record<string, unknown>;
      maxIterations?: number;
      requireApproval?: boolean;
    }) => {
      const response = await fetch(`${API_URL}/api/workflows/agent-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error("Failed to start agent run");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

/**
 * Hook for starting an evaluation run
 */
export function useStartEvalRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      datasetId?: string;
      traceIds?: string[];
      scoreConfigIds: string[];
      agentId?: string;
      agentVersion?: string;
    }) => {
      const response = await fetch(`${API_URL}/api/workflows/eval-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error("Failed to start eval run");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

/**
 * Hook for approving a workflow
 */
export function useApproveWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      workflowId: string;
      approved: boolean;
      reason?: string;
    }) => {
      const response = await fetch(
        `${API_URL}/api/workflows/${input.workflowId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approved: input.approved,
            reason: input.reason,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send approval");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workflow", variables.workflowId],
      });
    },
  });
}

/**
 * Hook for cancelling a workflow
 */
export function useCancelWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workflowId: string) => {
      const response = await fetch(
        `${API_URL}/api/workflows/${workflowId}/cancel`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to cancel workflow");
      }

      return response.json();
    },
    onSuccess: (_, workflowId) => {
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}
