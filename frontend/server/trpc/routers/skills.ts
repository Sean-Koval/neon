/**
 * Skills Router
 *
 * tRPC procedures for skill evaluation management.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

/**
 * Skills router - wraps existing /api/skills endpoints
 */
export const skillsRouter = router({
  /**
   * Get skill evaluation summaries
   */
  summaries: publicProcedure
    .input(
      z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        projectId: ctx.projectId,
      });

      if (input?.startDate) params.set("startDate", input.startDate);
      if (input?.endDate) params.set("endDate", input.endDate);

      const response = await fetch(
        `${API_BASE}/skills/summaries?${params}`
      );

      if (!response.ok) {
        console.warn("Skill summaries endpoint not available");
        return { summaries: [] };
      }

      const data = await response.json();
      return { summaries: data.summaries || [] };
    }),

  /**
   * Get evaluation history for a specific skill
   */
  history: publicProcedure
    .input(
      z.object({
        skillId: z.string(),
        limit: z.number().min(1).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        projectId: ctx.projectId,
      });

      if (input.limit) params.set("limit", String(input.limit));

      const response = await fetch(
        `${API_BASE}/skills/${input.skillId}/history?${params}`
      );

      if (!response.ok) {
        console.warn(
          `Skill history endpoint not available for ${input.skillId}`
        );
        return null;
      }

      return response.json();
    }),

  /**
   * Get detailed evaluation results for a specific eval
   */
  evalDetail: publicProcedure
    .input(z.object({ evalId: z.string() }))
    .query(async ({ input }) => {
      const response = await fetch(
        `${API_BASE}/skills/evals/${input.evalId}`
      );

      if (!response.ok) {
        console.warn(
          `Skill eval detail endpoint not available for ${input.evalId}`
        );
        return null;
      }

      return response.json();
    }),

  /**
   * Get active skill regressions
   */
  regressions: publicProcedure.query(async ({ ctx }) => {
    const params = new URLSearchParams({
      projectId: ctx.projectId,
    });

    const response = await fetch(
      `${API_BASE}/skills/regressions?${params}`
    );

    if (!response.ok) {
      console.warn("Skill regressions endpoint not available");
      return { regressions: [] };
    }

    const data = await response.json();
    return { regressions: data.regressions || [] };
  }),
});
