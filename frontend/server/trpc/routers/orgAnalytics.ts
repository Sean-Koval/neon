/**
 * Organization Analytics Router
 *
 * Provides cross-workspace analytics for organization-level dashboards.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, orgProcedure } from "../trpc";
import { db, workspaces } from "@/lib/db";
import {
  getOrgAnalyticsSummary,
  getWorkspaceAnalyticsBreakdown,
  getCrossWorkspaceScoreComparison,
  getCrossWorkspaceDailyTrends,
} from "@/lib/clickhouse";

// =============================================================================
// Input Schemas
// =============================================================================

const timeRangeInput = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

// =============================================================================
// Router
// =============================================================================

export const orgAnalyticsRouter = router({
  /**
   * Get aggregated summary across all workspaces in the organization
   */
  summary: orgProcedure.input(timeRangeInput).query(async ({ ctx, input }) => {
    // Get all workspace IDs for this organization
    const orgWorkspaces = await db.query.workspaces.findMany({
      where: eq(workspaces.organizationId, ctx.organizationId),
      columns: { id: true, name: true, slug: true },
    });

    const workspaceIds = orgWorkspaces.map((ws) => ws.id);

    const summary = await getOrgAnalyticsSummary(
      workspaceIds,
      input.startDate,
      input.endDate
    );

    return {
      ...summary,
      workspaces: orgWorkspaces,
    };
  }),

  /**
   * Get per-workspace analytics breakdown
   */
  workspaceBreakdown: orgProcedure
    .input(timeRangeInput)
    .query(async ({ ctx, input }) => {
      // Get all workspaces for this organization
      const orgWorkspaces = await db.query.workspaces.findMany({
        where: eq(workspaces.organizationId, ctx.organizationId),
      });

      const workspaceIds = orgWorkspaces.map((ws) => ws.id);
      const workspaceMap = new Map(orgWorkspaces.map((ws) => [ws.id, ws]));

      const analytics = await getWorkspaceAnalyticsBreakdown(
        workspaceIds,
        input.startDate,
        input.endDate
      );

      // Enrich with workspace metadata
      return analytics.map((item) => ({
        ...item,
        workspace: workspaceMap.get(item.project_id),
      }));
    }),

  /**
   * Compare scores across workspaces
   */
  scoreComparison: orgProcedure
    .input(
      timeRangeInput.extend({
        scorerName: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgWorkspaces = await db.query.workspaces.findMany({
        where: eq(workspaces.organizationId, ctx.organizationId),
      });

      const workspaceIds = orgWorkspaces.map((ws) => ws.id);
      const workspaceMap = new Map(orgWorkspaces.map((ws) => [ws.id, ws]));

      const comparison = await getCrossWorkspaceScoreComparison(
        workspaceIds,
        input.scorerName,
        input.startDate,
        input.endDate
      );

      return comparison.map((item) => ({
        ...item,
        workspace: workspaceMap.get(item.project_id),
      }));
    }),

  /**
   * Get daily trends aggregated across all workspaces
   */
  dailyTrends: orgProcedure
    .input(timeRangeInput)
    .query(async ({ ctx, input }) => {
      const orgWorkspaces = await db.query.workspaces.findMany({
        where: eq(workspaces.organizationId, ctx.organizationId),
        columns: { id: true },
      });

      const workspaceIds = orgWorkspaces.map((ws) => ws.id);

      return getCrossWorkspaceDailyTrends(
        workspaceIds,
        input.startDate,
        input.endDate
      );
    }),

  /**
   * Get cost breakdown by workspace
   */
  costByWorkspace: orgProcedure
    .input(timeRangeInput)
    .query(async ({ ctx, input }) => {
      const orgWorkspaces = await db.query.workspaces.findMany({
        where: eq(workspaces.organizationId, ctx.organizationId),
      });

      const workspaceIds = orgWorkspaces.map((ws) => ws.id);
      const workspaceMap = new Map(orgWorkspaces.map((ws) => [ws.id, ws]));

      const breakdown = await getWorkspaceAnalyticsBreakdown(
        workspaceIds,
        input.startDate,
        input.endDate
      );

      return breakdown.map((item) => ({
        workspaceId: item.project_id,
        workspaceName: workspaceMap.get(item.project_id)?.name || "Unknown",
        workspaceSlug: workspaceMap.get(item.project_id)?.slug || "unknown",
        totalCost: item.total_cost,
        totalTokens: item.total_tokens,
        totalRuns: item.total_runs,
        costPerRun:
          item.total_runs > 0 ? item.total_cost / item.total_runs : 0,
      }));
    }),
});
