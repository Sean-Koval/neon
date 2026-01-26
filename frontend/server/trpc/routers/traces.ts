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
