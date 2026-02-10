'use client'

import { ArrowLeftRight, GitCompare } from 'lucide-react'
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
import { DumbbellChart } from '@/components/compare/dumbbell-chart'
import { ExportDropdown } from '@/components/compare/export-dropdown'
import {
  RunSelector,
  RunSummaryCard,
  SuiteFilter,
  ThresholdSelector,
} from '@/components/compare/run-selector'
import { StatisticalGuidance } from '@/components/compare/statistical-guidance'
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
  const agentFilter = searchParams.get('agent') || ''

  // Fetch runs (filtered by agent if set)
  const { data, isLoading: runsLoading } = useRuns({ limit: 100 })
  const runs = data?.items ?? []

  // Filter runs by agent version if selected
  const filteredRuns = useMemo(() => {
    if (!agentFilter) return runs
    return runs.filter((r) => r.agent_version === agentFilter)
  }, [runs, agentFilter])

  // Get unique suites and agent versions for filters
  const uniqueSuites = useMemo(
    () => getUniqueSuites(filteredRuns),
    [filteredRuns],
  )
  const uniqueAgents = useMemo(() => {
    const agents = new Set<string>()
    for (const run of runs) {
      if (run.agent_version) agents.add(run.agent_version)
    }
    return Array.from(agents).sort()
  }, [runs])

  // Find selected runs
  const baselineRun = useMemo(
    () => runs.find((r) => r.id === baselineId),
    [runs, baselineId],
  )
  const candidateRun = useMemo(
    () => runs.find((r) => r.id === candidateId),
    [runs, candidateId],
  )

  // Auto-fire comparison when both runs are selected (no manual button needed)
  const canCompare = !!baselineId && !!candidateId && baselineId !== candidateId
  const {
    data: comparison,
    isLoading: comparisonLoading,
    isFetching: comparisonFetching,
    error: comparisonError,
  } = useCompare(baselineId, candidateId, threshold, {
    enabled: canCompare,
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

  const setAgentFilter = (value: string) => {
    updateUrl({ agent: value })
  }

  const handleSwap = useCallback(() => {
    if (!baselineId || !candidateId) return
    updateUrl({ baseline: candidateId, candidate: baselineId })
  }, [baselineId, candidateId, updateUrl])

  // Validate threshold against allowed options
  const validThreshold = useMemo(() => {
    const found = THRESHOLD_OPTIONS.find((opt) => opt.value === threshold)
    return found ? threshold : 0.05
  }, [threshold])

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <GitCompare className="h-7 w-7 text-primary-500 dark:text-primary-400" />
              <h1 className="text-2xl font-bold text-content-primary">
                Compare Runs
              </h1>
            </div>
            <p className="text-content-secondary">
              Identify regressions between agent versions
            </p>
          </div>
          {comparison && (
            <ExportDropdown
              comparison={comparison}
              baselineId={baselineId}
              candidateId={candidateId}
            />
          )}
        </div>
      </div>

      {/* Selection Form */}
      <div className="rounded-xl border border-border bg-surface-card/95 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80 space-y-6">
        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="max-w-xs">
            <SuiteFilter
              suites={uniqueSuites}
              value={suiteFilter}
              onChange={setSuiteFilter}
            />
          </div>
          <div className="max-w-xs">
            <label
              htmlFor="compare-agent-filter"
              className="block text-sm font-medium text-content-secondary mb-1.5"
            >
              Agent
            </label>
            <select
              id="compare-agent-filter"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="min-w-[160px] rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="">All Agents</option>
              {uniqueAgents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Run Selectors with Swap Button */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <div className="space-y-4">
            <RunSelector
              label="Baseline Run"
              runs={filteredRuns}
              selectedRunId={baselineId || undefined}
              onSelect={setBaselineId}
              suiteFilter={suiteFilter || undefined}
              placeholder="Select baseline run..."
              disabled={runsLoading}
            />
            <RunSummaryCard run={baselineRun} label="Baseline" />
          </div>

          {/* Swap button */}
          <div className="flex items-center justify-center pt-8">
            <button
              type="button"
              onClick={handleSwap}
              disabled={!baselineId || !candidateId}
              className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Swap baseline and candidate"
            >
              <ArrowLeftRight className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <RunSelector
              label="Candidate Run"
              runs={filteredRuns}
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

        {/* Same-run warning */}
        {baselineId && candidateId && baselineId === candidateId && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Please select two different runs to compare.
          </p>
        )}

        {/* Auto-fire status indicator */}
        {canCompare && comparisonFetching && !comparisonLoading && (
          <p className="text-xs text-content-muted animate-pulse">
            Updating comparison...
          </p>
        )}
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
          <DumbbellChart
            regressions={comparison.regressions}
            improvements={comparison.improvements}
          />
          <CompareResults comparison={comparison} />
        </div>
      )}

      {/* Empty State - No runs selected */}
      {!canCompare && !comparisonLoading && !comparisonError && (
        <div className="card p-12 text-center">
          <GitCompare className="w-12 h-12 mx-auto text-content-muted mb-4" />
          <h3 className="text-lg font-medium text-content-secondary mb-2">
            Select Two Runs
          </h3>
          <p className="text-content-muted text-sm max-w-md mx-auto">
            Choose a baseline and candidate run above to automatically compare
            them and identify regressions.
          </p>
        </div>
      )}
    </div>
  )
}

function ComparePageLoading() {
  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="mb-2 flex items-center gap-3">
          <GitCompare className="h-7 w-7 text-primary-500 dark:text-primary-400" />
          <h1 className="text-2xl font-bold text-content-primary">
            Compare Runs
          </h1>
        </div>
        <p className="text-content-secondary">
          Identify regressions between agent versions
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface-card/95 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-surface-raised rounded w-1/4" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4">
            <div className="h-32 bg-surface-raised rounded" />
            <div className="w-10" />
            <div className="h-32 bg-surface-raised rounded" />
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
