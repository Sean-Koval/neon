'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import type { DashboardStats, EvalRun } from '@/lib/types'

/**
 * Hook for fetching runs list
 */
export function useRuns(params?: {
  suite_id?: string
  status_filter?: string
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: ['runs', params],
    queryFn: () => api.getRuns(params),
  })
}

/**
 * Hook for fetching runs with pagination info
 */
export function useRunsList(params?: {
  suite_id?: string
  status_filter?: string
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: ['runs-list', params],
    queryFn: () => api.getRunsList(params),
  })
}

/**
 * Compute dashboard stats from a list of runs
 */
function computeStats(runs: EvalRun[]): DashboardStats {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      passedPercentage: 0,
      failedPercentage: 0,
      averageScore: 0,
    }
  }

  // Count runs by outcome
  // A run is "passed" if status is completed and all cases passed (summary.failed + summary.errored === 0)
  // A run is "failed" if status is failed OR (completed with failures)
  let passedRuns = 0
  let failedRuns = 0
  let totalScore = 0
  let runsWithScores = 0

  for (const run of runs) {
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
    // pending, running, cancelled don't count as passed or failed
  }

  const totalRuns = runs.length
  const passedPercentage = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0
  const failedPercentage = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0
  const averageScore = runsWithScores > 0 ? totalScore / runsWithScores : 0

  return {
    totalRuns,
    passedRuns,
    failedRuns,
    passedPercentage,
    failedPercentage,
    averageScore,
  }
}

/**
 * Hook for fetching dashboard stats
 * Fetches all runs and computes aggregate statistics
 */
export function useDashboardStats() {
  const { data: runs, isLoading, error, refetch } = useRuns({ limit: 1000 })

  const stats = useMemo(() => {
    if (!runs) return null
    return computeStats(runs)
  }, [runs])

  return {
    stats,
    isLoading,
    error,
    refetch,
  }
}

/**
 * Hook for fetching recent runs for the dashboard
 */
export function useRecentRuns(limit = 5) {
  return useQuery({
    queryKey: ['recent-runs', limit],
    queryFn: () => api.getRuns({ limit }),
    refetchInterval: 30000, // Refresh every 30 seconds to catch new runs
  })
}
