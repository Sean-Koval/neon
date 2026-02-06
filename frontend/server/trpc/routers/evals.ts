/**
 * Evals Router
 *
 * tRPC procedures for evaluation runs, results, and comparisons.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

/**
 * Evals router - wraps existing /api/runs and /api/compare endpoints
 */
export const evalsRouter = router({
  /**
   * List evaluation runs with optional filtering
   */
  listRuns: publicProcedure
    .input(
      z.object({
        suiteId: z.string().optional(),
        status: z
          .enum(["pending", "running", "completed", "failed", "cancelled"])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        limit: String(input.limit),
        offset: String(input.offset),
      });

      if (input.suiteId) params.set("suite_id", input.suiteId);
      if (input.status) params.set("status_filter", input.status);

      const response = await fetch(`${API_BASE}/runs?${params}`, {
        headers: { "x-project-id": ctx.projectId },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch runs: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Get a single evaluation run by ID
   */
  getRun: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/runs/${input.runId}`, {
        headers: { "x-project-id": ctx.projectId },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch run: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Get results for an evaluation run
   */
  getRunResults: publicProcedure
    .input(
      z.object({
        runId: z.string(),
        failedOnly: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams();
      if (input.failedOnly) params.set("failed_only", "true");

      const url = `${API_BASE}/runs/${input.runId}/results${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, {
        headers: { "x-project-id": ctx.projectId },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch results: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Trigger a new evaluation run for a suite
   */
  triggerRun: protectedProcedure
    .input(
      z.object({
        suiteId: z.string(),
        agentVersion: z.string().optional(),
        trigger: z.enum(["manual", "ci", "scheduled"]).default("manual"),
        triggerRef: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(
        `${API_BASE}/runs/suites/${input.suiteId}/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-project-id": ctx.projectId,
          },
          body: JSON.stringify({
            agent_version: input.agentVersion,
            trigger: input.trigger,
            trigger_ref: input.triggerRef,
            config: input.config,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to trigger run: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Cancel a running evaluation
   */
  cancelRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(
        `${API_BASE}/runs/${input.runId}/cancel`,
        {
          method: "POST",
          headers: { "x-project-id": ctx.projectId },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to cancel run: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Compare two evaluation runs for regressions
   */
  compare: publicProcedure
    .input(
      z.object({
        baselineRunId: z.string(),
        candidateRunId: z.string(),
        threshold: z.number().min(0).max(1).default(0.05),
      })
    )
    .query(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify({
          baseline_run_id: input.baselineRunId,
          candidate_run_id: input.candidateRunId,
          threshold: input.threshold,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to compare runs: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Start a workflow-based eval run via Temporal
   */
  startWorkflowRun: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        agentVersion: z.string().optional(),
        dataset: z.object({
          items: z.array(
            z.object({
              input: z.record(z.string(), z.unknown()),
              expected: z.record(z.string(), z.unknown()).optional(),
            })
          ),
        }),
        tools: z
          .array(
            z.object({
              name: z.string(),
              description: z.string(),
              parameters: z.record(z.string(), z.unknown()),
            })
          )
          .optional(),
        scorers: z.array(z.string()),
        parallel: z.boolean().optional(),
        parallelism: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify({
          projectId: ctx.projectId,
          ...input,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to start workflow run: ${await response.text()}`
        );
      }

      return response.json();
    }),

  /**
   * Get workflow run status for polling
   */
  getWorkflowStatus: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      const response = await fetch(
        `${API_BASE}/runs/${input.runId}/status`,
        {
          headers: { "x-project-id": ctx.projectId },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get status: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Control a running workflow (pause/resume/cancel)
   */
  controlWorkflow: protectedProcedure
    .input(
      z.object({
        runId: z.string(),
        action: z.enum(["pause", "resume", "cancel"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(
        `${API_BASE}/runs/${input.runId}/control`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-project-id": ctx.projectId,
          },
          body: JSON.stringify({ action: input.action }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to control workflow: ${await response.text()}`
        );
      }

      return response.json();
    }),
});
