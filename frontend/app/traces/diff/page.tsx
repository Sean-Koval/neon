'use client'

/**
 * Trace Diff Page
 *
 * Side-by-side comparison of two traces with diff highlighting.
 * Features swap A-B button and correct color coding for improvements/regressions.
 */

import { clsx } from 'clsx'
import { ArrowLeft, ArrowLeftRight, GitCompare, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import {
  DiffSummary,
  DualTraceSelector,
  diffTraces,
  type SpanDiff,
  SpanDiffDetail,
  SpanDiffList,
  TimelineOverlay,
} from '@/components/traces/diff'
import { useTrace } from '@/hooks/use-traces'

/**
 * View mode tabs
 */
type ViewMode = 'spans' | 'timeline'

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-28 rounded-2xl border border-border bg-surface-card" />
      <div className="grid grid-cols-4 gap-3">
        <div className="h-16 rounded-xl border border-border bg-surface-card" />
        <div className="h-16 rounded-xl border border-border bg-surface-card" />
        <div className="h-16 rounded-xl border border-border bg-surface-card" />
        <div className="h-16 rounded-xl border border-border bg-surface-card" />
      </div>
      <div className="h-96 rounded-2xl border border-border bg-surface-card" />
    </div>
  )
}

/**
 * Empty state when no traces selected
 */
function EmptyState() {
  return (
    <div className="rounded-2xl border border-border bg-surface-card p-10 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-primary-500/10 dark:bg-primary-400/15 flex items-center justify-center mb-4">
        <GitCompare className="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>
      <h2 className="text-xl font-semibold text-content-primary mb-2">
        Compare Two Traces
      </h2>
      <p className="text-content-secondary max-w-md mb-6">
        Select a baseline and candidate trace to compare their execution spans,
        timing, and scores side by side.
      </p>
    </div>
  )
}

/**
 * Error state
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-10 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <GitCompare className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Failed to Load Traces
      </h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200"
      >
        <RefreshCw className="w-4 h-4" />
        Try Again
      </button>
    </div>
  )
}

export default function TraceDiffPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get trace IDs from URL
  const baselineId = searchParams.get('baseline')
  const candidateId = searchParams.get('candidate')

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('spans')

  // Selected span for detail view
  const [selectedDiff, setSelectedDiff] = useState<SpanDiff | null>(null)

  // Fetch both traces
  const {
    data: baselineTrace,
    isLoading: baselineLoading,
    error: baselineError,
    refetch: refetchBaseline,
  } = useTrace(baselineId || '', '00000000-0000-0000-0000-000000000001')

  const {
    data: candidateTrace,
    isLoading: candidateLoading,
    error: candidateError,
    refetch: refetchCandidate,
  } = useTrace(candidateId || '', '00000000-0000-0000-0000-000000000001')

  // Update URL when traces change
  const updateUrl = useCallback(
    (baseline: string | null, candidate: string | null) => {
      const params = new URLSearchParams()
      if (baseline) params.set('baseline', baseline)
      if (candidate) params.set('candidate', candidate)
      router.replace(`/traces/diff?${params.toString()}`, { scroll: false })
    },
    [router],
  )

  // Swap baseline and candidate
  const handleSwap = useCallback(() => {
    if (baselineId || candidateId) {
      updateUrl(candidateId, baselineId)
    }
  }, [baselineId, candidateId, updateUrl])

  // Compute diff when both traces are loaded
  const diff = useMemo(() => {
    if (!baselineTrace || !candidateTrace) return null
    return diffTraces(baselineTrace, candidateTrace)
  }, [baselineTrace, candidateTrace])

  const isLoading = baselineLoading || candidateLoading
  const hasError = baselineError || candidateError
  const bothSelected = baselineId && candidateId

  return (
    <div className="relative h-screen flex flex-col p-6 gap-5 bg-surface-base">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <header className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 dark:from-surface-card dark:via-surface-card dark:to-surface-raised px-5 py-5 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <Link
            href="/traces"
            className="p-2 hover:bg-surface-raised rounded-lg transition-colors"
            title="Back to traces"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-content-primary">Compare Traces</h1>
            <p className="text-sm text-content-secondary">
              Side-by-side trace comparison with diff highlighting
            </p>
          </div>
        </div>

        {/* Trace selectors with swap button */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <DualTraceSelector
              baselineId={baselineId}
              candidateId={candidateId}
              onBaselineChange={(id) => updateUrl(id, candidateId)}
              onCandidateChange={(id) => updateUrl(baselineId, id)}
            />
          </div>
        </div>

        {/* Swap button */}
        <div className="flex justify-center mt-3">
          <button
            type="button"
            onClick={handleSwap}
            disabled={!baselineId && !candidateId}
            title="Swap baseline and candidate"
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              baselineId || candidateId
                ? 'border-border hover:bg-surface-raised text-content-secondary'
                : 'border-border text-content-muted cursor-not-allowed opacity-50',
            )}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Swap A/B
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden rounded-2xl border border-border bg-surface-card shadow-sm">
        {/* Main panel */}
        <div
          className={clsx(
            'flex-1 overflow-auto p-4 sm:p-6',
            selectedDiff && 'lg:border-r lg:border-border',
          )}
        >
          {!bothSelected ? (
            <EmptyState />
          ) : isLoading ? (
            <LoadingSkeleton />
          ) : hasError ? (
            <ErrorState
              message={
                (baselineError as Error)?.message ||
                (candidateError as Error)?.message ||
                'Failed to load traces'
              }
              onRetry={() => {
                refetchBaseline()
                refetchCandidate()
              }}
            />
          ) : diff ? (
            <div className="space-y-6">
              {/* Summary */}
              <DiffSummary diff={diff} />

              {/* View mode tabs */}
              <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('spans')}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    viewMode === 'spans'
                      ? 'bg-surface-card text-primary-700 dark:text-primary-300 shadow-sm border border-border'
                      : 'text-content-secondary hover:text-content-primary',
                  )}
                >
                  Span Comparison
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    viewMode === 'timeline'
                      ? 'bg-surface-card text-primary-700 dark:text-primary-300 shadow-sm border border-border'
                      : 'text-content-secondary hover:text-content-primary',
                  )}
                >
                  Timeline Overlay
                </button>
              </div>

              {/* Content based on view mode */}
              {viewMode === 'spans' ? (
                <SpanDiffList
                  diffs={diff.spanDiffs}
                  onSpanSelect={setSelectedDiff}
                  selectedSpanId={
                    selectedDiff?.baseline?.span_id ||
                    selectedDiff?.candidate?.span_id
                  }
                />
              ) : (
                <TimelineOverlay
                  baseline={baselineTrace?.spans || []}
                  candidate={candidateTrace?.spans || []}
                  diff={diff}
                />
              )}
            </div>
          ) : null}
        </div>

        {/* Span detail panel */}
        {selectedDiff && (
          <>
            {/* Mobile overlay backdrop */}
            <button
              type="button"
              className="fixed inset-0 bg-black/20 z-40 lg:hidden cursor-default"
              onClick={() => setSelectedDiff(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSelectedDiff(null)
              }}
              aria-label="Close detail panel"
            />

            {/* Detail panel */}
            <div
              className={clsx(
                'fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-dark-800 shadow-xl z-50',
                'lg:relative lg:w-[450px] lg:max-w-none lg:shadow-none lg:z-auto lg:bg-surface-card',
              )}
            >
              <SpanDiffDetail
                diff={selectedDiff}
                onClose={() => setSelectedDiff(null)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
