/**
 * tRPC Router Index
 *
 * Combines all routers into the main app router.
 */

import { router } from "../trpc";
import { tracesRouter } from "./traces";
import { scoresRouter } from "./scores";
import { workflowsRouter } from "./workflows";
import { analyticsRouter } from "./analytics";
import { organizationsRouter } from "./organizations";
import { workspacesRouter } from "./workspaces";
import { orgAnalyticsRouter } from "./orgAnalytics";

/**
 * Main app router
 */
export const appRouter = router({
  // Existing routers
  traces: tracesRouter,
  scores: scoresRouter,
  workflows: workflowsRouter,
  analytics: analyticsRouter,

  // Multi-tenant routers
  organizations: organizationsRouter,
  workspaces: workspacesRouter,
  orgAnalytics: orgAnalyticsRouter,
});

/**
 * Type for the app router
 */
export type AppRouter = typeof appRouter;
