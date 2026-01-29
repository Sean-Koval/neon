/**
 * Dashboard data fetching and filtering hook.
 *
 * Combines runs, suites, and stats with client-side filtering.
 */

import { useMemo, useState } from 'react'
import type {
  DashboardFilters,
  DateRangeOption,
} from '@/components/dashboard/filters'
import { getDateFromRange } from '@/components/dashboard/filters'
import {
  useRuns,
  useDashboardStats,
  useScoreTrend,
  type ScoreTrendPoint,
} from './use-runs'
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

  // Stats (computed from filtered runs)
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

  // Trend data
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

  // Refresh function
  refresh: () => void
}

const DEFAULT_FILTERS: DashboardFilters = {
  status: 'all',
  suiteId: 'all',
  dateRange: '7d',
}

/**
 * Hook for fetching and filtering dashboard data.
 */
export function useDashboard(): UseDashboardReturn {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)

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

  // Dashboard stats (from existing hook)
  const {
    stats: rawStats,
    isLoading: isLoadingStats,
    error: statsError,
    refetch: refetchStats,
  } = useDashboardStats()

  // Trend data for the chart
  const trendDays =
    filters.dateRange === '7d' ? 7 : filters.dateRange === '30d' ? 30 : 90
  const {
    data: trendData = [],
    isLoading: isLoadingTrend,
    error: trendError,
  } = useScoreTrend({ days: trendDays, maxRuns: 100 })

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

  // Compute stats from filtered runs
  const stats = useMemo(() => {
    if (filteredRuns.length === 0) return null

    let passedRuns = 0
    let failedRuns = 0
    let totalScore = 0
    let runsWithScores = 0

    for (const run of filteredRuns) {
      if (run.status === 'completed' && run.summary) {
        if (run.summary.failed === 0 && run.summary.errored === 0) {
          passedRuns++
        } else {
          failedRuns++
        }
        totalScore += run.summary.avg_score
        runsWithScores++
      } else if (run.status === 'failed') {
        failedRuns++
      }
    }

    const totalRuns = filteredRuns.length
    const passedPercentage =
      totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0
    const failedPercentage =
      totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0
    const averageScore = runsWithScores > 0 ? totalScore / runsWithScores : 0

    return {
      totalRuns,
      passedRuns,
      failedRuns,
      passedPercentage,
      failedPercentage,
      averageScore,
    }
  }, [filteredRuns])

  // Combined refresh function
  const refresh = () => {
    refetchRuns()
    refetchSuites()
    refetchStats()
  }

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
    refresh,
  }
}
