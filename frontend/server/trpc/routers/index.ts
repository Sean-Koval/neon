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

/**
 * Main app router
 */
export const appRouter = router({
  traces: tracesRouter,
  scores: scoresRouter,
  workflows: workflowsRouter,
  analytics: analyticsRouter,
});

/**
 * Type for the app router
 */
export type AppRouter = typeof appRouter;
