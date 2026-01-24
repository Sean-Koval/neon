'use client'

import { useQuery } from '@tanstack/react-query'

// Types for run data
export interface Run {
  id: string
  suite_id: string
  suite_name: string
  version: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  passed: number
  total: number
  score: number
  created_at: string
}

export interface ScoreTrendPoint {
  date: string
  displayDate: string
  score: number
  runCount: number
}

// Mock data for development - replace with actual API call
function generateMockRuns(): Run[] {
  const suites = ['core-tests', 'regression-suite', 'integration-tests']
  const runs: Run[] = []
  const now = new Date()

  for (let i = 0; i < 25; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() - Math.floor(i / 3))
    date.setHours(date.getHours() - (i % 3) * 4)

    const total = 10 + Math.floor(Math.random() * 10)
    const passed = Math.floor(total * (0.7 + Math.random() * 0.25))
    const score = 0.65 + Math.random() * 0.3

    runs.push({
      id: `run-${i + 1}`,
      suite_id: `suite-${(i % 3) + 1}`,
      suite_name: suites[i % 3],
      version: `v${Math.floor(i / 5) + 1}.${i % 5}.0`,
      status: i === 0 ? 'running' : 'completed',
      passed,
      total,
      score: Math.round(score * 100) / 100,
      created_at: date.toISOString(),
    })
  }

  return runs
}

async function fetchRuns(): Promise<Run[]> {
  // TODO: Replace with actual API call
  // const response = await fetch('/api/runs')
  // if (!response.ok) throw new Error('Failed to fetch runs')
  // return response.json()

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800))
  return generateMockRuns()
}

export function useRuns() {
  return useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
  })
}

export function useRecentRuns(limit = 10) {
  return useQuery({
    queryKey: ['runs', 'recent', limit],
    queryFn: async () => {
      const runs = await fetchRuns()
      return runs.slice(0, limit)
    },
  })
}

// Hook for score trend data with aggregation
export function useScoreTrend(options: { days?: number; maxRuns?: number } = {}) {
  const { days = 7, maxRuns = 10 } = options

  return useQuery({
    queryKey: ['score-trend', { days, maxRuns }],
    queryFn: async (): Promise<ScoreTrendPoint[]> => {
      const runs = await fetchRuns()

      // Filter to completed runs only
      const completedRuns = runs.filter((r) => r.status === 'completed')

      // Sort by date descending
      const sortedRuns = completedRuns.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      // Get runs from last N days
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      const recentRuns = sortedRuns.filter(
        (r) => new Date(r.created_at) >= cutoffDate
      )

      // Take at most maxRuns if we have fewer days of data
      const runsToAggregate = recentRuns.length > 0 ? recentRuns : sortedRuns.slice(0, maxRuns)

      // Aggregate by day
      const dailyData = new Map<string, { scores: number[]; date: Date }>()

      runsToAggregate.forEach((run) => {
        const date = new Date(run.created_at)
        const dateKey = date.toISOString().split('T')[0]

        if (!dailyData.has(dateKey)) {
          dailyData.set(dateKey, { scores: [], date })
        }
        dailyData.get(dateKey)!.scores.push(run.score)
      })

      // Convert to array and calculate averages
      const trendPoints: ScoreTrendPoint[] = Array.from(dailyData.entries())
        .map(([dateKey, data]) => ({
          date: dateKey,
          displayDate: data.date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          score: Math.round(
            (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100
          ) / 100,
          runCount: data.scores.length,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))

      return trendPoints
    },
  })
}
