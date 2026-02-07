/**
 * Suites Router
 *
 * tRPC procedures for test suite management.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;

const scorerTypeSchema = z.enum([
  "tool_selection",
  "reasoning",
  "grounding",
  "efficiency",
  "custom",
]);

/**
 * Suites router - wraps existing /api/suites endpoints
 */
export const suitesRouter = router({
  /**
   * List all evaluation suites
   */
  list: publicProcedure.query(async ({ ctx }) => {
    const response = await fetch(`${API_BASE}/suites`, {
      headers: { "x-project-id": ctx.projectId },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch suites: ${await response.text()}`);
    }

    return response.json();
  }),

  /**
   * Get a single suite by ID
   */
  get: publicProcedure
    .input(z.object({ suiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/suites/${input.suiteId}`, {
        headers: { "x-project-id": ctx.projectId },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch suite: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Create a new evaluation suite
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().max(2000).optional(),
        agentId: z.string(),
        defaultScorers: z.array(scorerTypeSchema),
        defaultMinScore: z.number().min(0).max(1).default(0.7),
        defaultTimeoutSeconds: z.number().min(1).max(3600).default(30),
        parallel: z.boolean().default(true),
        stopOnFailure: z.boolean().default(false),
        cases: z
          .array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              input: z.record(z.string(), z.unknown()),
              expected_tools: z.array(z.string()).optional(),
              expected_tool_sequence: z.array(z.string()).optional(),
              expected_output_contains: z.array(z.string()).optional(),
              expected_output_pattern: z.string().optional(),
              scorers: z.array(scorerTypeSchema),
              scorer_config: z.record(z.string(), z.unknown()).optional(),
              min_score: z.number().min(0).max(1),
              tags: z.array(z.string()).default([]),
              timeout_seconds: z.number().min(1).max(3600).default(30),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/suites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          agent_id: input.agentId,
          default_scorers: input.defaultScorers,
          default_min_score: input.defaultMinScore,
          default_timeout_seconds: input.defaultTimeoutSeconds,
          parallel: input.parallel,
          stop_on_failure: input.stopOnFailure,
          cases: input.cases,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create suite: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Update an existing suite
   */
  update: protectedProcedure
    .input(
      z.object({
        suiteId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().max(2000).optional(),
        agentId: z.string().optional(),
        defaultScorers: z.array(scorerTypeSchema).optional(),
        defaultMinScore: z.number().min(0).max(1).optional(),
        defaultTimeoutSeconds: z.number().min(1).max(3600).optional(),
        parallel: z.boolean().optional(),
        stopOnFailure: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suiteId, ...updateData } = input;

      const response = await fetch(`${API_BASE}/suites/${suiteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify({
          name: updateData.name,
          description: updateData.description,
          agent_id: updateData.agentId,
          default_scorers: updateData.defaultScorers,
          default_min_score: updateData.defaultMinScore,
          default_timeout_seconds: updateData.defaultTimeoutSeconds,
          parallel: updateData.parallel,
          stop_on_failure: updateData.stopOnFailure,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update suite: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Delete a suite
   */
  delete: protectedProcedure
    .input(z.object({ suiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(`${API_BASE}/suites/${input.suiteId}`, {
        method: "DELETE",
        headers: { "x-project-id": ctx.projectId },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete suite: ${await response.text()}`);
      }

      return { success: true };
    }),

  /**
   * List cases in a suite
   */
  listCases: publicProcedure
    .input(z.object({ suiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const response = await fetch(
        `${API_BASE}/suites/${input.suiteId}/cases`,
        {
          headers: { "x-project-id": ctx.projectId },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch cases: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Create a case in a suite
   */
  createCase: protectedProcedure
    .input(
      z.object({
        suiteId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        input: z.record(z.string(), z.unknown()),
        expected_tools: z.array(z.string()).optional(),
        expected_tool_sequence: z.array(z.string()).optional(),
        expected_output_contains: z.array(z.string()).optional(),
        expected_output_pattern: z.string().optional(),
        scorers: z.array(scorerTypeSchema),
        scorer_config: z.record(z.string(), z.unknown()).optional(),
        min_score: z.number().min(0).max(1),
        tags: z.array(z.string()).default([]),
        timeout_seconds: z.number().min(1).max(3600).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suiteId, ...caseData } = input;

      const response = await fetch(`${API_BASE}/suites/${suiteId}/cases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project-id": ctx.projectId,
        },
        body: JSON.stringify(caseData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create case: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Update a case
   */
  updateCase: protectedProcedure
    .input(
      z.object({
        suiteId: z.string(),
        caseId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        input: z.record(z.string(), z.unknown()).optional(),
        expected_tools: z.array(z.string()).optional(),
        expected_tool_sequence: z.array(z.string()).optional(),
        expected_output_contains: z.array(z.string()).optional(),
        expected_output_pattern: z.string().optional(),
        scorers: z.array(scorerTypeSchema).optional(),
        scorer_config: z.record(z.string(), z.unknown()).optional(),
        min_score: z.number().min(0).max(1).optional(),
        tags: z.array(z.string()).optional(),
        timeout_seconds: z.number().min(1).max(3600).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suiteId, caseId, ...updateData } = input;

      const response = await fetch(
        `${API_BASE}/suites/${suiteId}/cases/${caseId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-project-id": ctx.projectId,
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update case: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Delete a case from a suite
   */
  deleteCase: protectedProcedure
    .input(z.object({ suiteId: z.string(), caseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await fetch(
        `${API_BASE}/suites/${input.suiteId}/cases/${input.caseId}`,
        {
          method: "DELETE",
          headers: { "x-project-id": ctx.projectId },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete case: ${await response.text()}`);
      }

      return { success: true };
    }),
});
