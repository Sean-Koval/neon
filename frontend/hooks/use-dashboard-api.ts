/**
 * Dashboard API Hooks
 *
 * React Query hooks for fetching dashboard data from server-side
 * materialized views. Provides <100ms query latency for aggregations.
 */

import { type UseQueryOptions, useQuery } from '@tanstack/react-query'

import {
  type DashboardQueryParams,
  type DashboardResponse,
  type DashboardSummaryResponse,
  type DurationStatsResponse,
  dashboardApi,
  type ScoreTrendPointResponse,
} from '@/lib/api'

// =============================================================================
// Query Keys
// =============================================================================

export const dashboardKeys = {
  all: ['dashboard'] as const,
  dashboard: (params?: DashboardQueryParams) =>
    [...dashboardKeys.all, 'full', params] as const,
  summary: (params?: DashboardQueryParams) =>
    [...dashboardKeys.all, 'summary', params] as const,
  scoreTrends: (params?: DashboardQueryParams) =>
    [...dashboardKeys.all, 'score-trends', params] as const,
  durationStats: (params?: DashboardQueryParams) =>
    [...dashboardKeys.all, 'duration-stats', params] as const,
}

// =============================================================================
// Dashboard Stats (Server-Side)
// =============================================================================

export interface ServerDashboardStats {
  totalRuns: number
  passedRuns: number
  failedRuns: number
  passRate: number
  passedPercentage: number
  failedPercentage: number
  averageScore: number
  avgDurationMs: number
  totalTokens: number
  totalCost: number
  queryTimeMs: number
}

/**
 * Transform API response to hook-compatible format.
 */
function transformSummary(
  data: DashboardSummaryResponse,
): ServerDashboardStats {
  const passedPercentage =
    data.total_runs > 0
      ? Math.round((data.passed_runs / data.total_runs) * 100)
      : 0
  const failedPercentage =
    data.total_runs > 0
      ? Math.round((data.failed_runs / data.total_runs) * 100)
      : 0

  return {
    totalRuns: data.total_runs,
    passedRuns: data.passed_runs,
    failedRuns: data.failed_runs,
    passRate: data.pass_rate,
    passedPercentage,
    failedPercentage,
    averageScore: data.pass_rate, // Using pass rate as a proxy for average score
    avgDurationMs: data.avg_duration_ms,
    totalTokens: data.total_tokens,
    totalCost: data.total_cost,
    queryTimeMs: data.queryTimeMs,
  }
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch complete dashboard data in a single request.
 * Use this when you need all dashboard widgets at once.
 */
export function useDashboardData(
  params?: DashboardQueryParams,
  options?: Omit<
    UseQueryOptions<DashboardResponse, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: dashboardKeys.dashboard(params),
    queryFn: () => dashboardApi.getDashboard(params),
    staleTime: 10 * 1000, // 10 seconds - dashboard data refreshes often
    retry: 1, // Limit retries for faster error feedback
    ...options,
  })
}

/**
 * Fetch just dashboard summary stats.
 * Optimized for fast initial page load.
 */
export function useDashboardSummary(
  params?: DashboardQueryParams,
  options?: Omit<
    UseQueryOptions<ServerDashboardStats, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: dashboardKeys.summary(params),
    queryFn: async () => {
      const data = await dashboardApi.getSummary(params)
      return transformSummary(data)
    },
    staleTime: 10 * 1000,
    retry: 1, // Limit retries for faster fallback to client-side
    ...options,
  })
}

/**
 * Fetch score trends with min/max values.
 */
export function useScoreTrendsApi(
  params?: DashboardQueryParams,
  options?: Omit<
    UseQueryOptions<ScoreTrendPointResponse[], Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: dashboardKeys.scoreTrends(params),
    queryFn: async () => {
      const { trends } = await dashboardApi.getScoreTrends(params)
      return trends
    },
    staleTime: 10 * 1000,
    retry: 1, // Limit retries for faster fallback to client-side
    ...options,
  })
}

/**
 * Fetch duration statistics with percentiles.
 */
export function useDurationStats(
  params?: DashboardQueryParams,
  options?: Omit<
    UseQueryOptions<DurationStatsResponse[], Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: dashboardKeys.durationStats(params),
    queryFn: async () => {
      const { stats } = await dashboardApi.getDurationStats(params)
      return stats
    },
    staleTime: 10 * 1000,
    retry: 1, // Limit retries for faster error feedback
    ...options,
  })
}

// =============================================================================
// Formatted Score Trend Point (for chart compatibility)
// =============================================================================

export interface FormattedScoreTrendPoint {
  date: string
  displayDate: string
  score: number
  minScore: number
  maxScore: number
  runCount: number
}

/**
 * Transform API score trends to chart-compatible format.
 */
export function formatScoreTrends(
  trends: ScoreTrendPointResponse[],
): FormattedScoreTrendPoint[] {
  // Group by date and aggregate all scorers
  const byDate = new Map<
    string,
    {
      totalScore: number
      minScore: number
      maxScore: number
      count: number
    }
  >()

  for (const point of trends) {
    const existing = byDate.get(point.date)
    if (existing) {
      existing.totalScore += point.avg_score * point.score_count
      existing.minScore = Math.min(existing.minScore, point.min_score)
      existing.maxScore = Math.max(existing.maxScore, point.max_score)
      existing.count += point.score_count
    } else {
      byDate.set(point.date, {
        totalScore: point.avg_score * point.score_count,
        minScore: point.min_score,
        maxScore: point.max_score,
        count: point.score_count,
      })
    }
  }

  // Convert to array and format
  const result: FormattedScoreTrendPoint[] = []
  const sortedDates = Array.from(byDate.keys()).sort()

  for (const date of sortedDates) {
    const data = byDate.get(date)!
    const dateObj = new Date(date)
    result.push({
      date,
      displayDate: dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      score: data.count > 0 ? data.totalScore / data.count : 0,
      minScore: data.minScore,
      maxScore: data.maxScore,
      runCount: data.count,
    })
  }

  return result
}

/**
 * Hook that returns formatted score trends for charts.
 */
export function useFormattedScoreTrends(params?: DashboardQueryParams) {
  const { data: trends, isLoading, error } = useScoreTrendsApi(params)

  return {
    data: trends ? formatScoreTrends(trends) : [],
    isLoading,
    error,
  }
}
