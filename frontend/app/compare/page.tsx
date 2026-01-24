'use client'

import { ArrowRight, GitCompare, TrendingDown, TrendingUp } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo } from 'react'
import {
  RunSelector,
  RunSummaryCard,
  SuiteFilter,
  ThresholdSelector,
} from '@/components/compare/run-selector'
import { THRESHOLD_OPTIONS, useComparison } from '@/hooks/use-compare'
import { getUniqueSuites, useRuns } from '@/hooks/use-runs'

function ComparePageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Read state from URL
  const baselineId = searchParams.get('baseline') || undefined
  const candidateId = searchParams.get('candidate') || undefined
  const threshold = parseFloat(searchParams.get('threshold') || '0.05')
  const suiteFilter = searchParams.get('suite') || ''

  // Fetch runs
  const { data: runs = [], isLoading: runsLoading } = useRuns({ limit: 100 })

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
  } = useComparison({
    baselineId,
    candidateId,
    threshold,
    enabled: !!baselineId && !!candidateId,
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
              selectedRunId={baselineId}
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
              selectedRunId={candidateId}
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

      {/* Comparison Results */}
      {comparison && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-gray-500">
                  {comparison.baseline.agent_version ||
                    comparison.baseline.id.slice(0, 8)}
                </span>
                <ArrowRight className="w-5 h-5 text-gray-400" />
                <span className="text-gray-900 font-medium">
                  {comparison.candidate.agent_version ||
                    comparison.candidate.id.slice(0, 8)}
                </span>
              </div>
              <div
                className={`badge ${comparison.passed ? 'badge-green' : 'badge-red'}`}
              >
                {comparison.passed ? 'PASSED' : 'REGRESSION DETECTED'}
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-8">
              <div>
                <span className="text-sm text-gray-500">Overall Delta</span>
                <p
                  className={`text-2xl font-bold ${comparison.overall_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {comparison.overall_delta >= 0 ? '+' : ''}
                  {comparison.overall_delta.toFixed(4)}
                </p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Regressions</span>
                <p className="text-2xl font-bold text-red-600">
                  {comparison.regressions.length}
                </p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Improvements</span>
                <p className="text-2xl font-bold text-green-600">
                  {comparison.improvements.length}
                </p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Unchanged</span>
                <p className="text-2xl font-bold text-gray-600">
                  {comparison.unchanged}
                </p>
              </div>
            </div>
          </div>

          {/* Regressions */}
          {comparison.regressions.length > 0 && (
            <div className="card">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-red-600 flex items-center space-x-2">
                  <TrendingDown className="w-5 h-5" />
                  <span>Regressions ({comparison.regressions.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-200">
                {comparison.regressions.map((r) => (
                  <div
                    key={`${r.case_name}-${r.scorer}`}
                    className="p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{r.case_name}</p>
                      <p className="text-sm text-gray-500">{r.scorer}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-500">
                        {r.baseline_score.toFixed(2)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">
                        {r.candidate_score.toFixed(2)}
                      </span>
                      <span className="text-red-600 font-medium">
                        {r.delta.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Improvements */}
          {comparison.improvements.length > 0 && (
            <div className="card">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-green-600 flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5" />
                  <span>Improvements ({comparison.improvements.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-200">
                {comparison.improvements.map((improvement) => (
                  <div
                    key={`${improvement.case_name}-${improvement.scorer}`}
                    className="p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {improvement.case_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {improvement.scorer}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-500">
                        {improvement.baseline_score.toFixed(2)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">
                        {improvement.candidate_score.toFixed(2)}
                      </span>
                      <span className="text-green-600 font-medium">
                        +{improvement.delta.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading state for comparison */}
      {comparisonLoading && canCompare && (
        <div className="card p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-500">Comparing runs...</p>
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
