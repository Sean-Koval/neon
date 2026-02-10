'use client'

import { clsx } from 'clsx'
import { Clock, MessageSquare, Star } from 'lucide-react'
import { useCallback, useState } from 'react'
import { trpc } from '@/lib/trpc'

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function FeedbackHistory() {
  const [limit, setLimit] = useState(20)
  const { data, isLoading } = trpc.feedback.list.useQuery({ limit, offset: 0 })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadMore = useCallback(() => {
    setLimit((l) => l + 20)
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-surface-overlay rounded-lg" />
        ))}
      </div>
    )
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MessageSquare className="w-10 h-10 text-content-muted mb-3" />
        <h3 className="text-lg font-medium text-content-primary">No feedback yet</h3>
        <p className="text-sm text-content-muted mt-2 max-w-sm">
          Submit preferences or corrections to see your feedback history here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-raised/50">
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Type</th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Choice/Action</th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Confidence</th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Time</th>
                <th className="text-left py-3 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isExpanded = expandedId === item.id
                return (
                  <tr key={item.id} className="contents">
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className={clsx(
                        'border-b border-border/50 last:border-0 cursor-pointer transition-colors',
                        isExpanded ? 'bg-surface-overlay/30' : 'hover:bg-surface-overlay/50',
                      )}
                    >
                      <td className="py-3 px-4">
                        <span className={clsx(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          item.type === 'preference'
                            ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                            : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
                        )}>
                          {item.type === 'preference' ? 'pref' : 'correct'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-content-primary">
                        {item.type === 'preference' && item.preference ? (
                          <span>
                            {item.preference.choice === 'A' || item.preference.choice === 'B'
                              ? `Chose ${item.preference.choice}`
                              : item.preference.choice === 'tie'
                                ? 'Tie'
                                : 'Both Bad'}
                          </span>
                        ) : item.correction?.correction_types?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {item.correction.correction_types.map((t) => (
                              <span key={t} className="text-xs bg-surface-overlay px-1.5 py-0.5 rounded text-content-secondary">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-content-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {item.type === 'preference' && item.preference?.confidence != null ? (
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={clsx(
                                  'w-3.5 h-3.5',
                                  s <= Math.round(item.preference!.confidence! * 5)
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-content-muted',
                                )}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-content-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-content-muted">
                        {item.type === 'preference' && item.preference?.decision_time_ms
                          ? `${(item.preference.decision_time_ms / 1000).toFixed(1)}s`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-content-muted">
                        {relativeTime(item.created_at)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-overlay/20">
                        <td colSpan={5} className="p-4">
                          {item.type === 'preference' && item.preference ? (
                            <div className="space-y-2 text-sm">
                              {item.preference.reason && (
                                <p className="text-content-secondary">
                                  <span className="text-content-muted">Reason:</span> {item.preference.reason}
                                </p>
                              )}
                              <p className="text-content-muted text-xs">
                                Comparison ID: {item.preference.comparison_id}
                              </p>
                            </div>
                          ) : item.correction ? (
                            <div className="space-y-3 text-sm">
                              {item.correction.change_summary && (
                                <p className="text-content-secondary">
                                  <span className="text-content-muted">Summary:</span> {item.correction.change_summary}
                                </p>
                              )}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs text-content-muted mb-1">Original</p>
                                  <pre className="text-xs text-content-secondary bg-surface-overlay/30 rounded-md p-2 whitespace-pre-wrap max-h-32 overflow-auto">
                                    {item.correction.original_content}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-xs text-content-muted mb-1">Corrected</p>
                                  <pre className="text-xs text-content-secondary bg-emerald-500/5 border border-emerald-500/20 rounded-md p-2 whitespace-pre-wrap max-h-32 overflow-auto">
                                    {item.correction.corrected_content}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {items.length < total && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-content-muted">
            Showing {items.length} of {total}
          </span>
          <button type="button" onClick={loadMore} className="btn btn-secondary text-sm">
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
