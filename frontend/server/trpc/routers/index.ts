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
import { evalsRouter } from "./evals";
import { suitesRouter } from "./suites";
import { skillsRouter } from "./skills";
import { dashboardRouter } from "./dashboard";
import { feedbackRouter } from "./feedback";
import { promptsRouter } from "./prompts";
import { compareRouter } from "./compare";
import { agentsRouter } from "./agents";
import { alertRulesRouter } from "./alertRules";

/**
 * Main app router
 */
export const appRouter = router({
  // Existing routers
  traces: tracesRouter,
  scores: scoresRouter,
  workflows: workflowsRouter,
  analytics: analyticsRouter,

  // Eval & suite routers
  evals: evalsRouter,
  suites: suitesRouter,
  skills: skillsRouter,

  // Multi-tenant routers
  organizations: organizationsRouter,
  workspaces: workspacesRouter,
  orgAnalytics: orgAnalyticsRouter,

  // Dashboard, feedback, prompts, compare
  dashboard: dashboardRouter,
  feedback: feedbackRouter,
  prompts: promptsRouter,
  compare: compareRouter,

  // Agent registry
  agents: agentsRouter,

  // Alert rules
  alertRules: alertRulesRouter,
});

/**
 * Type for the app router
 */
export type AppRouter = typeof appRouter;
