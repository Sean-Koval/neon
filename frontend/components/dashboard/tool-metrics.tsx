'use client'

import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  Wrench,
  XCircle,
} from 'lucide-react'
import { useMemo } from 'react'

// =============================================================================
// Types
// =============================================================================

/**
 * Tool usage statistics from the analytics API
 */
export interface ToolMetric {
  toolName: string
  callCount: number
  successCount: number
  failureCount: number
  avgLatencyMs: number
  p50LatencyMs?: number
  p95LatencyMs?: number
  lastUsed?: string
}

/**
 * Summary metrics for all tools
 */
export interface ToolMetricsSummary {
  totalCalls: number
  totalTools: number
  overallSuccessRate: number
  avgLatencyMs: number
}

interface ToolMetricsResponse {
  tools: ToolMetric[]
  summary: ToolMetricsSummary
  queryTimeMs?: number
}

// =============================================================================
// Data Fetching Hook
// =============================================================================

interface UseToolMetricsOptions {
  days?: number
  enabled?: boolean
}

/**
 * Hook for fetching tool execution metrics.
 * Uses the dashboard API to get aggregated tool statistics.
 */
export function useToolMetrics(options: UseToolMetricsOptions = {}) {
  const { days = 7, enabled = true } = options

  return useQuery<ToolMetricsResponse>({
    queryKey: ['tool-metrics', days],
    queryFn: async () => {
      const params = new URLSearchParams({ days: String(days) })
      const response = await fetch(`/api/dashboard/tool-metrics?${params}`)

      if (!response.ok) {
        // If endpoint doesn't exist yet, return mock data
        if (response.status === 404) {
          return getMockToolMetrics()
        }
        throw new Error(`Failed to fetch tool metrics: ${response.statusText}`)
      }

      return response.json()
    },
    staleTime: 60 * 1000, // 1 minute
    enabled,
  })
}

/**
 * Mock data for when the API endpoint isn't available yet.
 * This allows the dashboard to render while the backend is being implemented.
 */
function getMockToolMetrics(): ToolMetricsResponse {
  return {
    tools: [
      {
        toolName: 'web_search',
        callCount: 156,
        successCount: 148,
        failureCount: 8,
        avgLatencyMs: 1250,
        p50LatencyMs: 980,
        p95LatencyMs: 2100,
      },
      {
        toolName: 'code_execute',
        callCount: 89,
        successCount: 82,
        failureCount: 7,
        avgLatencyMs: 3200,
        p50LatencyMs: 2800,
        p95LatencyMs: 5500,
      },
      {
        toolName: 'file_read',
        callCount: 234,
        successCount: 232,
        failureCount: 2,
        avgLatencyMs: 45,
        p50LatencyMs: 32,
        p95LatencyMs: 120,
      },
      {
        toolName: 'api_call',
        callCount: 67,
        successCount: 58,
        failureCount: 9,
        avgLatencyMs: 890,
        p50LatencyMs: 650,
        p95LatencyMs: 1800,
      },
    ],
    summary: {
      totalCalls: 546,
      totalTools: 4,
      overallSuccessRate: 95.2,
      avgLatencyMs: 1346,
    },
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format duration in human-readable format
 */
function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${Math.round(ms)}ms`
}

/**
 * Calculate success rate percentage
 */
function getSuccessRate(metric: ToolMetric): number {
  if (metric.callCount === 0) return 0
  return (metric.successCount / metric.callCount) * 100
}

/**
 * Get color class based on success rate
 */
function getSuccessRateColor(rate: number): string {
  if (rate >= 95) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 80) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

/**
 * Get color class based on latency
 */
function getLatencyColor(ms: number): string {
  if (ms < 500) return 'text-emerald-600 dark:text-emerald-400'
  if (ms < 2000) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

// =============================================================================
// Components
// =============================================================================

function ToolMetricsSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-32 bg-gray-200 dark:bg-dark-700 rounded" />
        <div className="h-8 w-8 bg-gray-200 dark:bg-dark-700 rounded-lg" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-4 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
            <div className="flex gap-4">
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface ToolMetricsErrorProps {
  error: Error
  onRetry: () => void
}

function ToolMetricsError({ error, onRetry }: ToolMetricsErrorProps) {
  return (
    <div className="card p-6 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25">
      <div className="flex items-center space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
            Failed to load tool metrics
          </h3>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error.message}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-400 bg-white dark:bg-dark-800 border border-red-300 dark:border-red-500/25 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  )
}

function ToolMetricsEmpty() {
  return (
    <div className="card p-8 text-center">
      <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-gray-100 dark:from-dark-800 to-gray-200 dark:to-dark-700 flex items-center justify-center">
        <Wrench className="w-6 h-6 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
        No tool data yet
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Tool metrics will appear here once agents start using tools.
      </p>
    </div>
  )
}

interface ToolRowProps {
  metric: ToolMetric
  maxCalls: number
}

function ToolRow({ metric, maxCalls }: ToolRowProps) {
  const successRate = getSuccessRate(metric)
  const barWidth = maxCalls > 0 ? (metric.callCount / maxCalls) * 100 : 0

  return (
    <div className="group py-3 border-b border-gray-100 dark:border-dark-700 last:border-0 hover:bg-gray-50/50 dark:hover:bg-dark-700/50 -mx-2 px-2 rounded transition-colors">
      <div className="flex items-center justify-between">
        {/* Tool name with usage bar */}
        <div className="flex-1 min-w-0 mr-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {metric.toolName}
            </span>
          </div>
          {/* Usage bar */}
          <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-dark-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-6 text-sm flex-shrink-0">
          {/* Call count */}
          <div className="text-right w-16">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {metric.callCount.toLocaleString()}
            </span>
            <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">calls</span>
          </div>

          {/* Success rate */}
          <div className="flex items-center gap-1 w-20">
            {successRate >= 95 ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            ) : successRate >= 80 ? (
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
            )}
            <span className={`font-medium ${getSuccessRateColor(successRate)}`}>
              {successRate.toFixed(1)}%
            </span>
          </div>

          {/* Latency */}
          <div className="flex items-center gap-1 w-20 text-right">
            <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <span
              className={`font-medium ${getLatencyColor(metric.avgLatencyMs)}`}
            >
              {formatLatency(metric.avgLatencyMs)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SummaryCardsProps {
  summary: ToolMetricsSummary
}

function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {summary.totalCalls.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Total Calls</div>
      </div>
      <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {summary.totalTools}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Unique Tools</div>
      </div>
      <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 text-center">
        <div
          className={`text-2xl font-bold ${getSuccessRateColor(summary.overallSuccessRate)}`}
        >
          {summary.overallSuccessRate.toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Success Rate</div>
      </div>
      <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 text-center">
        <div
          className={`text-2xl font-bold ${getLatencyColor(summary.avgLatencyMs)}`}
        >
          {formatLatency(summary.avgLatencyMs)}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Avg Latency</div>
      </div>
    </div>
  )
}

interface ToolMetricsContentProps {
  data: ToolMetricsResponse
}

function ToolMetricsContent({ data }: ToolMetricsContentProps) {
  // Sort tools by call count (most used first)
  const sortedTools = useMemo(() => {
    return [...data.tools].sort((a, b) => b.callCount - a.callCount)
  }, [data.tools])

  const maxCalls = sortedTools[0]?.callCount ?? 0

  return (
    <>
      <SummaryCards summary={data.summary} />

      {/* Tools list header */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-2 px-2">
        <span>Tool</span>
        <div className="flex items-center gap-6">
          <span className="w-16 text-right">Usage</span>
          <span className="w-20">Success</span>
          <span className="w-20 text-right">Latency</span>
        </div>
      </div>

      {/* Tools list */}
      <div className="max-h-[300px] overflow-y-auto">
        {sortedTools.map((metric) => (
          <ToolRow key={metric.toolName} metric={metric} maxCalls={maxCalls} />
        ))}
      </div>
    </>
  )
}

// =============================================================================
// Main Component
// =============================================================================

interface ToolMetricsCardProps {
  days?: number
  className?: string
}

/**
 * Dashboard card showing tool execution metrics.
 * Displays most used tools, success/failure rates, and average latency.
 */
export function ToolMetricsCard({
  days = 7,
  className = '',
}: ToolMetricsCardProps) {
  const { data, isLoading, error, refetch } = useToolMetrics({ days })

  return (
    <div className={`card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-dark-700 bg-gradient-to-r from-gray-50 dark:from-dark-900 to-white dark:to-dark-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Tool Metrics
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Last {days} days • Skill and tool execution stats
            </p>
          </div>
          <div className="p-2 rounded-lg bg-gradient-to-br from-gray-50 dark:from-dark-900 to-gray-100 dark:to-dark-800">
            <Wrench className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <ToolMetricsSkeleton />
        ) : error ? (
          <ToolMetricsError error={error as Error} onRetry={() => refetch()} />
        ) : !data || data.tools.length === 0 ? (
          <ToolMetricsEmpty />
        ) : (
          <ToolMetricsContent data={data} />
        )}
      </div>
    </div>
  )
}

// Export individual components for flexibility
export {
  ToolMetricsSkeleton,
  ToolMetricsError,
  ToolMetricsEmpty,
  ToolMetricsContent,
  SummaryCards,
  ToolRow,
  formatLatency,
  getSuccessRate,
  getSuccessRateColor,
  getLatencyColor,
}
