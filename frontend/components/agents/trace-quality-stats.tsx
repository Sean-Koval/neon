'use client'

import { clsx } from 'clsx'
import { trpc } from '@/lib/trpc'

interface TraceQualityStatsProps {
  agentId: string
  days: number
}

export function TraceQualityStats({ agentId, days }: TraceQualityStatsProps) {
  const { data, isLoading } = trpc.agents.getTraceQualityStats.useQuery({
    agentId,
    days,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-surface-default rounded-lg border border-border p-4 animate-pulse"
          >
            <div className="h-4 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
            <div className="mt-3 h-8 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  const lowScorePercent =
    data.totalTraces > 0 ? (data.lowScoreCount / data.totalTraces) * 100 : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-sm text-content-secondary">Traces ({days}d)</p>
        <p className="mt-1 text-2xl font-bold text-content-primary">
          {data.totalTraces.toLocaleString()}
        </p>
      </div>

      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-sm text-content-secondary">Avg Score</p>
        <p
          className={clsx(
            'mt-1 text-2xl font-bold',
            data.avgScore >= 0.85
              ? 'text-emerald-600 dark:text-emerald-400'
              : data.avgScore >= 0.7
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400',
          )}
        >
          {data.scoredTraces > 0 ? data.avgScore.toFixed(2) : '--'}
        </p>
      </div>

      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-sm text-content-secondary">Low-Score Traces</p>
        <p
          className={clsx(
            'mt-1 text-2xl font-bold',
            lowScorePercent > 5
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-content-primary',
          )}
        >
          {data.lowScoreCount}
          {data.totalTraces > 0 && (
            <span className="text-sm font-normal text-content-muted ml-1">
              ({lowScorePercent.toFixed(1)}%)
            </span>
          )}
        </p>
      </div>

      <div className="bg-surface-default rounded-lg border border-border p-4">
        <p className="text-sm text-content-secondary">Loop Detections</p>
        <p
          className={clsx(
            'mt-1 text-2xl font-bold',
            data.loopDetections > 0
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-content-primary',
          )}
        >
          {data.loopDetections}
        </p>
      </div>
    </div>
  )
}
