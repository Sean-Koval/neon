/**
 * Analytics Router
 *
 * tRPC procedures for analytics queries.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";

const MOOSE_API_URL = process.env.MOOSE_API_URL || "http://localhost:4000";

/**
 * Time range input
 */
const timeRangeInput = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

/**
 * Analytics router
 */
export const analyticsRouter = router({
  /**
   * Get daily statistics
   */
  dailyStats: publicProcedure.input(timeRangeInput).query(async ({ ctx, input }) => {
    const params = new URLSearchParams({
      project_id: ctx.projectId,
      start_date: input.startDate,
      end_date: input.endDate,
    });

    const response = await fetch(
      `${MOOSE_API_URL}/api/analytics/daily-stats?${params}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${await response.text()}`);
    }

    return response.json();
  }),

  /**
   * Get score trends
   */
  scoreTrends: publicProcedure
    .input(
      timeRangeInput.extend({
        name: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        start_date: input.startDate,
        end_date: input.endDate,
      });

      if (input.name) params.set("name", input.name);

      const response = await fetch(
        `${MOOSE_API_URL}/api/analytics/score-trends?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch trends: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Get model usage statistics
   */
  modelUsage: publicProcedure
    .input(
      timeRangeInput.extend({
        model: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        start_date: input.startDate,
        end_date: input.endDate,
      });

      if (input.model) params.set("model", input.model);

      const response = await fetch(
        `${MOOSE_API_URL}/api/analytics/model-usage?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch usage: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Get tool usage statistics
   */
  toolUsage: publicProcedure
    .input(
      timeRangeInput.extend({
        toolName: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        start_date: input.startDate,
        end_date: input.endDate,
      });

      if (input.toolName) params.set("tool_name", input.toolName);

      const response = await fetch(
        `${MOOSE_API_URL}/api/analytics/tool-usage?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch usage: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Get dashboard summary
   */
  summary: publicProcedure.input(timeRangeInput).query(async ({ ctx, input }) => {
    const params = new URLSearchParams({
      project_id: ctx.projectId,
      start_date: input.startDate,
      end_date: input.endDate,
    });

    const response = await fetch(
      `${MOOSE_API_URL}/api/analytics/summary?${params}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch summary: ${await response.text()}`);
    }

    return response.json();
  }),

  /**
   * Get cost breakdown by model
   */
  costBreakdown: publicProcedure
    .input(timeRangeInput)
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        start_date: input.startDate,
        end_date: input.endDate,
      });

      const response = await fetch(
        `${MOOSE_API_URL}/api/analytics/cost-breakdown?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch costs: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Get latency percentiles
   */
  latency: publicProcedure
    .input(
      timeRangeInput.extend({
        spanType: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        start_date: input.startDate,
        end_date: input.endDate,
      });

      if (input.spanType) params.set("span_type", input.spanType);

      const response = await fetch(
        `${MOOSE_API_URL}/api/analytics/latency?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch latency: ${await response.text()}`);
      }

      return response.json();
    }),
});
