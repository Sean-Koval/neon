/**
 * Dashboard data fetching and filtering hook.
 *
 * Combines runs, suites, and stats with server-side or client-side filtering.
 * Uses server-side materialized views for fast aggregations (<100ms).
 */

import { useMemo, useState } from 'react'
import type {
  DashboardFilters,
  DateRangeOption,
} from '@/components/dashboard/filters'
import { getDateFromRange } from '@/components/dashboard/filters'
import {
  useRuns,
  useDashboardStats as useClientDashboardStats,
  useScoreTrend as useClientScoreTrend,
  type ScoreTrendPoint,
} from './use-runs'
import {
  useDashboardSummary,
  useFormattedScoreTrends,
  type FormattedScoreTrendPoint,
} from './use-dashboard-api'
import { useSuites } from './use-suites'
import type { EvalRun, EvalSuite } from '@/lib/types'

export interface UseDashboardReturn {
  // Filters
  filters: DashboardFilters
  setFilters: (filters: DashboardFilters) => void

  // Filtered runs
  filteredRuns: EvalRun[]
  recentRuns: EvalRun[]
  allRuns: EvalRun[]

  // Stats (from server-side materialized views or client-side)
  stats: {
    totalRuns: number
    passedRuns: number
    failedRuns: number
    passedPercentage: number
    failedPercentage: number
    averageScore: number
  } | null

  // Suites for filter dropdown
  suites: EvalSuite[]

  // Trend data (from server-side or client-side)
  trendData: ScoreTrendPoint[]

  // Loading states
  isLoadingRuns: boolean
  isLoadingSuites: boolean
  isLoadingStats: boolean
  isLoadingTrend: boolean

  // Error states
  runsError: Error | null
  suitesError: Error | null
  statsError: Error | null
  trendError: Error | null

  // Performance metrics
  queryTimeMs?: number

  // Refresh function
  refresh: () => void
}

export interface UseDashboardOptions {
  /**
   * Use server-side materialized views for aggregations.
   * Default: true (recommended for performance)
   */
  useServerSide?: boolean
}

const DEFAULT_FILTERS: DashboardFilters = {
  status: 'all',
  suiteId: 'all',
  dateRange: '7d',
}

/**
 * Convert date range option to number of days.
 */
function dateRangeToDays(range: DateRangeOption): number {
  switch (range) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
    default:
      return 7
  }
}

/**
 * Hook for fetching and filtering dashboard data.
 *
 * Uses server-side materialized views by default for <100ms query latency.
 * Falls back to client-side computation if server-side is disabled.
 */
export function useDashboard(options: UseDashboardOptions = {}): UseDashboardReturn {
  const { useServerSide = true } = options
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)

  const trendDays = dateRangeToDays(filters.dateRange)

  // Fetch all runs (with high limit to get enough for filtering)
  const {
    data: allRuns = [],
    isLoading: isLoadingRuns,
    error: runsError,
    refetch: refetchRuns,
  } = useRuns({ limit: 500 })

  // Fetch suites for filter dropdown
  const {
    data: suites = [],
    isLoading: isLoadingSuites,
    error: suitesError,
    refetch: refetchSuites,
  } = useSuites()

  // Server-side stats from materialized views
  const {
    data: serverStats,
    isLoading: isLoadingServerStats,
    error: serverStatsError,
    refetch: refetchServerStats,
  } = useDashboardSummary({ days: trendDays }, { enabled: useServerSide })

  // Client-side stats (fallback)
  const {
    stats: clientStats,
    isLoading: isLoadingClientStats,
    error: clientStatsError,
    refetch: refetchClientStats,
  } = useClientDashboardStats()

  // Server-side trend data from materialized views
  const {
    data: serverTrendData = [],
    isLoading: isLoadingServerTrend,
    error: serverTrendError,
  } = useFormattedScoreTrends({ days: trendDays })

  // Client-side trend data (fallback)
  const {
    data: clientTrendData = [],
    isLoading: isLoadingClientTrend,
    error: clientTrendError,
  } = useClientScoreTrend({ days: trendDays, maxRuns: 100 })

  // Select stats based on mode
  const isLoadingStats = useServerSide ? isLoadingServerStats : isLoadingClientStats
  const statsError = useServerSide ? serverStatsError : clientStatsError
  const refetchStats = useServerSide ? refetchServerStats : refetchClientStats

  // Select trend data based on mode
  const isLoadingTrend = useServerSide ? isLoadingServerTrend : isLoadingClientTrend
  const trendError = useServerSide ? serverTrendError : clientTrendError

  // Transform server stats to match expected format
  const stats = useMemo(() => {
    if (useServerSide && serverStats) {
      return {
        totalRuns: serverStats.totalRuns,
        passedRuns: serverStats.passedRuns,
        failedRuns: serverStats.failedRuns,
        passedPercentage: serverStats.passedPercentage,
        failedPercentage: serverStats.failedPercentage,
        averageScore: serverStats.averageScore,
      }
    }
    return clientStats
  }, [useServerSide, serverStats, clientStats])

  // Select trend data
  const rawTrendData = useServerSide ? serverTrendData : clientTrendData

  // Transform server trend data to expected format if needed
  const trendData: ScoreTrendPoint[] = useMemo(() => {
    if (!rawTrendData) return []
    // Both formats are compatible now
    return rawTrendData.map((point) => ({
      date: point.date,
      displayDate: point.displayDate,
      score: point.score,
      runCount: point.runCount,
    }))
  }, [rawTrendData])

  // Filter runs based on current filters
  const filteredRuns = useMemo(() => {
    let result = [...allRuns]

    // Filter by status
    if (filters.status !== 'all') {
      result = result.filter((run) => run.status === filters.status)
    }

    // Filter by suite
    if (filters.suiteId !== 'all') {
      result = result.filter((run) => run.suite_id === filters.suiteId)
    }

    // Filter by date range
    const startDate = getDateFromRange(filters.dateRange)
    if (startDate) {
      result = result.filter((run) => new Date(run.created_at) >= startDate)
    }

    // Sort by most recent first
    result.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )

    return result
  }, [allRuns, filters])

  // Get recent runs (top 10 from filtered)
  const recentRuns = useMemo(() => {
    return filteredRuns.slice(0, 10)
  }, [filteredRuns])

  // Combined refresh function
  const refresh = () => {
    refetchRuns()
    refetchSuites()
    refetchStats()
  }

  // Query time from server-side stats (if available)
  const queryTimeMs = useServerSide ? serverStats?.queryTimeMs : undefined

  return {
    filters,
    setFilters,
    filteredRuns,
    recentRuns,
    allRuns,
    stats,
    suites,
    trendData,
    isLoadingRuns,
    isLoadingSuites,
    isLoadingStats,
    isLoadingTrend,
    runsError: runsError as Error | null,
    suitesError: suitesError as Error | null,
    statsError: statsError as Error | null,
    trendError: trendError as Error | null,
    queryTimeMs,
    refresh,
  }
}
