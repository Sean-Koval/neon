/**
 * Traces Router
 *
 * tRPC procedures for trace queries.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";

const MOOSE_API_URL = process.env.MOOSE_API_URL || "http://localhost:4000";

/**
 * Trace summary schema
 */
const traceSummarySchema = z.object({
  trace_id: z.string(),
  name: z.string(),
  timestamp: z.string(),
  duration_ms: z.number(),
  status: z.string(),
  total_tokens: z.number(),
  tool_calls: z.number(),
  llm_calls: z.number(),
  agent_id: z.string().nullable(),
  agent_version: z.string().nullable(),
});

/**
 * Span schema
 */
const spanSchema = z.object({
  span_id: z.string(),
  trace_id: z.string(),
  parent_span_id: z.string().nullable(),
  name: z.string(),
  span_type: z.string(),
  timestamp: z.string(),
  end_time: z.string().nullable(),
  duration_ms: z.number(),
  status: z.string(),
  status_message: z.string().optional(),
  model: z.string().nullable(),
  input: z.string().optional(),
  output: z.string().optional(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  total_tokens: z.number().nullable(),
  tool_name: z.string().nullable(),
  tool_input: z.string().optional(),
  tool_output: z.string().optional(),
});

/**
 * Traces router
 */
export const tracesRouter = router({
  /**
   * List traces with filtering
   */
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().default(0),
        status: z.enum(["ok", "error"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        agentId: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        limit: String(input.limit),
        offset: String(input.offset),
      });

      if (input.status) params.set("status", input.status);
      if (input.startDate) params.set("start_date", input.startDate);
      if (input.endDate) params.set("end_date", input.endDate);
      if (input.agentId) params.set("agent_id", input.agentId);
      if (input.search) params.set("search", input.search);

      const response = await fetch(`${MOOSE_API_URL}/api/traces?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch traces: ${await response.text()}`);
      }

      const data = await response.json();
      return z.array(traceSummarySchema).parse(data);
    }),

  /**
   * Get a single trace with spans
   */
  get: publicProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const response = await fetch(
        `${MOOSE_API_URL}/api/traces/${input.traceId}?project_id=${ctx.projectId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch trace: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Search traces
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        query: input.query,
        limit: String(input.limit),
      });

      const response = await fetch(
        `${MOOSE_API_URL}/api/traces/search?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to search traces: ${await response.text()}`);
      }

      const data = await response.json();
      return z.array(traceSummarySchema).parse(data);
    }),

  /**
   * Get aggregate stats for traces (stat cards + sparklines)
   */
  stats: publicProcedure
    .input(
      z.object({
        status: z.enum(["ok", "error"]).optional(),
        agentId: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
      });
      if (input.status) params.set("status", input.status);
      if (input.agentId) params.set("agent_id", input.agentId);
      if (input.startDate) params.set("start_date", input.startDate);
      if (input.endDate) params.set("end_date", input.endDate);

      try {
        const response = await fetch(
          `${MOOSE_API_URL}/api/traces/stats?${params}`
        );
        if (response.ok) {
          return response.json();
        }
      } catch {
        // Fall through to computed stats
      }

      // Fallback: compute stats from the list endpoint
      const listParams = new URLSearchParams({
        project_id: ctx.projectId,
        limit: "200",
        offset: "0",
      });
      if (input.status) listParams.set("status", input.status);
      if (input.agentId) listParams.set("agent_id", input.agentId);
      if (input.startDate) listParams.set("start_date", input.startDate);
      if (input.endDate) listParams.set("end_date", input.endDate);

      const listResponse = await fetch(
        `${MOOSE_API_URL}/api/traces?${listParams}`
      );
      if (!listResponse.ok) {
        return {
          totalTraces: 0,
          errorRate: 0,
          avgDuration: 0,
          avgCost: 0,
          sparklines: { daily: [] },
        };
      }

      const traces = await listResponse.json();
      const list = Array.isArray(traces) ? traces : traces.items || [];

      const total = list.length;
      const errors = list.filter(
        (t: { status: string }) => t.status === "error"
      ).length;
      const avgDuration =
        total > 0
          ? list.reduce(
              (sum: number, t: { duration_ms: number }) =>
                sum + (t.duration_ms || 0),
              0
            ) / total
          : 0;
      const avgCost =
        total > 0
          ? list.reduce(
              (sum: number, t: { total_cost?: number }) =>
                sum + (t.total_cost || 0),
              0
            ) / total
          : 0;

      // Build 7-day sparkline from traces
      const now = new Date();
      const dailyData: Array<{
        date: string;
        count: number;
        errorRate: number;
        avgDuration: number;
        avgCost: number;
      }> = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now);
        day.setDate(day.getDate() - i);
        const dateStr = day.toISOString().split("T")[0];
        const dayTraces = list.filter(
          (t: { timestamp: string }) =>
            t.timestamp && t.timestamp.startsWith(dateStr)
        );
        const dayTotal = dayTraces.length;
        const dayErrors = dayTraces.filter(
          (t: { status: string }) => t.status === "error"
        ).length;
        dailyData.push({
          date: dateStr,
          count: dayTotal,
          errorRate: dayTotal > 0 ? (dayErrors / dayTotal) * 100 : 0,
          avgDuration:
            dayTotal > 0
              ? dayTraces.reduce(
                  (s: number, t: { duration_ms: number }) =>
                    s + (t.duration_ms || 0),
                  0
                ) / dayTotal
              : 0,
          avgCost:
            dayTotal > 0
              ? dayTraces.reduce(
                  (s: number, t: { total_cost?: number }) =>
                    s + (t.total_cost || 0),
                  0
                ) / dayTotal
              : 0,
        });
      }

      return {
        totalTraces: total,
        errorRate: total > 0 ? (errors / total) * 100 : 0,
        avgDuration,
        avgCost,
        sparklines: { daily: dailyData },
      };
    }),

  /**
   * Get trace count
   */
  count: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
      });

      if (input.startDate) params.set("start_date", input.startDate);
      if (input.endDate) params.set("end_date", input.endDate);

      const response = await fetch(
        `${MOOSE_API_URL}/api/traces/count?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to get count: ${await response.text()}`);
      }

      const data = await response.json();
      return z.object({ count: z.number() }).parse(data);
    }),
});
