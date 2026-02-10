/**
 * Training Loops Router
 *
 * tRPC procedures for managing training loop workflows.
 * Handles listing, status polling, signal sending, and starting new loops.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import { router, publicProcedure } from "../trpc";
import { logger } from "@/lib/logger";

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
// In-memory stores
// =============================================================================

const loopStore = new Map<string, TrainingLoop>();
const iterationStore: IterationHistory[] = [];

function seedLoops() {
  if (loopStore.size > 0) return;

  const stages: StageInfo[] = [
    { stage: "collecting", status: "completed", metrics: { feedbackCount: 142, timeRange: "7d", sources: "98 prefs · 44 corrections" }, durationMs: 12000 },
    { stage: "curating", status: "completed", metrics: { datasetSize: 1240, qualityScore: 0.91, sourceBreakdown: "62% corrections · 28% prefs · 10% traces" }, durationMs: 45000 },
    { stage: "optimizing", status: "running", metrics: { strategy: "coordinate_ascent", iteration: "2 of 3", currentBest: "+2.1%", changesAttempted: "System prompt rewrite, temperature" }, durationMs: 0 },
    { stage: "evaluating", status: "pending", metrics: {} },
    { stage: "deploying", status: "pending", metrics: {} },
    { stage: "monitoring", status: "pending", metrics: {} },
  ];

  loopStore.set("loop-booking-1", {
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
  });

  // Add a loop awaiting approval
  const approvalStages: StageInfo[] = [
    { stage: "collecting", status: "completed", metrics: { feedbackCount: 89, timeRange: "14d" }, durationMs: 8000 },
    { stage: "curating", status: "completed", metrics: { datasetSize: 560, qualityScore: 0.88 }, durationMs: 30000 },
    { stage: "optimizing", status: "completed", metrics: { strategy: "reflection", iteration: "1 of 3", currentBest: "+3.4%" }, durationMs: 120000 },
    { stage: "evaluating", status: "awaiting_approval", metrics: { evalScore: 0.94, baselineScore: 0.91, passRate: "96%", verdict: "Marginal → Human review" } },
    { stage: "deploying", status: "pending", metrics: {} },
    { stage: "monitoring", status: "pending", metrics: {} },
  ];

  loopStore.set("loop-search-1", {
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
  });

  // Seed iteration history
  const history: IterationHistory[] = [
    {
      id: "iter-1", loopId: "loop-prev-1", iteration: 1, agentId: "booking-agent", agentName: "booking-agent",
      strategy: "coordinate_ascent", scoreDelta: 3.2, outcome: "deployed", agentVersion: "v2.3",
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), durationMs: 754000,
      stageMetrics: stages.map((s) => ({ ...s, status: "completed" as const })),
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
  iterationStore.push(...history);
}

seedLoops();

// =============================================================================
// Router
// =============================================================================

export const trainingLoopsRouter = router({
  list: publicProcedure
    .input(z.object({ agentId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      let items = Array.from(loopStore.values());
      if (input?.agentId) {
        items = items.filter((l) => l.agentId === input.agentId);
      }
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { loops: items, total: items.length };
    }),

  getStatus: publicProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      const loop = loopStore.get(input.workflowId);
      if (!loop) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training loop not found" });
      }
      return loop;
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
      const loop = loopStore.get(input.workflowId);
      if (!loop) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training loop not found" });
      }

      switch (input.signal) {
        case "pause":
          loop.status = "paused";
          break;
        case "resume":
          loop.status = "running";
          break;
        case "abort":
          loop.status = "aborted";
          break;
        case "approve":
          loop.status = "running";
          loop.approvalData = undefined;
          // Advance to deploying stage
          for (const stage of loop.stages) {
            if (stage.status === "awaiting_approval") {
              stage.status = "completed";
            }
          }
          const deployStage = loop.stages.find((s) => s.stage === "deploying");
          if (deployStage) {
            deployStage.status = "running";
            loop.currentStage = "deploying";
          }
          break;
        case "reject":
          loop.status = "running";
          loop.approvalData = undefined;
          // Mark current eval as failed, retry optimization
          for (const stage of loop.stages) {
            if (stage.status === "awaiting_approval") {
              stage.status = "failed";
            }
          }
          break;
        case "skipStage":
          loop.status = "running";
          loop.approvalData = undefined;
          for (const stage of loop.stages) {
            if (stage.status === "awaiting_approval" || stage.status === "running") {
              stage.status = "completed";
            }
          }
          // Advance to next pending stage
          const nextPending = loop.stages.find((s) => s.status === "pending");
          if (nextPending) {
            nextPending.status = "running";
            loop.currentStage = nextPending.stage;
          }
          break;
      }

      loopStore.set(input.workflowId, loop);
      logger.info({ workflowId: input.workflowId, signal: input.signal }, "Signal sent to training loop");
      return { success: true, status: loop.status };
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
      const id = `loop-${uuidv4().slice(0, 8)}`;
      const stages: StageInfo[] = [
        { stage: "collecting", status: "running", metrics: {} },
        { stage: "curating", status: "pending", metrics: {} },
        { stage: "optimizing", status: "pending", metrics: {} },
        { stage: "evaluating", status: "pending", metrics: {} },
        { stage: "deploying", status: "pending", metrics: {} },
        { stage: "monitoring", status: "pending", metrics: {} },
      ];

      const loop: TrainingLoop = {
        id,
        agentId: input.agentId,
        agentName: input.agentId,
        strategy: input.strategy,
        trigger: input.trigger,
        status: "running",
        currentStage: "collecting",
        currentIteration: 1,
        maxIterations: input.maxIterations,
        stages,
        baselineScore: 0,
        currentScore: 0,
        improvementThreshold: input.improvementThreshold,
        autoApproveThreshold: input.autoApproveThreshold,
        evalSuiteId: input.evalSuiteId,
        monitoringPeriod: input.monitoringPeriod,
        createdAt: new Date().toISOString(),
      };

      loopStore.set(id, loop);
      logger.info({ loopId: id, agentId: input.agentId, strategy: input.strategy }, "Training loop started");
      return { id, loop };
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
      let items = [...iterationStore];
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
    const loops = Array.from(loopStore.values());
    const pending = loops.filter((l) => l.status === "awaiting_approval");
    return { count: pending.length, loops: pending };
  }),
});
