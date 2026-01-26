/**
 * Scores Router
 *
 * tRPC procedures for score management.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

const MOOSE_API_URL = process.env.MOOSE_API_URL || "http://localhost:4000";

/**
 * Score schema
 */
const scoreSchema = z.object({
  score_id: z.string(),
  trace_id: z.string(),
  span_id: z.string().nullable(),
  name: z.string(),
  value: z.number(),
  score_type: z.enum(["numeric", "categorical", "boolean"]),
  string_value: z.string().nullable(),
  comment: z.string(),
  source: z.enum(["api", "sdk", "annotation", "eval", "temporal"]),
  config_id: z.string().nullable(),
  timestamp: z.string(),
  author_id: z.string().nullable(),
});

/**
 * Score config schema
 */
const scoreConfigSchema = z.object({
  config_id: z.string(),
  name: z.string(),
  data_type: z.enum(["numeric", "categorical", "boolean"]),
  description: z.string(),
  evaluator_type: z.enum(["llm_judge", "rule_based", "custom"]).nullable(),
  evaluator_model: z.string().nullable(),
  threshold: z.number().nullable(),
  categories: z.array(z.string()),
});

/**
 * Scores router
 */
export const scoresRouter = router({
  /**
   * List scores for a trace
   */
  list: publicProcedure
    .input(
      z.object({
        traceId: z.string().optional(),
        spanId: z.string().optional(),
        name: z.string().optional(),
        source: z.string().optional(),
        limit: z.number().min(1).max(100).default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        project_id: ctx.projectId,
        limit: String(input.limit),
        offset: String(input.offset),
      });

      if (input.traceId) params.set("trace_id", input.traceId);
      if (input.spanId) params.set("span_id", input.spanId);
      if (input.name) params.set("name", input.name);
      if (input.source) params.set("source", input.source);

      const response = await fetch(`${MOOSE_API_URL}/api/scores?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch scores: ${await response.text()}`);
      }

      const data = await response.json();
      return z.array(scoreSchema).parse(data);
    }),

  /**
   * Create a score (manual annotation)
   */
  create: protectedProcedure
    .input(
      z.object({
        traceId: z.string(),
        spanId: z.string().optional(),
        name: z.string(),
        value: z.number().min(0).max(1),
        scoreType: z.enum(["numeric", "categorical", "boolean"]).default("numeric"),
        stringValue: z.string().optional(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${MOOSE_API_URL}/api/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: ctx.projectId,
          trace_id: input.traceId,
          span_id: input.spanId,
          name: input.name,
          value: input.value,
          score_type: input.scoreType,
          string_value: input.stringValue,
          comment: input.comment,
          source: "annotation",
          author_id: ctx.userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create score: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Get score summary for a trace
   */
  summary: publicProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const response = await fetch(
        `${MOOSE_API_URL}/api/traces/${input.traceId}/scores/summary?project_id=${ctx.projectId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to get summary: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * List score configurations
   */
  listConfigs: publicProcedure.query(async ({ ctx }) => {
    const response = await fetch(
      `${MOOSE_API_URL}/api/score-configs?project_id=${ctx.projectId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch configs: ${await response.text()}`);
    }

    const data = await response.json();
    return z.array(scoreConfigSchema).parse(data);
  }),

  /**
   * Create a score configuration
   */
  createConfig: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        dataType: z.enum(["numeric", "categorical", "boolean"]),
        description: z.string().optional(),
        evaluatorType: z.enum(["llm_judge", "rule_based", "custom"]).optional(),
        evaluatorModel: z.string().optional(),
        evaluatorPrompt: z.string().optional(),
        threshold: z.number().optional(),
        categories: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${MOOSE_API_URL}/api/score-configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: ctx.projectId,
          name: input.name,
          data_type: input.dataType,
          description: input.description || "",
          evaluator_type: input.evaluatorType,
          evaluator_model: input.evaluatorModel,
          evaluator_prompt: input.evaluatorPrompt,
          threshold: input.threshold,
          categories: input.categories || [],
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create config: ${await response.text()}`);
      }

      return response.json();
    }),
});
