/**
 * React Query hooks for score trend operations.
 *
 * Provides comprehensive score analytics including:
 * - Score trends over time with configurable ranges
 * - Regression detection
 * - Statistical summaries
 * - Grouping by suite/scorer
 */

import { useMemo } from 'react'
import type { EvalRun, ScorerType } from '@/lib/types'
import { useRuns } from './use-runs'

// =============================================================================
// Types
// =============================================================================

export type TimeRange = '7d' | '30d' | '90d' | 'custom'

export interface ScoreTrendDataPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string
  /** Human readable date */
  displayDate: string
  /** Average score for this date */
  avgScore: number
  /** Number of runs on this date */
  runCount: number
  /** Individual run IDs on this date */
  runIds: string[]
  /** Minimum score on this date */
  minScore: number
  /** Maximum score on this date */
  maxScore: number
  /** Whether this point represents a regression */
  isRegression: boolean
  /** Change from previous point */
  delta: number
}

export interface RegressionPoint {
  /** Date of regression */
  date: string
  /** Score value at regression */
  score: number
  /** Previous score */
  previousScore: number
  /** Delta (negative = regression) */
  delta: number
  /** Percentage drop */
  percentageDrop: number
  /** Run IDs involved */
  runIds: string[]
}

export interface ScoreStatistics {
  /** Average score over the period */
  mean: number
  /** Standard deviation */
  stdDev: number
  /** Median score */
  median: number
  /** Minimum score */
  min: number
  /** Maximum score */
  max: number
  /** Total number of data points */
  count: number
  /** Trend direction: 'up', 'down', or 'stable' */
  trendDirection: 'up' | 'down' | 'stable'
  /** Trend slope (positive = improving) */
  trendSlope: number
  /** Coefficient of variation (stdDev / mean) */
  cv: number
}

export interface ScoreBySuite {
  suiteId: string
  suiteName: string
  avgScore: number
  runCount: number
  trendDirection: 'up' | 'down' | 'stable'
  lastScore: number
}

export interface ScoreByScorer {
  scorer: ScorerType
  avgScore: number
  runCount: number
  trend: 'up' | 'down' | 'stable'
}

export interface UseScoreTrendsOptions {
  /** Time range for data */
  timeRange?: TimeRange
  /** Custom number of days (used when timeRange is 'custom') */
  customDays?: number
  /** Minimum score drop to count as regression (0-1) */
  regressionThreshold?: number
  /** Filter by suite ID */
  suiteId?: string
  /** Maximum runs to fetch */
  maxRuns?: number
  /** Enable detailed statistics calculation */
  includeStats?: boolean
}

export interface UseScoreTrendsResult {
  /** Trend data points for charting */
  data: ScoreTrendDataPoint[]
  /** Detected regressions */
  regressions: RegressionPoint[]
  /** Statistical summary */
  statistics: ScoreStatistics | null
  /** Scores grouped by suite */
  bySuite: ScoreBySuite[]
  /** Scores grouped by scorer type */
  byScorer: ScoreByScorer[]
  /** Raw runs data */
  runs: EvalRun[]
  /** Loading state */
  isLoading: boolean
  /** Error state */
  isError: boolean
  /** Error object */
  error: Error | null
  /** Refetch function */
  refetch: () => void
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert time range to number of days
 */
function getTimeRangeDays(timeRange: TimeRange, customDays?: number): number {
  switch (timeRange) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
    case 'custom':
      return customDays ?? 30
  }
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const squaredDiffs = values.map((v) => (v - mean) ** 2)
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(avgSquaredDiff)
}

/**
 * Calculate median
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Calculate trend slope using simple linear regression
 */
function calculateTrendSlope(values: number[]): number {
  if (values.length < 2) return 0

  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean)
    denominator += (i - xMean) ** 2
  }

  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * Determine trend direction from slope
 */
function getTrendDirection(
  slope: number,
  threshold = 0.005,
): 'up' | 'down' | 'stable' {
  if (slope > threshold) return 'up'
  if (slope < -threshold) return 'down'
  return 'stable'
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Hook for fetching and analyzing score trends.
 *
 * Provides:
 * - Time-series data for charting
 * - Regression detection
 * - Statistical analysis
 * - Grouping by suite/scorer
 */
export function useScoreTrends(
  options: UseScoreTrendsOptions = {},
): UseScoreTrendsResult {
  const {
    timeRange = '30d',
    customDays,
    regressionThreshold = 0.05,
    suiteId,
    maxRuns = 200,
    includeStats = true,
  } = options

  const days = getTimeRangeDays(timeRange, customDays)

  // Fetch runs from API
  const {
    data: runsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useRuns({ limit: maxRuns, suite_id: suiteId })
  const allRuns = runsData?.items ?? []

  // Process data into trend points
  const { data, regressions, statistics, bySuite, byScorer, runs } =
    useMemo(() => {
      // Filter to completed runs with scores within date range
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)

      let filteredRuns = allRuns.filter(
        (run) =>
          run.status === 'completed' &&
          run.summary &&
          new Date(run.created_at) >= cutoff,
      )

      // Apply suite filter if specified
      if (suiteId) {
        filteredRuns = filteredRuns.filter((run) => run.suite_id === suiteId)
      }

      // Sort by date ascending
      filteredRuns.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )

      if (filteredRuns.length === 0) {
        return {
          data: [],
          regressions: [],
          statistics: null,
          bySuite: [],
          byScorer: [],
          runs: [],
        }
      }

      // Group by date
      const byDate = new Map<
        string,
        {
          scores: number[]
          runIds: string[]
          runs: EvalRun[]
        }
      >()

      for (const run of filteredRuns) {
        const dateKey = new Date(run.created_at).toISOString().split('T')[0]
        const score = run.summary?.avg_score ?? 0
        const existing = byDate.get(dateKey)

        if (existing) {
          existing.scores.push(score)
          existing.runIds.push(run.id)
          existing.runs.push(run)
        } else {
          byDate.set(dateKey, {
            scores: [score],
            runIds: [run.id],
            runs: [run],
          })
        }
      }

      // Convert to trend data points
      const sortedDates = Array.from(byDate.keys()).sort()
      const trendData: ScoreTrendDataPoint[] = []
      const detectedRegressions: RegressionPoint[] = []

      let previousAvgScore: number | null = null

      for (const date of sortedDates) {
        const dayData = byDate.get(date)
        if (!dayData) continue
        const avgScore =
          dayData.scores.reduce((a, b) => a + b, 0) / dayData.scores.length
        const minScore = Math.min(...dayData.scores)
        const maxScore = Math.max(...dayData.scores)

        const delta =
          previousAvgScore !== null ? avgScore - previousAvgScore : 0
        const isRegression =
          previousAvgScore !== null && delta < -regressionThreshold

        if (isRegression && previousAvgScore !== null) {
          detectedRegressions.push({
            date,
            score: avgScore,
            previousScore: previousAvgScore,
            delta,
            percentageDrop: Math.abs(delta / previousAvgScore) * 100,
            runIds: dayData.runIds,
          })
        }

        const dateObj = new Date(date)
        trendData.push({
          date,
          displayDate: dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          avgScore,
          runCount: dayData.scores.length,
          runIds: dayData.runIds,
          minScore,
          maxScore,
          isRegression,
          delta,
        })

        previousAvgScore = avgScore
      }

      // Calculate statistics
      let stats: ScoreStatistics | null = null

      if (includeStats && trendData.length > 0) {
        const allScores = filteredRuns
          .map((r) => r.summary?.avg_score ?? 0)
          .filter((s) => s > 0)

        if (allScores.length > 0) {
          const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length
          const stdDev = calculateStdDev(allScores, mean)
          const median = calculateMedian(allScores)
          const min = Math.min(...allScores)
          const max = Math.max(...allScores)
          const trendSlope = calculateTrendSlope(allScores)
          const trendDirection = getTrendDirection(trendSlope)

          stats = {
            mean,
            stdDev,
            median,
            min,
            max,
            count: allScores.length,
            trendDirection,
            trendSlope,
            cv: mean > 0 ? stdDev / mean : 0,
          }
        }
      }

      // Group by suite
      const suiteMap = new Map<
        string,
        { name: string; scores: number[]; lastScore: number }
      >()
      for (const run of filteredRuns) {
        const existing = suiteMap.get(run.suite_id)
        const score = run.summary?.avg_score ?? 0
        if (existing) {
          existing.scores.push(score)
          existing.lastScore = score
        } else {
          suiteMap.set(run.suite_id, {
            name: run.suite_name,
            scores: [score],
            lastScore: score,
          })
        }
      }

      const bySuiteData: ScoreBySuite[] = Array.from(suiteMap.entries()).map(
        ([suiteId, data]) => ({
          suiteId,
          suiteName: data.name,
          avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
          runCount: data.scores.length,
          trendDirection: getTrendDirection(calculateTrendSlope(data.scores)),
          lastScore: data.lastScore,
        }),
      )

      // Group by scorer (from run summaries)
      const scorerMap = new Map<ScorerType, number[]>()
      for (const run of filteredRuns) {
        if (run.summary?.scores_by_type) {
          for (const [scorer, score] of Object.entries(
            run.summary.scores_by_type,
          )) {
            const existing = scorerMap.get(scorer as ScorerType)
            if (existing) {
              existing.push(score)
            } else {
              scorerMap.set(scorer as ScorerType, [score])
            }
          }
        }
      }

      const byScorerData: ScoreByScorer[] = Array.from(scorerMap.entries()).map(
        ([scorer, scores]) => ({
          scorer,
          avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
          runCount: scores.length,
          trend: getTrendDirection(calculateTrendSlope(scores)),
        }),
      )

      return {
        data: trendData,
        regressions: detectedRegressions,
        statistics: stats,
        bySuite: bySuiteData,
        byScorer: byScorerData,
        runs: filteredRuns,
      }
    }, [allRuns, days, suiteId, regressionThreshold, includeStats])

  return {
    data,
    regressions,
    statistics,
    bySuite,
    byScorer,
    runs,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  }
}

// =============================================================================
// Export Data Utilities
// =============================================================================

export interface ExportOptions {
  format: 'csv' | 'json'
  includeRuns?: boolean
  includeStats?: boolean
}

/**
 * Export score trend data as CSV
 */
export function exportToCSV(
  data: ScoreTrendDataPoint[],
  statistics?: ScoreStatistics | null,
): string {
  const headers = [
    'Date',
    'Average Score',
    'Min Score',
    'Max Score',
    'Run Count',
    'Is Regression',
    'Delta',
  ]
  const rows = data.map((d) => [
    d.date,
    d.avgScore.toFixed(4),
    d.minScore.toFixed(4),
    d.maxScore.toFixed(4),
    d.runCount.toString(),
    d.isRegression ? 'Yes' : 'No',
    d.delta.toFixed(4),
  ])

  let csv = `${headers.join(',')}\n${rows.map((r) => r.join(',')).join('\n')}`

  if (statistics) {
    csv +=
      '\n\nStatistics\n' +
      `Mean,${statistics.mean.toFixed(4)}\n` +
      `Std Dev,${statistics.stdDev.toFixed(4)}\n` +
      `Median,${statistics.median.toFixed(4)}\n` +
      `Min,${statistics.min.toFixed(4)}\n` +
      `Max,${statistics.max.toFixed(4)}\n` +
      `Count,${statistics.count}\n` +
      `Trend,${statistics.trendDirection}`
  }

  return csv
}

/**
 * Export score trend data as JSON
 */
export function exportToJSON(
  data: ScoreTrendDataPoint[],
  statistics?: ScoreStatistics | null,
  regressions?: RegressionPoint[],
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      dataPoints: data,
      statistics,
      regressions,
    },
    null,
    2,
  )
}

/**
 * Trigger browser download
 */
export function downloadData(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
