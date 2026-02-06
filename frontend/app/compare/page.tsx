'use client'

import { GitCompare } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo } from 'react'
import {
  CompareResults,
  CompareResultsSkeleton,
} from '@/components/compare/compare-results'
import {
  ComparisonHeader,
  ComparisonHeaderError,
  ComparisonHeaderSkeleton,
} from '@/components/compare/comparison-header'
import { StatisticalGuidance } from '@/components/compare/statistical-guidance'
import {
  RunSelector,
  RunSummaryCard,
  SuiteFilter,
  ThresholdSelector,
} from '@/components/compare/run-selector'
import { THRESHOLD_OPTIONS, useCompare } from '@/hooks/use-compare'
import { getUniqueSuites, useRuns } from '@/hooks/use-runs'

function ComparePageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Read state from URL
  const baselineId = searchParams.get('baseline') || ''
  const candidateId = searchParams.get('candidate') || ''
  const threshold = parseFloat(searchParams.get('threshold') || '0.05')
  const suiteFilter = searchParams.get('suite') || ''

  // Fetch runs
  const { data, isLoading: runsLoading } = useRuns({ limit: 100 })
  const runs = data?.items ?? []

  // Get unique suites for filter
  const uniqueSuites = useMemo(() => getUniqueSuites(runs), [runs])

  // Find selected runs
  const baselineRun = useMemo(
    () => runs.find((r) => r.id === baselineId),
    [runs, baselineId],
  )
  const candidateRun = useMemo(
    () => runs.find((r) => r.id === candidateId),
    [runs, candidateId],
  )

  // Fetch comparison when both runs are selected
  const {
    data: comparison,
    isLoading: comparisonLoading,
    isFetching: comparisonFetching,
    error: comparisonError,
  } = useCompare(baselineId, candidateId, threshold, {
    enabled: !!baselineId && !!candidateId && baselineId !== candidateId,
  })

  // URL state management
  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }

      const query = params.toString()
      router.replace(`${pathname}${query ? `?${query}` : ''}`, {
        scroll: false,
      })
    },
    [router, pathname, searchParams],
  )

  const setBaselineId = (id: string | undefined) => {
    updateUrl({ baseline: id })
  }

  const setCandidateId = (id: string | undefined) => {
    updateUrl({ candidate: id })
  }

  const setThreshold = (value: number) => {
    updateUrl({ threshold: value.toString() })
  }

  const setSuiteFilter = (value: string) => {
    updateUrl({ suite: value })
  }

  // Validate threshold against allowed options
  const validThreshold = useMemo(() => {
    const found = THRESHOLD_OPTIONS.find((opt) => opt.value === threshold)
    return found ? threshold : 0.05
  }, [threshold])

  // Check if comparison can be performed
  const canCompare = !!baselineId && !!candidateId && baselineId !== candidateId

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Compare Runs</h1>
        <p className="text-gray-500">
          Identify regressions between agent versions
        </p>
      </div>

      {/* Selection Form */}
      <div className="card p-6 space-y-6">
        {/* Suite Filter */}
        <div className="max-w-xs">
          <SuiteFilter
            suites={uniqueSuites}
            value={suiteFilter}
            onChange={setSuiteFilter}
          />
        </div>

        {/* Run Selectors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <RunSelector
              label="Baseline Run"
              runs={runs}
              selectedRunId={baselineId || undefined}
              onSelect={setBaselineId}
              suiteFilter={suiteFilter || undefined}
              placeholder="Select baseline run..."
              disabled={runsLoading}
            />
            <RunSummaryCard run={baselineRun} label="Baseline" />
          </div>

          <div className="space-y-4">
            <RunSelector
              label="Candidate Run"
              runs={runs}
              selectedRunId={candidateId || undefined}
              onSelect={setCandidateId}
              suiteFilter={suiteFilter || undefined}
              placeholder="Select candidate run..."
              disabled={runsLoading}
            />
            <RunSummaryCard run={candidateRun} label="Candidate" />
          </div>
        </div>

        {/* Threshold Selector */}
        <ThresholdSelector
          value={validThreshold}
          onChange={setThreshold}
          options={THRESHOLD_OPTIONS}
        />

        {/* Compare Button */}
        <div className="pt-2">
          <button
            type="button"
            disabled={!canCompare || comparisonLoading}
            className="btn btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GitCompare className="w-4 h-4" />
            <span>
              {comparisonFetching
                ? 'Comparing...'
                : canCompare
                  ? 'Compare Runs'
                  : 'Select two different runs'}
            </span>
          </button>
          {baselineId && candidateId && baselineId === candidateId && (
            <p className="mt-2 text-sm text-amber-600">
              Please select two different runs to compare
            </p>
          )}
        </div>
      </div>

      {/* Loading State */}
      {comparisonLoading && canCompare && (
        <div className="space-y-6">
          <ComparisonHeaderSkeleton />
          <CompareResultsSkeleton />
        </div>
      )}

      {/* Error State */}
      {comparisonError && canCompare && !comparisonLoading && (
        <ComparisonHeaderError
          message={
            comparisonError instanceof Error
              ? comparisonError.message
              : 'An error occurred while comparing runs'
          }
        />
      )}

      {/* Comparison Results */}
      {comparison && !comparisonLoading && (
        <div className="space-y-6">
          <ComparisonHeader comparison={comparison} />
          <StatisticalGuidance />
          <CompareResults comparison={comparison} />
        </div>
      )}

      {/* Empty State - When no comparison yet */}
      {!comparison && !comparisonLoading && !comparisonError && canCompare && (
        <div className="card p-12 text-center">
          <GitCompare className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Ready to Compare
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Click the Compare button above to analyze the differences between
            your baseline and candidate runs.
          </p>
        </div>
      )}
    </div>
  )
}

function ComparePageLoading() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Compare Runs</h1>
        <p className="text-gray-500">
          Identify regressions between agent versions
        </p>
      </div>
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-2 gap-6">
            <div className="h-32 bg-gray-200 rounded" />
            <div className="h-32 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<ComparePageLoading />}>
      <ComparePageContent />
    </Suspense>
  )
}
