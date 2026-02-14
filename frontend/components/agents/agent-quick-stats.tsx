'use client'

import { clsx } from 'clsx'

interface AgentQuickStatsProps {
  traceCount?: number
  avgScore?: number
  errorRate?: number
  p50Latency?: number
  isLoading?: boolean
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-500'
  if (score >= 70) return 'text-amber-500'
  return 'text-rose-500'
}

function getErrorRateColor(rate: number): string {
  if (rate < 5) return 'text-emerald-500'
  if (rate < 15) return 'text-amber-500'
  return 'text-rose-500'
}

function getLatencyColor(ms: number): string {
  if (ms < 500) return 'text-emerald-500'
  if (ms < 2000) return 'text-amber-500'
  return 'text-rose-500'
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function SkeletonCard() {
  return (
    <div className="bg-surface-default rounded-lg border border-border p-4 animate-pulse">
      <div className="h-3 w-16 bg-gray-200 dark:bg-dark-700 rounded mb-3" />
      <div className="h-7 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
    </div>
  )
}

export function AgentQuickStats({
  traceCount,
  avgScore,
  errorRate,
  p50Latency,
  isLoading,
}: AgentQuickStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-xs text-content-muted uppercase tracking-wider mb-1">
          Traces (7d)
        </p>
        <p className="text-2xl font-bold text-content-primary">
          {traceCount?.toLocaleString() ?? '—'}
        </p>
      </div>

      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-xs text-content-muted uppercase tracking-wider mb-1">
          Avg Score
        </p>
        <p
          className={clsx(
            'text-2xl font-bold',
            avgScore != null ? getScoreColor(avgScore) : 'text-content-primary',
          )}
        >
          {avgScore != null ? `${avgScore.toFixed(1)}%` : '—'}
        </p>
      </div>

      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-xs text-content-muted uppercase tracking-wider mb-1">
          Error Rate
        </p>
        <p
          className={clsx(
            'text-2xl font-bold',
            errorRate != null
              ? getErrorRateColor(errorRate)
              : 'text-content-primary',
          )}
        >
          {errorRate != null ? `${errorRate.toFixed(1)}%` : '—'}
        </p>
      </div>

      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-xs text-content-muted uppercase tracking-wider mb-1">
          P50 Latency
        </p>
        <p
          className={clsx(
            'text-2xl font-bold',
            p50Latency != null
              ? getLatencyColor(p50Latency)
              : 'text-content-primary',
          )}
        >
          {p50Latency != null ? formatLatency(p50Latency) : '—'}
        </p>
      </div>
    </div>
  )
}
