/**
 * Training Loops Router
 *
 * tRPC procedures for managing training loop workflows.
 * Connects to real Temporal workflows with graceful degradation
 * to seed data when Temporal is unavailable.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { logger } from "@/lib/logger";
import {
  startTrainingLoopWorkflow,
  getTrainingLoopStatus,
  signalTrainingLoop,
  listTrainingLoops,
  getWorkflowStatus,
  type TrainingLoopStatus,
} from "@/lib/temporal";

// =============================================================================
// Types
// =============================================================================

export type LoopStage = "collecting" | "curating" | "optimizing" | "evaluating" | "deploying" | "monitoring";
export type LoopStatus = "running" | "paused" | "awaiting_approval" | "completed" | "failed" | "aborted";

export interface StageInfo {
  stage: LoopStage;
  status: "completed" | "running" | "pending" | "failed" | "awaiting_approval";
  metrics: Record<string, number | string>;
  durationMs?: number;
}

export interface TrainingLoop {
  id: string;
  agentId: string;
  agentName: string;
  strategy: "coordinate_ascent" | "example_selection" | "reflection";
  trigger: "manual" | "regression" | "signal";
  status: LoopStatus;
  currentStage: LoopStage;
  currentIteration: number;
  maxIterations: number;
  stages: StageInfo[];
  baselineScore: number;
  currentScore: number;
  improvementThreshold: number;
  autoApproveThreshold: number;
  evalSuiteId?: string;
  monitoringPeriod: string;
  createdAt: string;
  approvalData?: {
    scoreBefore: number;
    scoreAfter: number;
    threshold: number;
    improvementDelta: number;
    changes: string[];
    stageRequiringApproval: string;
  };
}

export interface IterationHistory {
  id: string;
  loopId: string;
  iteration: number;
  agentId: string;
  agentName: string;
  strategy: string;
  scoreDelta: number;
  outcome: "deployed" | "rejected" | "skipped" | "aborted" | "failed";
  agentVersion: string;
  startedAt: string;
  durationMs: number;
  stageMetrics: StageInfo[];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if an error is a Temporal connectivity issue
 */
function isTemporalUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("UNAVAILABLE") ||
    msg.includes("connect") ||
    msg.includes("deadline") ||
    msg.includes("timeout") ||
    msg.includes("Not connected")
  );
}

/**
 * Map Temporal workflow status to our LoopStatus
 */
function mapWorkflowStatus(temporalStatus: string, loopStatus: TrainingLoopStatus): LoopStatus {
  if (loopStatus.isPaused) return "paused";
  if (loopStatus.stage === "evaluating" && loopStatus.history.some(
    (h) => h.stage === "evaluating" && h.status === "failed",
  )) {
    return "awaiting_approval";
  }
  switch (temporalStatus) {
    case "RUNNING":
      return "running";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "CANCELLED":
    case "TERMINATED":
      return "aborted";
    default:
      return "running";
  }
}

/**
 * Convert Temporal workflow + query status into our TrainingLoop shape
 */
function toTrainingLoop(
  workflowId: string,
  temporalStatus: string,
  loopStatus: TrainingLoopStatus,
  startTime: string,
): TrainingLoop {
  const stages: StageInfo[] = (
    ["collecting", "curating", "optimizing", "evaluating", "deploying", "monitoring"] as LoopStage[]
  ).map((stage) => {
    const historyEntry = loopStatus.history.find((h) => h.stage === stage);
    if (historyEntry) {
      return {
        stage,
        status: historyEntry.status === "skipped" ? "completed" as const : historyEntry.status,
        metrics: Object.fromEntries(
          Object.entries(historyEntry.metrics).map(([k, v]) => [k, v]),
        ),
        durationMs: historyEntry.durationMs,
      };
    }
    if ((stage as string) === loopStatus.stage) {
      return { stage, status: "running" as const, metrics: { ...loopStatus.metrics } };
    }
    return { stage, status: "pending" as const, metrics: {} };
  });

  const evalScore = loopStatus.metrics.evalScore ?? 0;
  const baselineScore = loopStatus.metrics.baselineScore ?? 0;

  return {
    id: workflowId,
    agentId: workflowId,
    agentName: workflowId,
    strategy: "coordinate_ascent",
    trigger: "manual",
    status: mapWorkflowStatus(temporalStatus, loopStatus),
    currentStage: loopStatus.stage === "idle" ? "collecting" : loopStatus.stage as LoopStage,
    currentIteration: loopStatus.currentIteration,
    maxIterations: loopStatus.maxIterations,
    stages,
    baselineScore,
    currentScore: evalScore || baselineScore,
    improvementThreshold: 2,
    autoApproveThreshold: 5,
    monitoringPeriod: "24h",
    createdAt: startTime,
  };
}

// =============================================================================
// Seed data for graceful degradation
// =============================================================================

function getSeedLoops(): TrainingLoop[] {
  const stages: StageInfo[] = [
    { stage: "collecting", status: "completed", metrics: { feedbackCount: 142, timeRange: "7d", sources: "98 prefs · 44 corrections" }, durationMs: 12000 },
    { stage: "curating", status: "completed", metrics: { datasetSize: 1240, qualityScore: 0.91, sourceBreakdown: "62% corrections · 28% prefs · 10% traces" }, durationMs: 45000 },
    { stage: "optimizing", status: "running", metrics: { strategy: "coordinate_ascent", iteration: "2 of 3", currentBest: "+2.1%", changesAttempted: "System prompt rewrite, temperature" }, durationMs: 0 },
    { stage: "evaluating", status: "pending", metrics: {} },
    { stage: "deploying", status: "pending", metrics: {} },
    { stage: "monitoring", status: "pending", metrics: {} },
  ];

  const approvalStages: StageInfo[] = [
    { stage: "collecting", status: "completed", metrics: { feedbackCount: 89, timeRange: "14d" }, durationMs: 8000 },
    { stage: "curating", status: "completed", metrics: { datasetSize: 560, qualityScore: 0.88 }, durationMs: 30000 },
    { stage: "optimizing", status: "completed", metrics: { strategy: "reflection", iteration: "1 of 3", currentBest: "+3.4%" }, durationMs: 120000 },
    { stage: "evaluating", status: "awaiting_approval", metrics: { evalScore: 0.94, baselineScore: 0.91, passRate: "96%", verdict: "Marginal → Human review" } },
    { stage: "deploying", status: "pending", metrics: {} },
    { stage: "monitoring", status: "pending", metrics: {} },
  ];

  return [
    {
      id: "loop-booking-1",
      agentId: "booking-agent",
      agentName: "booking-agent",
      strategy: "coordinate_ascent",
      trigger: "manual",
      status: "running",
      currentStage: "optimizing",
      currentIteration: 3,
      maxIterations: 5,
      stages,
      baselineScore: 0.87,
      currentScore: 0.89,
      improvementThreshold: 2,
      autoApproveThreshold: 5,
      evalSuiteId: "suite-booking-v2",
      monitoringPeriod: "24h",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "loop-search-1",
      agentId: "search-agent",
      agentName: "search-agent",
      strategy: "reflection",
      trigger: "manual",
      status: "awaiting_approval",
      currentStage: "evaluating",
      currentIteration: 1,
      maxIterations: 3,
      stages: approvalStages,
      baselineScore: 0.91,
      currentScore: 0.94,
      improvementThreshold: 2,
      autoApproveThreshold: 5,
      evalSuiteId: "suite-search-v1",
      monitoringPeriod: "24h",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      approvalData: {
        scoreBefore: 0.91,
        scoreAfter: 0.94,
        threshold: 0.85,
        improvementDelta: 3.3,
        changes: [
          "System prompt: \"Be more specific about search result ranking\"",
          "Temperature: 0.7 → 0.6",
          "Examples added: 8 new few-shot examples",
        ],
        stageRequiringApproval: "DEPLOYING",
      },
    },
  ];
}

function getSeedIterationHistory(): IterationHistory[] {
  return [
    {
      id: "iter-1", loopId: "loop-prev-1", iteration: 1, agentId: "booking-agent", agentName: "booking-agent",
      strategy: "coordinate_ascent", scoreDelta: 3.2, outcome: "deployed", agentVersion: "v2.3",
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), durationMs: 754000,
      stageMetrics: [],
    },
    {
      id: "iter-2", loopId: "loop-prev-2", iteration: 1, agentId: "search-agent", agentName: "search-agent",
      strategy: "reflection", scoreDelta: 1.8, outcome: "deployed", agentVersion: "v1.5",
      startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), durationMs: 912000,
      stageMetrics: [],
    },
    {
      id: "iter-3", loopId: "loop-prev-3", iteration: 2, agentId: "booking-agent", agentName: "booking-agent",
      strategy: "example_selection", scoreDelta: -0.4, outcome: "rejected", agentVersion: "v2.4",
      startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), durationMs: 432000,
      stageMetrics: [],
    },
    {
      id: "iter-4", loopId: "loop-prev-4", iteration: 1, agentId: "support-agent", agentName: "support-agent",
      strategy: "coordinate_ascent", scoreDelta: 0.3, outcome: "skipped", agentVersion: "v1.1",
      startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), durationMs: 623000,
      stageMetrics: [],
    },
    {
      id: "iter-5", loopId: "loop-prev-5", iteration: 1, agentId: "booking-agent", agentName: "booking-agent",
      strategy: "reflection", scoreDelta: 5.1, outcome: "deployed", agentVersion: "v2.2",
      startedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), durationMs: 1120000,
      stageMetrics: [],
    },
  ];
}

// =============================================================================
// Router
// =============================================================================

export const trainingLoopsRouter = router({
  list: publicProcedure
    .input(z.object({ agentId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const result = await listTrainingLoops({ limit: 50 });

        const loops: TrainingLoop[] = [];
        for (const wf of result.items) {
          try {
            const loopStatus = await getTrainingLoopStatus(wf.workflowId);
            loops.push(toTrainingLoop(wf.workflowId, wf.status, loopStatus, wf.startTime));
          } catch {
            // If we can't query a specific workflow, include it with minimal info
            loops.push({
              id: wf.workflowId,
              agentId: wf.workflowId,
              agentName: wf.workflowId,
              strategy: "coordinate_ascent",
              trigger: "manual",
              status: wf.status === "RUNNING" ? "running" : wf.status === "COMPLETED" ? "completed" : "failed",
              currentStage: "collecting",
              currentIteration: 0,
              maxIterations: 3,
              stages: [],
              baselineScore: 0,
              currentScore: 0,
              improvementThreshold: 2,
              autoApproveThreshold: 5,
              monitoringPeriod: "24h",
              createdAt: wf.startTime,
            });
          }
        }

        if (input?.agentId) {
          const filtered = loops.filter((l) => l.agentId === input.agentId);
          return { loops: filtered, total: filtered.length };
        }

        loops.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return { loops, total: loops.length };
      } catch (error) {
        if (isTemporalUnavailable(error)) {
          logger.warn("Temporal unavailable, returning seed data for training loops list");
          let items = getSeedLoops();
          if (input?.agentId) {
            items = items.filter((l) => l.agentId === input.agentId);
          }
          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return { loops: items, total: items.length };
        }
        throw error;
      }
    }),

  getStatus: publicProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      try {
        const [wfStatus, loopStatus] = await Promise.all([
          getWorkflowStatus(input.workflowId),
          getTrainingLoopStatus(input.workflowId),
        ]);
        return toTrainingLoop(input.workflowId, wfStatus.status, loopStatus, wfStatus.startTime);
      } catch (error) {
        if (isTemporalUnavailable(error)) {
          logger.warn({ workflowId: input.workflowId }, "Temporal unavailable, checking seed data");
          const seed = getSeedLoops().find((l) => l.id === input.workflowId);
          if (seed) return seed;
        }
        throw new TRPCError({ code: "NOT_FOUND", message: "Training loop not found" });
      }
    }),

  signal: publicProcedure
    .input(
      z.object({
        workflowId: z.string(),
        signal: z.enum(["pause", "resume", "abort", "approve", "reject", "skipStage"]),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        await signalTrainingLoop(input.workflowId, input.signal);
        logger.info({ workflowId: input.workflowId, signal: input.signal }, "Signal sent to training loop");
        return { success: true, status: input.signal === "pause" ? "paused" : "running" };
      } catch (error) {
        if (isTemporalUnavailable(error)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Temporal service unavailable. Cannot send signal to training loop.",
          });
        }
        logger.error({ err: error, workflowId: input.workflowId }, "Failed to signal training loop");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send signal" });
      }
    }),

  start: publicProcedure
    .input(
      z.object({
        agentId: z.string(),
        strategy: z.enum(["coordinate_ascent", "example_selection", "reflection"]),
        trigger: z.enum(["manual", "regression", "signal"]).default("manual"),
        maxIterations: z.number().min(1).max(10).default(3),
        improvementThreshold: z.number().min(0).max(100).default(2),
        autoApproveThreshold: z.number().min(0).max(100).default(5),
        evalSuiteId: z.string().optional(),
        monitoringPeriod: z.enum(["6h", "12h", "24h", "48h", "72h"]).default("24h"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Map trigger values to Temporal workflow input format
        const triggerMap: Record<string, "manual" | "regression" | "signal_threshold"> = {
          manual: "manual",
          regression: "regression",
          signal: "signal_threshold",
        };

        const result = await startTrainingLoopWorkflow({
          projectId: input.agentId,
          suiteId: input.evalSuiteId || `suite-${input.agentId}`,
          promptId: input.agentId,
          strategy: input.strategy,
          trigger: triggerMap[input.trigger],
          maxIterations: input.maxIterations,
          improvementThreshold: input.improvementThreshold / 100,
        });

        logger.info({ workflowId: result.workflowId, agentId: input.agentId, strategy: input.strategy }, "Training loop started");

        return {
          id: result.workflowId,
          loop: {
            id: result.workflowId,
            agentId: input.agentId,
            agentName: input.agentId,
            strategy: input.strategy,
            trigger: input.trigger,
            status: "running" as LoopStatus,
            currentStage: "collecting" as LoopStage,
            currentIteration: 1,
            maxIterations: input.maxIterations,
            stages: [
              { stage: "collecting" as LoopStage, status: "running" as const, metrics: {} },
              { stage: "curating" as LoopStage, status: "pending" as const, metrics: {} },
              { stage: "optimizing" as LoopStage, status: "pending" as const, metrics: {} },
              { stage: "evaluating" as LoopStage, status: "pending" as const, metrics: {} },
              { stage: "deploying" as LoopStage, status: "pending" as const, metrics: {} },
              { stage: "monitoring" as LoopStage, status: "pending" as const, metrics: {} },
            ],
            baselineScore: 0,
            currentScore: 0,
            improvementThreshold: input.improvementThreshold,
            autoApproveThreshold: input.autoApproveThreshold,
            evalSuiteId: input.evalSuiteId,
            monitoringPeriod: input.monitoringPeriod,
            createdAt: new Date().toISOString(),
          } satisfies TrainingLoop,
        };
      } catch (error) {
        if (isTemporalUnavailable(error)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Temporal service unavailable. Cannot start training loop.",
          });
        }
        logger.error({ err: error }, "Failed to start training loop");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to start training loop" });
      }
    }),

  iterationHistory: publicProcedure
    .input(
      z.object({
        agentId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().default(0),
      }).optional(),
    )
    .query(async ({ input }) => {
      // Iteration history comes from seed data / ClickHouse (not Temporal queries)
      // TODO: Wire to ClickHouse when recordLoopIteration activity persists there
      let items = getSeedIterationHistory();
      if (input?.agentId) {
        items = items.filter((i) => i.agentId === input.agentId);
      }
      items.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      const total = items.length;
      const limit = input?.limit ?? 10;
      const offset = input?.offset ?? 0;
      items = items.slice(offset, offset + limit);
      return { iterations: items, total };
    }),

  pendingApprovals: publicProcedure.query(async () => {
    try {
      const result = await listTrainingLoops({ limit: 50, status: "RUNNING" });

      const pending: TrainingLoop[] = [];
      for (const wf of result.items) {
        try {
          const loopStatus = await getTrainingLoopStatus(wf.workflowId);
          const loop = toTrainingLoop(wf.workflowId, wf.status, loopStatus, wf.startTime);
          if (loop.status === "awaiting_approval") {
            pending.push(loop);
          }
        } catch {
          // Skip workflows we can't query
        }
      }

      return { count: pending.length, loops: pending };
    } catch (error) {
      if (isTemporalUnavailable(error)) {
        logger.warn("Temporal unavailable, returning seed data for pending approvals");
        const seed = getSeedLoops().filter((l) => l.status === "awaiting_approval");
        return { count: seed.length, loops: seed };
      }
      throw error;
    }
  }),
});
