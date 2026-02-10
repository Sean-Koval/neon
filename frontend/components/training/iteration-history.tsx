'use client'

import { clsx } from 'clsx'
import { Fragment, useCallback, useState } from 'react'
import { trpc } from '@/lib/trpc'

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

const OUTCOME_BADGE: Record<string, string> = {
  deployed:
    'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  rejected: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400',
  skipped: 'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400',
  aborted: 'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400',
  failed: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400',
}

interface IterationHistoryProps {
  agentId?: string
}

export function IterationHistory({ agentId }: IterationHistoryProps) {
  const [limit, setLimit] = useState(10)
  const { data, isLoading } = trpc.trainingLoops.iterationHistory.useQuery({
    agentId,
    limit,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadMore = useCallback(() => {
    setLimit((l) => l + 10)
  }, [])

  const iterations = data?.iterations ?? []
  const total = data?.total ?? 0

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {['sk-1', 'sk-2', 'sk-3'].map((key) => (
          <div key={key} className="h-12 bg-surface-overlay rounded-lg" />
        ))}
      </div>
    )
  }

  if (!iterations.length) {
    return (
      <div className="text-sm text-content-muted py-4">
        No completed iterations yet. Results will appear here as loops complete
        their cycles.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-raised/50">
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">
                  Agent
                </th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">
                  Strategy
                </th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">
                  Score &Delta;
                </th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {iterations.map((iter) => {
                const isExpanded = expandedId === iter.id
                return (
                  <Fragment key={iter.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : iter.id)}
                      className={clsx(
                        'border-b border-border/50 last:border-0 cursor-pointer transition-colors',
                        isExpanded
                          ? 'bg-surface-overlay/30'
                          : 'hover:bg-surface-overlay/50',
                      )}
                    >
                      <td className="py-3 px-4 text-content-primary font-medium">
                        {iter.agentName}
                      </td>
                      <td className="py-3 px-4 text-content-secondary font-mono text-xs">
                        {iter.strategy.replace('_', ' ')}
                      </td>
                      <td
                        className={clsx(
                          'py-3 px-4 font-semibold',
                          iter.scoreDelta >= 0
                            ? 'text-emerald-500'
                            : 'text-rose-500',
                        )}
                      >
                        {iter.scoreDelta >= 0 ? '+' : ''}
                        {iter.scoreDelta.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={clsx(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            OUTCOME_BADGE[iter.outcome] ||
                              OUTCOME_BADGE.skipped,
                          )}
                        >
                          {iter.outcome}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-content-muted">
                        {relativeTime(iter.startedAt)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-overlay/20">
                        <td colSpan={5} className="p-4">
                          <div className="grid grid-cols-2 gap-y-2 text-sm">
                            <span className="text-content-muted">
                              Iteration
                            </span>
                            <span className="text-content-primary">
                              {iter.iteration}
                            </span>
                            <span className="text-content-muted">
                              Agent Version
                            </span>
                            <span className="text-content-primary">
                              {iter.agentVersion}
                            </span>
                            <span className="text-content-muted">Duration</span>
                            <span className="text-content-primary">
                              {formatDuration(iter.durationMs)}
                            </span>
                            <span className="text-content-muted">Loop ID</span>
                            <span className="text-content-primary font-mono text-xs">
                              {iter.loopId}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {iterations.length < total && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-content-muted">
            Showing {iterations.length} of {total} iterations
          </span>
          <button
            type="button"
            onClick={loadMore}
            className="btn btn-secondary text-sm"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
