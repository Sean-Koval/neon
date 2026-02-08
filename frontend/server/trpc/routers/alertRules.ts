/**
 * Alert Rules Router
 *
 * tRPC procedures for managing alert rules.
 * Wraps the /api/alerts/rules REST endpoints.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  `http://localhost:${process.env.PORT || 3000}/api`;

const operatorSchema = z.enum(["gt", "gte", "lt", "lte", "eq"]);
const severitySchema = z.enum(["critical", "warning", "info"]);

/**
 * Alert rules router - wraps /api/alerts/rules endpoints
 */
export const alertRulesRouter = router({
  /**
   * List all alert rules with optional filters
   */
  list: publicProcedure
    .input(
      z
        .object({
          severity: severitySchema.optional(),
          enabled: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.severity) params.set("severity", input.severity);
      if (input?.enabled !== undefined)
        params.set("enabled", String(input.enabled));

      const qs = params.toString();
      const url = `${API_BASE}/alerts/rules${qs ? `?${qs}` : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch alert rules: ${await response.text()}`);
      }

      return response.json();
    }),

  /**
   * Create a new alert rule
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        metric: z.string().min(1),
        operator: operatorSchema,
        threshold: z.number(),
        severity: severitySchema.default("warning"),
        enabled: z.boolean().default(true),
        windowSeconds: z.number().min(1).default(300),
        consecutiveBreaches: z.number().min(1).default(1),
        labels: z.record(z.string(), z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const response = await fetch(`${API_BASE}/alerts/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create alert rule: ${await response.text()}`
        );
      }

      return response.json();
    }),

  /**
   * Update an existing alert rule
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        metric: z.string().min(1).optional(),
        operator: operatorSchema.optional(),
        threshold: z.number().optional(),
        severity: severitySchema.optional(),
        enabled: z.boolean().optional(),
        windowSeconds: z.number().min(1).optional(),
        consecutiveBreaches: z.number().min(1).optional(),
        labels: z.record(z.string(), z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const response = await fetch(`${API_BASE}/alerts/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update alert rule: ${await response.text()}`
        );
      }

      return response.json();
    }),

  /**
   * Delete an alert rule
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const response = await fetch(
        `${API_BASE}/alerts/rules?id=${encodeURIComponent(input.id)}`,
        { method: "DELETE" }
      );

      if (!response.ok && response.status !== 204) {
        throw new Error(
          `Failed to delete alert rule: ${await response.text()}`
        );
      }

      return { success: true };
    }),
});
