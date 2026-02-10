'use client'

import { clsx } from 'clsx'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'

interface DatasetDetailPanelProps {
  datasetId: string
  onClose: () => void
  onExport?: (id: string) => void
}

export function DatasetDetailPanel({ datasetId, onClose, onExport }: DatasetDetailPanelProps) {
  const { data: dataset, isLoading } = trpc.datasets.get.useQuery({ id: datasetId })
  const { data: examplesData } = trpc.datasets.getExamples.useQuery({ datasetId, limit: 3 })
  const rebuildMutation = trpc.datasets.rebuild.useMutation()
  const utils = trpc.useUtils()

  const [sampleIndex, setSampleIndex] = useState(0)

  const examples = examplesData?.examples ?? []
  const currentExample = examples[sampleIndex]

  const handleRebuild = () => {
    rebuildMutation.mutate({ id: datasetId }, {
      onSuccess: () => utils.datasets.get.invalidate({ id: datasetId }),
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] bg-surface-card shadow-xl border-l border-border overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold text-content-primary">
              {isLoading ? '...' : dataset?.name}
            </h2>
            <button type="button" onClick={onClose} className="p-1 hover:bg-surface-overlay rounded">
              <X className="w-5 h-5 text-content-muted" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-32 bg-surface-overlay rounded-lg" />
              <div className="h-24 bg-surface-overlay rounded-lg" />
              <div className="h-40 bg-surface-overlay rounded-lg" />
            </div>
          ) : dataset ? (
            <>
              {/* Config */}
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-content-muted">Agent</span>
                <span className="text-content-primary">{dataset.agentId}</span>
                <span className="text-content-muted">Format</span>
                <span className="text-content-primary">{dataset.format.toUpperCase()}</span>
                <span className="text-content-muted">Examples</span>
                <span className="text-content-primary">{(dataset.trainCount + dataset.testCount).toLocaleString()}</span>
                <span className="text-content-muted">Split</span>
                <span className="text-content-primary">
                  {dataset.trainTestRatio}/{100 - dataset.trainTestRatio} (Train: {dataset.trainCount.toLocaleString()} / Test: {dataset.testCount.toLocaleString()})
                </span>
                <span className="text-content-muted">Score Filter</span>
                <span className="text-content-primary">&ge; {dataset.scoreThreshold} (traces)</span>
                <span className="text-content-muted">Created</span>
                <span className="text-content-primary">{new Date(dataset.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                {dataset.lastRebuiltAt && (
                  <>
                    <span className="text-content-muted">Last Rebuilt</span>
                    <span className="text-content-primary">{new Date(dataset.lastRebuiltAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </>
                )}
              </div>

              {/* Source breakdown */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-content-primary">Source Breakdown</h3>
                {(() => {
                  const total = dataset.sourceBreakdown.corrections + dataset.sourceBreakdown.preferences + dataset.sourceBreakdown.traces
                  const items = [
                    { label: 'Corrections', count: dataset.sourceBreakdown.corrections, color: 'bg-purple-500', pct: total > 0 ? (dataset.sourceBreakdown.corrections / total) * 100 : 0 },
                    { label: 'Preferences', count: dataset.sourceBreakdown.preferences, color: 'bg-blue-500', pct: total > 0 ? (dataset.sourceBreakdown.preferences / total) * 100 : 0 },
                    { label: 'Traces', count: dataset.sourceBreakdown.traces, color: 'bg-emerald-500', pct: total > 0 ? (dataset.sourceBreakdown.traces / total) * 100 : 0 },
                  ]
                  return items.map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-content-muted">{item.label}</span>
                        <span className="text-content-primary">{item.count.toLocaleString()} examples ({Math.round(item.pct)}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                        <div className={clsx('h-full rounded-full', item.color)} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))
                })()}
              </div>

              {/* Example preview */}
              {examples.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-content-primary">
                      Example {sampleIndex + 1} of {examples.length}
                    </h3>
                  </div>

                  {currentExample && (
                    <div className="bg-surface-overlay/20 rounded-md p-3 space-y-2">
                      <div>
                        <p className="text-xs text-content-muted mb-1">Input:</p>
                        <div className="bg-surface-overlay/30 rounded-md p-2">
                          <p className="font-mono text-xs text-content-secondary">{currentExample.input}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-content-muted mb-1">Output:</p>
                        <div className="bg-surface-overlay/30 rounded-md p-2">
                          <p className="font-mono text-xs text-content-secondary line-clamp-4">{currentExample.output}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-content-muted">
                        Source: {currentExample.source}
                        {currentExample.score != null && ` · Score: ${currentExample.score.toFixed(2)}`}
                      </p>
                    </div>
                  )}

                  {/* Pagination dots */}
                  <div className="flex justify-center gap-1.5">
                    {examples.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSampleIndex(i)}
                        className={clsx(
                          'w-2 h-2 rounded-full transition-colors',
                          i === sampleIndex ? 'bg-primary-500' : 'bg-surface-overlay hover:bg-content-muted',
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-border">
                {onExport && (
                  <button type="button" onClick={() => onExport(datasetId)} className="btn btn-primary flex-1">
                    Export This Dataset
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRebuild}
                  disabled={rebuildMutation.isPending || dataset.status === 'building'}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  {rebuildMutation.isPending || dataset.status === 'building' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Rebuild
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}
