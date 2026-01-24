/**
 * Custom hook for fetching and managing runs data
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { EvalRun, GroupedRuns } from '@/types'

interface UseRunsOptions {
  suiteId?: string
  status?: string
  limit?: number
  enabled?: boolean
}

export function useRuns(options: UseRunsOptions = {}) {
  const { suiteId, status, limit = 100, enabled = true } = options

  return useQuery({
    queryKey: ['runs', { suiteId, status, limit }],
    queryFn: () => api.getRuns({ suiteId, status, limit }),
    enabled,
    staleTime: 30 * 1000, // 30 seconds
  })
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId as string),
    enabled: !!runId,
  })
}

/**
 * Groups runs by suite name for display in selectors
 */
export function groupRunsBySuite(runs: EvalRun[]): GroupedRuns[] {
  const grouped = new Map<string, GroupedRuns>()

  for (const run of runs) {
    const existing = grouped.get(run.suite_id)
    if (existing) {
      existing.runs.push(run)
    } else {
      grouped.set(run.suite_id, {
        suiteName: run.suite_name,
        suiteId: run.suite_id,
        runs: [run],
      })
    }
  }

  // Sort groups by suite name and runs by date (most recent first)
  const result = Array.from(grouped.values())
  result.sort((a, b) => a.suiteName.localeCompare(b.suiteName))

  for (const group of result) {
    group.runs.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }

  return result
}

/**
 * Get unique suite names from runs
 */
export function getUniqueSuites(runs: EvalRun[]): string[] {
  const suites = new Set<string>()
  for (const run of runs) {
    suites.add(run.suite_name)
  }
  return Array.from(suites).sort()
}
