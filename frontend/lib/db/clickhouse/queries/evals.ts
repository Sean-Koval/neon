/**
 * Eval Queries
 *
 * Centralized query module for evaluation-related operations.
 * Covers dashboard summary, score trends, run summaries, and scorer stats.
 */

import {
  backfillMaterializedViews,
  type DailyRunSummary,
  type DashboardSummary,
  type DurationStats,
  getDailyRunSummary,
  getDashboardSummary,
  getDurationStats,
  getScorerStats,
  getScoreTrends,
  type ScorerStats,
  type ScoreTrendPoint,
} from '../../../clickhouse'
import {
  type BaseQueryParams,
  executeQuery,
  type QueryResult,
} from '../query-builder'

// =============================================================================
// Dashboard Queries
// =============================================================================

/** Get aggregated dashboard summary for a date range */
export async function getDashboard(
  params: Required<BaseQueryParams>,
): Promise<QueryResult<DashboardSummary>> {
  return executeQuery(
    'evals.dashboard',
    params,
    () =>
      getDashboardSummary(params.projectId, params.startDate, params.endDate),
    30_000, // 30s cache
  )
}

/** Get score trends with min/max values */
export async function getScoreTrendData(
  params: Required<BaseQueryParams> & { scorerName?: string },
): Promise<QueryResult<ScoreTrendPoint[]>> {
  return executeQuery(
    'evals.scoreTrends',
    params,
    () =>
      getScoreTrends(
        params.projectId,
        params.startDate,
        params.endDate,
        params.scorerName,
      ),
    30_000,
  )
}

/** Get duration statistics with percentiles */
export async function getDurationStatsData(
  params: Required<BaseQueryParams>,
): Promise<QueryResult<DurationStats[]>> {
  return executeQuery(
    'evals.durationStats',
    params,
    () => getDurationStats(params.projectId, params.startDate, params.endDate),
    30_000,
  )
}

/** Get daily run summary for dashboard cards */
export async function getDailyRunSummaryData(
  params: Required<BaseQueryParams>,
): Promise<QueryResult<DailyRunSummary[]>> {
  return executeQuery(
    'evals.dailyRunSummary',
    params,
    () =>
      getDailyRunSummary(params.projectId, params.startDate, params.endDate),
    30_000,
  )
}

/** Get scorer-level statistics */
export async function getScorerStatsData(
  params: Required<BaseQueryParams>,
): Promise<QueryResult<ScorerStats[]>> {
  return executeQuery(
    'evals.scorerStats',
    params,
    () => getScorerStats(params.projectId, params.startDate, params.endDate),
    30_000,
  )
}

// =============================================================================
// Backfill
// =============================================================================

/** Backfill all materialized views with existing data */
export async function backfillViews(
  projectId?: string,
): Promise<QueryResult<{ view: string; rows: number }[]>> {
  return executeQuery(
    null, // Don't cache backfill operations
    { projectId },
    () => backfillMaterializedViews(projectId),
  )
}
