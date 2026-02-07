/**
 * Dashboard Router
 *
 * tRPC procedures for dashboard aggregation queries.
 * Provides server-side data from ClickHouse materialized views
 * with <100ms query latency.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import {
  type DailyRunSummary,
  type DashboardSummary,
  type DurationStats,
  type ScorerStats,
  type ScoreTrendPoint,
  backfillMaterializedViews,
  getDailyRunSummary,
  getDashboardSummary,
  getDurationStats,
  getScorerStats,
  getScoreTrends,
  getToolMetrics,
} from "@/lib/clickhouse";
import { logger } from "@/lib/logger";

/**
 * Shared date range input schema used by most dashboard queries.
 */
const dateRangeInput = z.object({
  projectId: z.string().default("default"),
  days: z.number().min(1).max(365).default(7),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * Compute start/end dates from input params.
 */
function resolveDateRange(input: {
  days: number;
  startDate?: string;
  endDate?: string;
}): { startDate: string; endDate: string } {
  if (input.startDate && input.endDate) {
    return { startDate: input.startDate, endDate: input.endDate };
  }
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - input.days);
  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

/**
 * Check if an error is a ClickHouse connection error.
 */
function isClickHouseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("ECONNREFUSED") ||
      error.message.includes("connect") ||
      error.message.includes("timeout") ||
      error.message.includes("ETIMEDOUT"))
  );
}

export const dashboardRouter = router({
  /**
   * Full dashboard data - fetches all dashboard widgets in parallel.
   * Maps from: GET /api/dashboard
   */
  summary: publicProcedure
    .input(dateRangeInput.extend({ scorerName: z.string().optional() }))
    .query(async ({ input }) => {
      const startTime = performance.now();

      try {
        const { startDate, endDate } = resolveDateRange(input);

        const [summary, scoreTrends, durationStats, dailySummary, scorerStats] =
          await Promise.all([
            getDashboardSummary(input.projectId, startDate, endDate),
            getScoreTrends(
              input.projectId,
              startDate,
              endDate,
              input.scorerName,
            ),
            getDurationStats(input.projectId, startDate, endDate),
            getDailyRunSummary(input.projectId, startDate, endDate),
            getScorerStats(input.projectId, startDate, endDate),
          ]);

        const queryTimeMs = Math.round(performance.now() - startTime);

        return {
          summary,
          scoreTrends,
          durationStats,
          dailySummary,
          scorerStats,
          queryTimeMs,
        };
      } catch (error) {
        logger.error({ err: error }, "Dashboard tRPC error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch dashboard data",
          cause: error,
        });
      }
    }),

  /**
   * Summary stats only - optimized for fast initial page load.
   * Maps from: GET /api/dashboard/summary
   */
  aggregatedSummary: publicProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const startTime = performance.now();

      try {
        const { startDate, endDate } = resolveDateRange(input);
        const summary = await getDashboardSummary(
          input.projectId,
          startDate,
          endDate,
        );
        const queryTimeMs = Math.round(performance.now() - startTime);

        return { ...summary, queryTimeMs };
      } catch (error) {
        logger.error({ err: error }, "Summary tRPC error");

        if (isClickHouseError(error)) {
          return {
            total_runs: 0,
            passed_runs: 0,
            failed_runs: 0,
            pass_rate: 0,
            avg_duration_ms: 0,
            total_tokens: 0,
            total_cost: 0,
            queryTimeMs: 0,
            warning:
              "ClickHouse not available. Start it to see dashboard stats.",
          };
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch summary",
          cause: error,
        });
      }
    }),

  /**
   * Score trends with avg/min/max per scorer per day.
   * Maps from: GET /api/dashboard/score-trends
   */
  scoreTrends: publicProcedure
    .input(dateRangeInput.extend({ scorerName: z.string().optional() }))
    .query(async ({ input }) => {
      const startTime = performance.now();

      try {
        const { startDate, endDate } = resolveDateRange(input);
        const trends = await getScoreTrends(
          input.projectId,
          startDate,
          endDate,
          input.scorerName,
        );
        const queryTimeMs = Math.round(performance.now() - startTime);

        return { trends, queryTimeMs };
      } catch (error) {
        logger.error({ err: error }, "Score trends tRPC error");

        if (isClickHouseError(error)) {
          return {
            trends: [] as ScoreTrendPoint[],
            queryTimeMs: 0,
            warning:
              "ClickHouse not available. Start it to see score trends.",
          };
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch score trends",
          cause: error,
        });
      }
    }),

  /**
   * Duration statistics with percentiles (p50, p95, p99).
   * Maps from: GET /api/dashboard/duration-stats
   */
  durationStats: publicProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const startTime = performance.now();

      try {
        const { startDate, endDate } = resolveDateRange(input);
        const stats = await getDurationStats(
          input.projectId,
          startDate,
          endDate,
        );
        const queryTimeMs = Math.round(performance.now() - startTime);

        return { stats, queryTimeMs };
      } catch (error) {
        logger.error({ err: error }, "Duration stats tRPC error");

        if (isClickHouseError(error)) {
          return {
            stats: [] as DurationStats[],
            queryTimeMs: 0,
            warning:
              "ClickHouse not available. Start it to see duration stats.",
          };
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch duration stats",
          cause: error,
        });
      }
    }),

  /**
   * Tool/skill execution statistics.
   * Maps from: GET /api/dashboard/tool-metrics
   */
  toolMetrics: publicProcedure
    .input(dateRangeInput)
    .query(async ({ input }) => {
      const startTime = performance.now();

      try {
        const { startDate, endDate } = resolveDateRange(input);
        const { tools, summary } = await getToolMetrics(
          input.projectId,
          startDate,
          endDate,
        );
        const queryTimeMs = Math.round(performance.now() - startTime);

        return { tools, summary, queryTimeMs };
      } catch (error) {
        logger.error({ err: error }, "Tool metrics tRPC error");

        if (isClickHouseError(error)) {
          return {
            tools: [],
            summary: {
              totalCalls: 0,
              totalTools: 0,
              overallSuccessRate: 0,
              avgLatencyMs: 0,
            },
            queryTimeMs: 0,
            warning:
              "ClickHouse not available. Start it to see tool metrics.",
          };
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch tool metrics",
          cause: error,
        });
      }
    }),

  /**
   * Admin-only backfill of materialized views.
   * Maps from: POST /api/dashboard/backfill
   */
  backfill: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        adminKey: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const startTime = performance.now();

      const expectedKey = process.env.ADMIN_API_KEY;
      if (!expectedKey || input.adminKey !== expectedKey) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Unauthorized - admin key required",
        });
      }

      try {
        const results = await backfillMaterializedViews(input.projectId);
        const queryTimeMs = Math.round(performance.now() - startTime);

        return {
          success: true,
          message: "Materialized views backfilled successfully",
          results,
          queryTimeMs,
        };
      } catch (error) {
        logger.error({ err: error }, "Backfill tRPC error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to backfill materialized views",
          cause: error,
        });
      }
    }),
});
