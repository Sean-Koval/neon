/**
 * Experiments Router
 *
 * tRPC procedures for experiment management (A/B tests and progressive rollouts).
 * Wraps Temporal workflow operations for creating, listing, querying, and controlling experiments.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  `http://localhost:${process.env.PORT || 3000}/api`;

/**
 * Experiment types
 */
export type ExperimentType = "ab_test" | "progressive_rollout";
export type ExperimentStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "PAUSED"
  | "CANCELLED";

export interface Experiment {
  id: string;
  name: string;
  type: ExperimentType;
  status: ExperimentStatus;
  agentId: string;
  agentName?: string;
  createdAt: string;
  updatedAt: string;
  config: ABTestConfig | RolloutConfig;
  progress?: ABTestProgress | RolloutProgress;
  result?: ABTestResult | RolloutResult;
}

export interface ABTestConfig {
  variantA: { agentId: string; agentVersion: string; label: string };
  variantB: { agentId: string; agentVersion: string; label: string };
  suiteId: string;
  suiteName?: string;
  scorers: string[];
  sampleSize: number;
  significanceLevel: number;
}

export interface RolloutConfig {
  baseline: { agentId: string; agentVersion: string };
  candidate: { agentId: string; agentVersion: string };
  suiteId: string;
  suiteName?: string;
  scorers: string[];
  stages: Array<{ percentage: number; gateThreshold: number }>;
  stageDurationMs: number;
}

export interface ABTestProgress {
  samplesCollected: number;
  totalSamples: number;
  variantAScore?: number;
  variantBScore?: number;
  variantAComplete: boolean;
  variantBComplete: boolean;
  pValue?: number;
  effectSize?: number;
  elapsedMs: number;
}

export interface RolloutProgress {
  currentStage: number;
  totalStages: number;
  currentPercentage: number;
  currentScore?: number;
  gateThreshold: number;
  scores: number[];
  elapsedMs: number;
}

export interface ABTestResult {
  winner: "A" | "B" | "tie";
  improvement: number;
  confidence: number;
  recommendation: string;
  variantAScore: number;
  variantBScore: number;
  pValue: number;
  effectSize: number;
  perCaseResults?: Array<{
    caseName: string;
    scorer: string;
    scoreA: number;
    scoreB: number;
    delta: number;
    significant: boolean;
  }>;
}

export interface RolloutResult {
  completed: boolean;
  aborted: boolean;
  abortReason?: string;
  finalStage: number;
  finalScore?: number;
  stageResults: Array<{
    stage: number;
    percentage: number;
    score: number;
    passed: boolean;
    durationMs?: number;
  }>;
}

/**
 * Experiments router
 */
export const experimentsRouter = router({
  /**
   * List experiments with optional filtering
   */
  list: publicProcedure
    .input(
      z
        .object({
          type: z.enum(["ab_test", "progressive_rollout"]).optional(),
          status: z
            .enum(["RUNNING", "COMPLETED", "FAILED", "PAUSED", "CANCELLED"])
            .optional(),
          agentId: z.string().optional(),
          limit: z.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
          sort: z
            .enum(["newest", "oldest", "best_improvement", "most_samples"])
            .default("newest"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const params = {
        limit: 20,
        sort: "newest" as const,
        ...input,
      };

      // Query Temporal for experiment workflows
      // Both abTestWorkflow and progressiveRolloutWorkflow
      const workflowTypes: string[] = [];
      if (!params.type || params.type === "ab_test") {
        workflowTypes.push("abTestWorkflow");
      }
      if (!params.type || params.type === "progressive_rollout") {
        workflowTypes.push("progressiveRolloutWorkflow");
      }

      try {
        // Fetch experiments from the API
        const queryParams = new URLSearchParams({
          limit: String(params.limit ?? 20),
        });
        if (params.type) queryParams.set("type", params.type);
        if (params.status) queryParams.set("status", params.status);
        if (params.agentId) queryParams.set("agent_id", params.agentId);
        if (params.cursor) queryParams.set("cursor", params.cursor);
        if (params.sort) queryParams.set("sort", params.sort);

        const response = await fetch(
          `${API_BASE}/experiments?${queryParams}`,
          {
            headers: { "x-project-id": ctx.projectId },
          }
        );

        if (response.ok) {
          const data = await response.json();
          return data as {
            items: Experiment[];
            nextCursor?: string;
            total: number;
          };
        }
      } catch {
        // API not available, fall through to Temporal query
      }

      // Fallback: query Temporal directly for workflow executions
      try {
        const response = await fetch(`${API_BASE}/runs?limit=${params.limit ?? 20}`, {
          headers: { "x-project-id": ctx.projectId },
        });

        if (!response.ok) {
          return { items: [] as Experiment[], nextCursor: undefined, total: 0 };
        }

        const data = await response.json();
        const runs = data.items || [];

        // Transform workflow runs into experiments
        const experiments: Experiment[] = runs
          .filter((run: { workflowId?: string }) => {
            const wfId = run.workflowId || "";
            return (
              wfId.startsWith("experiment-ab-") ||
              wfId.startsWith("experiment-rollout-")
            );
          })
          .map((run: Record<string, unknown>) => mapWorkflowToExperiment(run));

        // Apply client-side filters
        let filtered = experiments;
        if (params.agentId) {
          filtered = filtered.filter((e) => e.agentId === params.agentId);
        }

        // Sort
        filtered = sortExperiments(filtered, params.sort ?? "newest");

        return {
          items: filtered.slice(0, params.limit ?? 20),
          nextCursor: undefined,
          total: filtered.length,
        };
      } catch {
        return { items: [] as Experiment[], nextCursor: undefined, total: 0 };
      }
    }),

  /**
   * Get a single experiment by ID
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const response = await fetch(
          `${API_BASE}/experiments/${input.id}`,
          {
            headers: { "x-project-id": ctx.projectId },
          }
        );

        if (response.ok) {
          return (await response.json()) as Experiment;
        }
      } catch {
        // Fallback
      }

      // Fallback: try to get from runs
      try {
        const response = await fetch(`${API_BASE}/runs/${input.id}`, {
          headers: { "x-project-id": ctx.projectId },
        });

        if (!response.ok) {
          return null;
        }

        const run = await response.json();
        return mapWorkflowToExperiment(run);
      } catch {
        return null;
      }
    }),

  /**
   * Create a new experiment (starts Temporal workflow)
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        type: z.enum(["ab_test", "progressive_rollout"]),
        agentId: z.string(),
        // A/B test config
        abTest: z
          .object({
            variantA: z.object({
              agentId: z.string(),
              agentVersion: z.string(),
              label: z.string().default("Baseline"),
            }),
            variantB: z.object({
              agentId: z.string(),
              agentVersion: z.string(),
              label: z.string().default("Candidate"),
            }),
            suiteId: z.string(),
            scorers: z.array(z.string()),
            sampleSize: z.number().min(10).max(10000).default(100),
            significanceLevel: z.number().min(0.001).max(0.5).default(0.05),
          })
          .optional(),
        // Progressive rollout config
        rollout: z
          .object({
            baseline: z.object({
              agentId: z.string(),
              agentVersion: z.string(),
            }),
            candidate: z.object({
              agentId: z.string(),
              agentVersion: z.string(),
            }),
            suiteId: z.string(),
            scorers: z.array(z.string()),
            stages: z.array(
              z.object({
                percentage: z.number().min(1).max(100),
                gateThreshold: z.number().min(0).max(1),
              })
            ),
            stageDurationMs: z.number().default(300000), // 5 min default
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const experimentId = `experiment-${input.type === "ab_test" ? "ab" : "rollout"}-${crypto.randomUUID().slice(0, 8)}`;

      try {
        // Try to use the experiments API endpoint first
        const response = await fetch(`${API_BASE}/experiments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-project-id": ctx.projectId,
          },
          body: JSON.stringify({
            experimentId,
            name: input.name,
            type: input.type,
            projectId: ctx.projectId,
            config: input.type === "ab_test" ? input.abTest : input.rollout,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data as { experimentId: string; workflowId: string };
        }
      } catch {
        // Fallback to direct workflow start
      }

      // Fallback: start workflow via existing runs API
      if (input.type === "ab_test" && input.abTest) {
        const response = await fetch(`${API_BASE}/runs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-project-id": ctx.projectId,
          },
          body: JSON.stringify({
            projectId: ctx.projectId,
            agentId: input.abTest.variantA.agentId,
            agentVersion: input.abTest.variantA.agentVersion,
            scorers: input.abTest.scorers,
            dataset: { items: [] },
            runId: experimentId,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to start experiment: ${await response.text()}`
          );
        }

        const data = await response.json();
        return {
          experimentId,
          workflowId: data.workflowId || experimentId,
        };
      }

      if (input.type === "progressive_rollout" && input.rollout) {
        const response = await fetch(`${API_BASE}/runs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-project-id": ctx.projectId,
          },
          body: JSON.stringify({
            projectId: ctx.projectId,
            agentId: input.rollout.candidate.agentId,
            agentVersion: input.rollout.candidate.agentVersion,
            scorers: input.rollout.scorers,
            dataset: { items: [] },
            runId: experimentId,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to start experiment: ${await response.text()}`
          );
        }

        const data = await response.json();
        return {
          experimentId,
          workflowId: data.workflowId || experimentId,
        };
      }

      throw new Error("Invalid experiment configuration");
    }),

  /**
   * Pause a running experiment
   */
  pause: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/runs/${input.id}/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify({ action: "pause" }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to pause experiment: ${await response.text()}`
        );
      }

      return response.json();
    }),

  /**
   * Resume a paused experiment
   */
  resume: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/runs/${input.id}/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify({ action: "resume" }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to resume experiment: ${await response.text()}`
        );
      }

      return response.json();
    }),

  /**
   * Abort a running or paused experiment
   */
  abort: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/runs/${input.id}/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify({ action: "cancel" }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to abort experiment: ${await response.text()}`
        );
      }

      return response.json();
    }),

  /**
   * Query experiment progress (uses Temporal queries)
   */
  progress: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const response = await fetch(
          `${API_BASE}/runs/${input.id}/status`,
          {
            headers: { "x-project-id": ctx.projectId },
          }
        );

        if (!response.ok) {
          return null;
        }

        return response.json();
      } catch {
        return null;
      }
    }),
});

// =============================================================================
// Helpers
// =============================================================================

function mapWorkflowToExperiment(run: Record<string, unknown>): Experiment {
  const workflowId = (run.workflowId as string) || (run.id as string) || "";
  const isABTest = workflowId.includes("ab");
  const type: ExperimentType = isABTest ? "ab_test" : "progressive_rollout";

  const status = mapWorkflowStatus(
    (run.status as string) || "RUNNING"
  );

  return {
    id: (run.id as string) || workflowId,
    name: (run.name as string) || workflowId.replace(/^experiment-/, ""),
    type,
    status,
    agentId: (run.agentId as string) || "",
    createdAt: (run.startTime as string) || (run.created_at as string) || new Date().toISOString(),
    updatedAt: (run.closeTime as string) || (run.startTime as string) || new Date().toISOString(),
    config: isABTest
      ? ({
          variantA: {
            agentId: (run.agentId as string) || "",
            agentVersion: (run.agentVersion as string) || "",
            label: "Baseline",
          },
          variantB: {
            agentId: (run.agentId as string) || "",
            agentVersion: "candidate",
            label: "Candidate",
          },
          suiteId: "",
          scorers: [],
          sampleSize: 100,
          significanceLevel: 0.05,
        } satisfies ABTestConfig)
      : ({
          baseline: {
            agentId: (run.agentId as string) || "",
            agentVersion: (run.agentVersion as string) || "",
          },
          candidate: {
            agentId: (run.agentId as string) || "",
            agentVersion: "candidate",
          },
          suiteId: "",
          scorers: [],
          stages: [
            { percentage: 1, gateThreshold: 0.8 },
            { percentage: 5, gateThreshold: 0.8 },
            { percentage: 25, gateThreshold: 0.85 },
            { percentage: 50, gateThreshold: 0.85 },
            { percentage: 100, gateThreshold: 0.9 },
          ],
          stageDurationMs: 300000,
        } satisfies RolloutConfig),
  };
}

function mapWorkflowStatus(status: string): ExperimentStatus {
  switch (status.toUpperCase()) {
    case "RUNNING":
      return "RUNNING";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "PAUSED":
      return "PAUSED";
    case "CANCELLED":
    case "TERMINATED":
    case "TIMED_OUT":
      return "CANCELLED";
    default:
      return "RUNNING";
  }
}

function sortExperiments(
  experiments: Experiment[],
  sort: string
): Experiment[] {
  switch (sort) {
    case "oldest":
      return [...experiments].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    case "newest":
    default:
      return [...experiments].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }
}
