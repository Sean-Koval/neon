'use client'

import { clsx } from 'clsx'
import { Database, Loader2, MoreVertical, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const FORMAT_BADGE: Record<string, string> = {
  sft: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  dpo: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  kto: 'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400',
  dspy: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
}

interface DatasetCardsProps {
  agentId?: string
  onSelectDataset?: (id: string) => void
  onExportDataset?: (id: string) => void
}

export function DatasetCards({ agentId, onSelectDataset, onExportDataset }: DatasetCardsProps) {
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data, isLoading, refetch } = trpc.datasets.list.useQuery({
    agentId,
    search: search || undefined,
  })
  const deleteMutation = trpc.datasets.delete.useMutation({
    onSuccess: () => {
      refetch()
      setDeleteConfirm(null)
    },
  })
  const rebuildMutation = trpc.datasets.rebuild.useMutation({
    onSuccess: () => refetch(),
  })

  const datasets = data?.datasets ?? []

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate({ id })
  }, [deleteMutation])

  const handleRebuild = useCallback((id: string) => {
    rebuildMutation.mutate({ id })
    setMenuOpen(null)
  }, [rebuildMutation])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-64 bg-surface-overlay rounded-md animate-pulse" />
          <div className="h-9 w-36 bg-surface-overlay rounded-md animate-pulse ml-auto" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="card p-4 space-y-3 animate-pulse">
              <div className="h-5 w-48 bg-surface-overlay rounded" />
              <div className="h-3 w-32 bg-surface-overlay rounded" />
              <div className="h-2 w-full bg-surface-overlay rounded-full" />
              <div className="h-3 w-40 bg-surface-overlay rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!datasets.length && !search) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Database className="w-12 h-12 text-content-muted mb-4" />
        <h3 className="text-lg font-medium text-content-primary">No datasets yet</h3>
        <p className="text-sm text-content-muted mt-2 max-w-sm">
          Create a dataset from your collected feedback and trace data to prepare for model training.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search datasets..."
          className="w-full h-9 text-sm border border-border rounded-md pl-9 pr-3 bg-surface-card text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {datasets.map((ds) => {
          const total = ds.sourceBreakdown.corrections + ds.sourceBreakdown.preferences + ds.sourceBreakdown.traces
          const corrPct = total > 0 ? (ds.sourceBreakdown.corrections / total) * 100 : 0
          const prefPct = total > 0 ? (ds.sourceBreakdown.preferences / total) * 100 : 0
          const tracePct = total > 0 ? (ds.sourceBreakdown.traces / total) * 100 : 0

          return (
            <div
              key={ds.id}
              className="card p-4 space-y-3 cursor-pointer hover:border-primary-500/30 transition-colors"
              onClick={() => onSelectDataset?.(ds.id)}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-content-primary truncate">{ds.name}</h3>
                    {ds.status === 'building' && (
                      <Loader2 className="w-3.5 h-3.5 text-primary-500 animate-spin flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-content-muted mt-0.5">
                    {ds.agentId} ·{' '}
                    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', FORMAT_BADGE[ds.format] || FORMAT_BADGE.sft)}>
                      {ds.format.toUpperCase()}
                    </span>
                    {' · '}
                    {(ds.trainCount + ds.testCount).toLocaleString()} examples
                  </p>
                </div>

                {/* Overflow menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === ds.id ? null : ds.id) }}
                    className="p-1 hover:bg-surface-overlay rounded"
                  >
                    <MoreVertical className="w-4 h-4 text-content-muted" />
                  </button>
                  {menuOpen === ds.id && (
                    <div className="absolute right-0 top-8 z-20 bg-surface-card border border-border rounded-lg shadow-lg py-1 w-40">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSelectDataset?.(ds.id); setMenuOpen(null) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-content-primary hover:bg-surface-overlay"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRebuild(ds.id) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-content-primary hover:bg-surface-overlay flex items-center gap-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Rebuild
                      </button>
                      {onExportDataset && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onExportDataset(ds.id); setMenuOpen(null) }}
                          className="w-full text-left px-3 py-1.5 text-sm text-content-primary hover:bg-surface-overlay"
                        >
                          Export
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ds.id); setMenuOpen(null) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-rose-500 hover:bg-surface-overlay flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Source composition bar */}
              <div>
                <div className="h-2 rounded-full overflow-hidden flex">
                  {corrPct > 0 && <div className="bg-purple-500" style={{ width: `${corrPct}%` }} />}
                  {prefPct > 0 && <div className="bg-blue-500" style={{ width: `${prefPct}%` }} />}
                  {tracePct > 0 && <div className="bg-emerald-500" style={{ width: `${tracePct}%` }} />}
                </div>
                <div className="flex gap-3 mt-1">
                  {corrPct > 0 && (
                    <span className="text-[10px] text-content-muted flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      Corrections {Math.round(corrPct)}%
                    </span>
                  )}
                  {prefPct > 0 && (
                    <span className="text-[10px] text-content-muted flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      Preferences {Math.round(prefPct)}%
                    </span>
                  )}
                  {tracePct > 0 && (
                    <span className="text-[10px] text-content-muted flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Traces {Math.round(tracePct)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="text-xs text-content-muted space-y-0.5">
                <p>Train: {ds.trainCount.toLocaleString()} · Test: {ds.testCount.toLocaleString()} · Split: {ds.trainTestRatio}/{100 - ds.trainTestRatio}</p>
                <p>
                  Created {relativeTime(ds.createdAt)}
                  {ds.lastRebuiltAt && ` · Last rebuilt ${relativeTime(ds.lastRebuiltAt)}`}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-surface-card rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-content-primary">Delete Dataset</h3>
            <p className="text-sm text-content-muted">
              Are you sure you want to delete this dataset? This will permanently remove the dataset and all its examples. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="btn bg-rose-500 hover:bg-rose-600 text-white"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Dataset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
