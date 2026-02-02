'use client'

/**
 * Trace Diff Page
 *
 * Side-by-side comparison of two traces with diff highlighting.
 */

import { clsx } from 'clsx'
import { ArrowLeft, GitCompare, RefreshCw } from 'lucide-react'
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
      <div className="h-24 bg-gray-200 rounded-lg" />
      <div className="grid grid-cols-4 gap-3">
        <div className="h-16 bg-gray-200 rounded-lg" />
        <div className="h-16 bg-gray-200 rounded-lg" />
        <div className="h-16 bg-gray-200 rounded-lg" />
        <div className="h-16 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-96 bg-gray-200 rounded-lg" />
    </div>
  )
}

/**
 * Empty state when no traces selected
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <GitCompare className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Compare Two Traces
      </h2>
      <p className="text-gray-500 max-w-md mb-6">
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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <GitCompare className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Failed to Load Traces
      </h2>
      <p className="text-gray-500 max-w-md mb-6">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
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

  // Compute diff when both traces are loaded
  const diff = useMemo(() => {
    if (!baselineTrace || !candidateTrace) return null
    return diffTraces(baselineTrace, candidateTrace)
  }, [baselineTrace, candidateTrace])

  const isLoading = baselineLoading || candidateLoading
  const hasError = baselineError || candidateError
  const bothSelected = baselineId && candidateId

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4 mb-4">
          <Link
            href="/traces"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to traces"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Compare Traces</h1>
            <p className="text-sm text-gray-500">
              Side-by-side trace comparison with diff highlighting
            </p>
          </div>
        </div>

        {/* Trace selectors */}
        <DualTraceSelector
          baselineId={baselineId}
          candidateId={candidateId}
          onBaselineChange={(id) => updateUrl(id, candidateId)}
          onCandidateChange={(id) => updateUrl(baselineId, id)}
        />
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main panel */}
        <div
          className={clsx(
            'flex-1 overflow-auto p-4 sm:p-6',
            selectedDiff && 'lg:border-r',
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
              <div className="flex items-center gap-2 border-b">
                <button
                  type="button"
                  onClick={() => setViewMode('spans')}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    viewMode === 'spans'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  )}
                >
                  Span Comparison
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    viewMode === 'timeline'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
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
                'fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-xl z-50',
                'lg:relative lg:w-[450px] lg:max-w-none lg:shadow-none lg:z-auto',
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
