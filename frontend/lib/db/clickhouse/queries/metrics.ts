/**
 * Metrics Queries
 *
 * Centralized query module for aggregation and analytics operations.
 * Covers daily stats, tool metrics, and cross-workspace analytics.
 */

import {
  getCrossWorkspaceDailyTrends,
  getCrossWorkspaceScoreComparison,
  getDailyStats,
  getOrgAnalyticsSummary,
  getToolMetrics,
  getWorkspaceAnalyticsBreakdown,
  type OrgAnalyticsSummary,
  type ToolMetric,
  type ToolMetricsSummary,
  type WorkspaceAnalytics,
} from '../../../clickhouse'
import {
  type BaseQueryParams,
  executeQuery,
  type QueryResult,
} from '../query-builder'

// =============================================================================
// Daily Stats
// =============================================================================

/** Get daily statistics for a project */
export async function getDailyStatsData(
  params: Required<BaseQueryParams>,
): Promise<
  QueryResult<
    {
      date: string
      trace_count: number
      error_count: number
      total_tokens: number
      total_cost: number
    }[]
  >
> {
  return executeQuery(
    'metrics.dailyStats',
    params,
    () => getDailyStats(params.projectId, params.startDate, params.endDate),
    60_000, // 1 min cache
  )
}

// =============================================================================
// Tool Metrics
// =============================================================================

/** Get tool execution metrics */
export async function getToolMetricsData(
  params: Required<BaseQueryParams>,
): Promise<QueryResult<{ tools: ToolMetric[]; summary: ToolMetricsSummary }>> {
  return executeQuery(
    'metrics.toolMetrics',
    params,
    () => getToolMetrics(params.projectId, params.startDate, params.endDate),
    30_000,
  )
}

// =============================================================================
// Cross-Workspace Analytics (Organization-level)
// =============================================================================

/** Get aggregated analytics across multiple workspaces */
export async function getOrgSummary(
  projectIds: string[],
  startDate: string,
  endDate: string,
): Promise<QueryResult<OrgAnalyticsSummary>> {
  return executeQuery(
    'metrics.orgSummary',
    { projectIds: projectIds.join(','), startDate, endDate },
    () => getOrgAnalyticsSummary(projectIds, startDate, endDate),
    60_000,
  )
}

/** Get per-workspace analytics breakdown */
export async function getWorkspaceBreakdown(
  projectIds: string[],
  startDate: string,
  endDate: string,
): Promise<QueryResult<WorkspaceAnalytics[]>> {
  return executeQuery(
    'metrics.workspaceBreakdown',
    { projectIds: projectIds.join(','), startDate, endDate },
    () => getWorkspaceAnalyticsBreakdown(projectIds, startDate, endDate),
    60_000,
  )
}

/** Get cross-workspace score comparison */
export async function getScoreComparison(
  projectIds: string[],
  scorerName: string,
  startDate: string,
  endDate: string,
): Promise<
  QueryResult<
    {
      project_id: string
      avg_score: number
      min_score: number
      max_score: number
      score_count: number
    }[]
  >
> {
  return executeQuery(
    'metrics.scoreComparison',
    {
      projectIds: projectIds.join(','),
      scorerName,
      startDate,
      endDate,
    },
    () =>
      getCrossWorkspaceScoreComparison(
        projectIds,
        scorerName,
        startDate,
        endDate,
      ),
    60_000,
  )
}

/** Get cross-workspace daily trends */
export async function getDailyTrends(
  projectIds: string[],
  startDate: string,
  endDate: string,
): Promise<
  QueryResult<
    {
      date: string
      total_runs: number
      passed_runs: number
      failed_runs: number
      total_tokens: number
      total_cost: number
    }[]
  >
> {
  return executeQuery(
    'metrics.dailyTrends',
    { projectIds: projectIds.join(','), startDate, endDate },
    () => getCrossWorkspaceDailyTrends(projectIds, startDate, endDate),
    60_000,
  )
}
