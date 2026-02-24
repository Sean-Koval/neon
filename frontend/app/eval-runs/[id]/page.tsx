'use client'

/**
 * Eval Run Detail Page — Redesigned
 *
 * Implements tickets:
 *   neon-acoo: Results summary stat cards
 *   neon-0h12: Scorer breakdown section
 *   neon-xbms: Test case filter tabs
 *   neon-b121: Rerun and Compare buttons
 *   neon-f6od: Hide Temporal internals
 *   neon-zt2t: Progress hero card
 *   neon-ehh5: CSV export
 *
 * Three-phase layout: RUNNING (progress hero + streaming results),
 * COMPLETED (stat cards + scorer breakdown + full results),
 * FAILED (error card + partial results).
 */

import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileQuestion,
  GitCompare,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { ErrorBoundary } from '@/components/error-boundary'
import { EvalRunProgress } from '@/components/eval-runs'
import { ConnectionStatusIndicator } from '@/components/realtime'
import { ScoreBadge, StatusBadge } from '@/components/ui/badge'
import { useRealtimeRun } from '@/hooks/use-realtime'
import {
  useCancelWorkflowRun,
  usePauseWorkflowRun,
  useResumeWorkflowRun,
  useStartWorkflowRun,
  useWorkflowRun,
  useWorkflowRuns,
  useWorkflowRunStatus,
} from '@/hooks/use-workflow-runs'
import { safeFormat, safeFormatDistance } from '@/lib/format-date'
import { useToast } from '@/components/toast'

interface RunResultSummary {
  total: number
  passed: number
  failed: number
  avgScore: number
}

function isRunResultSummary(value: unknown): value is RunResultSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    'total' in value &&
    'passed' in value &&
    'failed' in value &&
    'avgScore' in value &&
    typeof (value as RunResultSummary).total === 'number' &&
    typeof (value as RunResultSummary).passed === 'number' &&
    typeof (value as RunResultSummary).failed === 'number' &&
    typeof (value as RunResultSummary).avgScore === 'number'
  )
}

interface Score {
  name: string
  value: number
  reason?: string
}

interface EvalCaseResult {
  caseIndex: number
  caseName?: string
  result: {
    traceId: string
    status: string
    iterations: number
    reason?: string
    executionTimeMs?: number
  }
  scores: Score[]
}

type ResultFilter = 'all' | 'passed' | 'failed'

export default function EvalRunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { addToast } = useToast()
  const runId = typeof params.id === 'string' ? params.id : ''

  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [isExportOpen, setIsExportOpen] = useState(false)

  // Fetch full run details
  const { data: run, isLoading, error, refetch } = useWorkflowRun(runId)
  const { data: status } = useWorkflowRunStatus(runId)
  const { status: realtimeStatus, connectionStatus, isWebSocket } = useRealtimeRun(runId)

  // Control mutations
  const pauseMutation = usePauseWorkflowRun()
  const resumeMutation = useResumeWorkflowRun()
  const cancelMutation = useCancelWorkflowRun({ onSuccess: () => refetch() })
  const startMutation = useStartWorkflowRun()

  // Find previous run for compare
  const { data: allRuns } = useWorkflowRuns()
  const previousRun = useMemo(() => {
    if (!allRuns || !run) return null
    const sameConfig = allRuns
      .filter(
        (r: { id: string; status: string }) =>
          r.id !== runId && r.status === 'COMPLETED',
      )
      .sort(
        (a: { startTime?: string }, b: { startTime?: string }) =>
          new Date(b.startTime || 0).getTime() -
          new Date(a.startTime || 0).getTime(),
      )
    return sameConfig[0] || null
  }, [allRuns, run, runId])

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading run...</p>
      </div>
    )
  }

  // Error
  if (error || !run) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 py-24">
        <XCircle className="w-12 h-12 text-red-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Run not found
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This eval run doesn&apos;t exist or has been removed.
        </p>
        <Link
          href="/eval-runs"
          className="text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
        >
          Back to Eval Runs
        </Link>
      </div>
    )
  }

  // Merge status
  const currentStatus = realtimeStatus
    ? {
        id: run.id,
        status: realtimeStatus.status,
        isRunning: realtimeStatus.status === 'RUNNING',
        isComplete: realtimeStatus.status === 'COMPLETED',
        isFailed:
          realtimeStatus.status === 'FAILED' ||
          realtimeStatus.status === 'CANCELLED' ||
          realtimeStatus.status === 'TERMINATED',
        progress: realtimeStatus.progress,
        summary: realtimeStatus.summary,
        error: realtimeStatus.error,
      }
    : status || {
        id: run.id,
        status: run.status,
        isRunning: run.status === 'RUNNING',
        isComplete: run.status === 'COMPLETED',
        isFailed:
          run.status === 'FAILED' ||
          run.status === 'CANCELLED' ||
          run.status === 'TERMINATED',
        progress: run.progress
          ? {
              completed: run.progress.completed,
              total: run.progress.total,
              passed: run.progress.passed,
              failed: run.progress.failed,
              percentComplete:
                run.progress.total > 0
                  ? Math.round(
                      (run.progress.completed / run.progress.total) * 100,
                    )
                  : 0,
            }
          : undefined,
        summary: isRunResultSummary(run.result) ? run.result : undefined,
        error: run.error,
      }

  const results: EvalCaseResult[] = run.progress?.results || []
  const isRunning = currentStatus.isRunning
  const isComplete = currentStatus.isComplete
  const isFailed = currentStatus.isFailed

  // Computed stats
  const totalCases = results.length
  const passedCount = results.filter((r) => r.result.status === 'completed').length
  const failedCount = totalCases - passedCount
  const passRate = totalCases > 0 ? passedCount / totalCases : 0
  const avgScore =
    totalCases > 0
      ? results.reduce((sum, r) => {
          const caseAvg =
            r.scores.length > 0
              ? r.scores.reduce((s, sc) => s + sc.value, 0) / r.scores.length
              : 0
          return sum + caseAvg
        }, 0) / totalCases
      : 0

  // Scorer breakdown
  const scorerBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { total: number; passed: number; sum: number }
    >()
    for (const result of results) {
      for (const score of result.scores) {
        const entry = map.get(score.name) || {
          total: 0,
          passed: 0,
          sum: 0,
        }
        entry.total++
        entry.sum += score.value
        if (score.value >= 0.7) entry.passed++
        map.set(score.name, entry)
      }
    }
    return [...map.entries()]
      .map(([name, data]) => ({
        name,
        passRate: data.total > 0 ? data.passed / data.total : 0,
        avgScore: data.total > 0 ? data.sum / data.total : 0,
        passed: data.passed,
        total: data.total,
      }))
      .sort((a, b) => a.passRate - b.passRate) // worst first
  }, [results])

  // Score distribution (10 bins)
  const scoreDistribution = useMemo(() => {
    const bins = Array.from({ length: 10 }, (_, i) => ({
      range: `${(i * 0.1).toFixed(1)}-${((i + 1) * 0.1).toFixed(1)}`,
      count: 0,
    }))
    for (const result of results) {
      const caseAvg =
        result.scores.length > 0
          ? result.scores.reduce((s, sc) => s + sc.value, 0) /
            result.scores.length
          : 0
      const binIndex = Math.min(Math.floor(caseAvg * 10), 9)
      bins[binIndex].count++
    }
    return bins
  }, [results])

  const maxBinCount = Math.max(...scoreDistribution.map((b) => b.count), 1)

  // Filter results
  const filteredResults = useMemo(() => {
    let filtered = results
    if (resultFilter === 'passed') {
      filtered = results.filter((r) => r.result.status === 'completed')
    } else if (resultFilter === 'failed') {
      filtered = results.filter((r) => r.result.status !== 'completed')
    }
    // Running: newest first. Completed: by case index.
    if (isRunning) {
      return [...filtered].reverse()
    }
    return [...filtered].sort((a, b) => a.caseIndex - b.caseIndex)
  }, [results, resultFilter, isRunning])

  // Auto-expand all failed when switching to failed filter
  const handleFilterChange = (filter: ResultFilter) => {
    setResultFilter(filter)
    if (filter === 'failed') {
      const failedIndices = results
        .filter((r) => r.result.status !== 'completed')
        .map((_, i) => i)
      setExpandedRows(new Set(failedIndices))
    }
  }

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  // Rerun handler
  const handleRerun = () => {
    if (!confirm('Start a new run with the same settings?')) return
    startMutation.mutate(
      {
        projectId: 'default',
        agentId: (run as { agentId?: string }).agentId || 'unknown',
        agentVersion: (run as { agentVersion?: string }).agentVersion || 'latest',
        dataset: { items: [] },
        scorers: [],
        parallel: true,
        parallelism: 5,
      },
      {
        onSuccess: (data: { workflowId?: string }) => {
          if (data?.workflowId) {
            router.push(`/eval-runs/${data.workflowId}`)
          }
        },
      },
    )
  }

  // CSV Export
  const exportCSV = useCallback(() => {
    const scorerNames = [
      ...new Set(results.flatMap((r) => r.scores.map((s) => s.name))),
    ]
    const header = [
      'case_name',
      'status',
      'avg_score',
      'iterations',
      'trace_id',
      ...scorerNames,
    ]
    const rows = results.map((r) => {
      const caseAvg =
        r.scores.length > 0
          ? (
              r.scores.reduce((s, sc) => s + sc.value, 0) / r.scores.length
            ).toFixed(3)
          : '0'
      const scorerValues = scorerNames.map((name) => {
        const score = r.scores.find((s) => s.name === name)
        return score ? score.value.toFixed(3) : ''
      })
      return [
        r.caseName || `Case #${r.caseIndex + 1}`,
        r.result.status,
        caseAvg,
        String(r.result.iterations),
        r.result.traceId,
        ...scorerValues,
      ]
    })
    const csv = [header, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eval-run-${runId}-results.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [results, runId])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eval-run-${runId}-results.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [results, runId])

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    addToast('Link copied to clipboard', 'success')
  }, [addToast])

  // Compute duration
  const duration = run.closeTime
    ? formatDuration(
        new Date(run.closeTime).getTime() -
          new Date(run.startTime || '').getTime(),
      )
    : null

  // Get suite/agent names from run metadata
  const suiteName =
    (run as { suiteName?: string }).suiteName ||
    (run as { memo?: string[] }).memo?.[0] ||
    null
  const agentName =
    (run as { agentName?: string }).agentName || null
  const agentVersion =
    (run as { agentVersion?: string }).agentVersion || null

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/eval-runs"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Eval Runs
      </Link>

      {/* Run Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {suiteName || `Run ${runId.slice(0, 8)}`}
            </h1>
            <StatusBadge status={currentStatus.status} />
          </div>
          {agentName && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {agentName}
              {agentVersion && (
                <span className="font-mono ml-1">{agentVersion}</span>
              )}
            </p>
          )}
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {run.startTime && (
              <>Started {safeFormatDistance(run.startTime)}</>
            )}
            {duration && <> &middot; Duration {duration}</>}
            {currentStatus.progress?.total && (
              <> &middot; {currentStatus.progress.total} cases</>
            )}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            {(isComplete || isFailed) && (
              <button
                type="button"
                onClick={handleRerun}
                disabled={startMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                {startMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Rerun
              </button>
            )}
            {(isComplete || isFailed) && previousRun && (
              <Link
                href={`/compare?baseline=${(previousRun as { id: string }).id}&candidate=${runId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300"
              >
                <GitCompare className="w-4 h-4" />
                Compare with Previous
              </Link>
            )}
            {results.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300"
                >
                  <Download className="w-4 h-4" />
                  Export
                  <ChevronDown className="w-3 h-3" />
                </button>
                {isExportOpen && (
                  <div className="absolute top-full mt-1 right-0 z-10 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg py-1 w-44">
                    <button
                      type="button"
                      onClick={() => {
                        exportJSON()
                        setIsExportOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300"
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportCSV()
                        setIsExportOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        copyLink()
                        setIsExportOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300"
                    >
                      <span className="flex items-center gap-2">
                        <ClipboardCopy className="w-3.5 h-3.5" />
                        Copy Link
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
            {isRunning && (
              <ConnectionStatusIndicator
                status={connectionStatus}
                isWebSocket={isWebSocket}
                compact
              />
            )}
          </div>
        </div>
      </div>

      {/* RUNNING: Progress Hero */}
      {isRunning && (
        <ErrorBoundary
          fallback={
            <div className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-6 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">
                Something went wrong loading run progress.
              </p>
            </div>
          }
        >
          <EvalRunProgress
            runId={runId}
            status={currentStatus}
            onPause={() => pauseMutation.mutate(runId)}
            onResume={() => resumeMutation.mutate(runId)}
            onCancel={() => {
              if (confirm('Are you sure you want to cancel this eval run?')) {
                cancelMutation.mutate(runId)
              }
            }}
            isPausing={pauseMutation.isPending}
            isResuming={resumeMutation.isPending}
            isCancelling={cancelMutation.isPending}
            connectionStatus={connectionStatus}
            isWebSocket={isWebSocket}
          />
        </ErrorBoundary>
      )}

      {/* FAILED: Error Card */}
      {isFailed && (
        <div className="bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <XCircle className="w-6 h-6 text-red-500" />
            <h3 className="font-semibold text-red-800 dark:text-red-300">
              Failed
            </h3>
          </div>
          {currentStatus.progress && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Completed {currentStatus.progress.completed} of{' '}
              {currentStatus.progress.total} cases before failure.
            </p>
          )}
          {(currentStatus.error || run.error) && (
            <pre className="text-sm font-mono text-red-700 dark:text-red-400 whitespace-pre-wrap bg-red-100 dark:bg-red-500/10 rounded-lg p-3">
              {currentStatus.error || run.error}
            </pre>
          )}
        </div>
      )}

      {/* Results Summary Stat Cards */}
      {(isComplete || (isFailed && totalCases > 0)) && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Pass Rate
              </p>
              <p
                className={`text-2xl font-bold ${
                  passRate >= 0.9
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : passRate >= 0.7
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {Math.round(passRate * 100)}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {passedCount}/{totalCases} pass
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Avg Score
              </p>
              <p
                className={`text-2xl font-bold ${
                  avgScore >= 0.9
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : avgScore >= 0.7
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {avgScore.toFixed(2)}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Total Cases
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {totalCases}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Duration
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {duration || '--'}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Error Rate
              </p>
              <p
                className={`text-2xl font-bold ${
                  failedCount === 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : failedCount / totalCases <= 0.1
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {totalCases > 0
                  ? `${Math.round((failedCount / totalCases) * 100)}%`
                  : '0%'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {failedCount}/{totalCases} error
              </p>
            </div>
          </div>
          {isFailed && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">
              Based on {totalCases} of{' '}
              {currentStatus.progress?.total ?? '?'} cases
            </p>
          )}
        </div>
      )}

      {/* Scorer Breakdown */}
      {scorerBreakdown.length > 0 &&
        (isComplete || (isFailed && totalCases > 0) || (isRunning && totalCases >= 10)) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Per-Scorer Pass Rates */}
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Scorer Results
              </h3>
              {isRunning && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 italic">
                  Partial — based on {totalCases}/{currentStatus.progress?.total ?? '?'} completed cases
                </p>
              )}
              <div className="space-y-3">
                {scorerBreakdown.map((scorer) => {
                  const pct = Math.round(scorer.passRate * 100)
                  const barColor =
                    pct >= 90
                      ? 'bg-emerald-500'
                      : pct >= 70
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  return (
                    <div key={scorer.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {scorer.name.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`text-sm font-semibold ${
                            pct >= 90
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : pct >= 70
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-dark-700">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {scorer.passed}/{scorer.total} pass &middot; avg{' '}
                        {scorer.avgScore.toFixed(2)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Score Distribution Histogram */}
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Score Distribution
              </h3>
              {totalCases >= 5 ? (
                <div className="flex items-end gap-1 h-[180px]">
                  {scoreDistribution.map((bin) => (
                    <div
                      key={bin.range}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    >
                      <div
                        className="w-full bg-cyan-500 dark:bg-cyan-400 rounded-t transition-all hover:bg-cyan-600 dark:hover:bg-cyan-300"
                        style={{
                          height: `${(bin.count / maxBinCount) * 100}%`,
                          minHeight: bin.count > 0 ? '4px' : '0',
                        }}
                      />
                      <span className="text-[9px] text-gray-400 dark:text-gray-500 mt-1">
                        {bin.range.split('-')[0]}
                      </span>
                      {/* Tooltip */}
                      {bin.count > 0 && (
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-2 py-1 rounded whitespace-nowrap">
                          {bin.range}: {bin.count} case
                          {bin.count !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {results.map((r, i) => {
                    const caseAvg =
                      r.scores.length > 0
                        ? r.scores.reduce((s, sc) => s + sc.value, 0) /
                          r.scores.length
                        : 0
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="text-gray-500 dark:text-gray-400 w-20 truncate">
                          {r.caseName || `Case #${r.caseIndex + 1}`}
                        </span>
                        <ScoreBadge score={caseAvg} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      {/* Test Results */}
      {results.length > 0 && (
        <ErrorBoundary
          fallback={
            <div className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-6 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">
                Something went wrong loading eval results.
              </p>
            </div>
          }
        >
          <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl overflow-hidden">
            {/* Results Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Results
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {totalCases} cases &middot;{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {passedCount} passed
                    </span>{' '}
                    &middot;{' '}
                    <span className="text-rose-600 dark:text-rose-400">
                      {failedCount} failed
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRows(
                        new Set(filteredResults.map((_, i) => i)),
                      )
                    }
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Expand all
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={() => setExpandedRows(new Set())}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-1">
                {(
                  [
                    ['all', `All (${totalCases})`],
                    ['passed', `Passed (${passedCount})`],
                    ['failed', `Failed (${failedCount})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleFilterChange(key)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      resultFilter === key
                        ? 'bg-gray-100 dark:bg-dark-700 text-gray-900 dark:text-gray-100 font-medium'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Table */}
            <div>
              {/* Table Header */}
              <div className="grid grid-cols-[2rem_1fr_4rem_4rem_4rem_4rem] px-4 py-2 bg-gray-50 dark:bg-dark-900 border-b border-gray-200 dark:border-dark-700 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                <div />
                <div>Test Case</div>
                <div>Status</div>
                <div>Score</div>
                <div>Lat.</div>
                <div>Trace</div>
              </div>

              {filteredResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                  No results to display
                </div>
              ) : (
                filteredResults.map((result, index) => {
                  const passed = result.result.status === 'completed'
                  const caseAvg =
                    result.scores.length > 0
                      ? result.scores.reduce((s, sc) => s + sc.value, 0) /
                        result.scores.length
                      : 0
                  const isExpanded = expandedRows.has(index)
                  const latency = result.result.executionTimeMs
                    ? `${(result.result.executionTimeMs / 1000).toFixed(1)}s`
                    : '--'

                  return (
                    <div key={result.caseIndex} className="border-b border-gray-100 dark:border-dark-700 last:border-b-0">
                      {/* Row */}
                      <div
                        className={`grid grid-cols-[2rem_1fr_4rem_4rem_4rem_4rem] items-center px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-dark-700/50 ${
                          !passed ? 'bg-rose-50/30 dark:bg-rose-500/3' : ''
                        }`}
                        onClick={() => toggleRow(index)}
                      >
                        <div className="text-gray-400 dark:text-gray-500">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {result.caseName || `Case #${result.caseIndex + 1}`}
                        </div>
                        <div className="flex items-center gap-1">
                          {passed ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500" />
                          )}
                          <span
                            className={`text-xs font-medium ${
                              passed
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {passed ? 'OK' : '!!'}
                          </span>
                        </div>
                        <div>
                          <ScoreBadge score={caseAvg} />
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {latency}
                        </div>
                        <div>
                          <Link
                            href={`/traces/${result.result.traceId}`}
                            className="inline-flex items-center gap-0.5 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="px-4 py-4 bg-gray-50 dark:bg-dark-900 border-t border-gray-200 dark:border-dark-700">
                          {/* Score cards */}
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                            {result.scores.map((score) => (
                              <div
                                key={score.name}
                                className="bg-white dark:bg-dark-800 rounded-lg p-3 border border-gray-200 dark:border-dark-700"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {score.name.replace(/_/g, ' ')}
                                  </span>
                                  <ScoreBadge score={score.value} />
                                </div>
                                {score.reason && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                    {score.reason}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                            <span>
                              Iterations: {result.result.iterations}
                            </span>
                            <span>
                              Trace:{' '}
                              <Link
                                href={`/traces/${result.result.traceId}`}
                                className="font-mono text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
                              >
                                {result.result.traceId.slice(0, 16)}...
                              </Link>
                            </span>
                          </div>

                          {result.result.reason && (
                            <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 rounded-lg">
                              <p className="text-sm text-rose-800 dark:text-rose-300">
                                {result.result.reason}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </ErrorBoundary>
      )}

      {/* Empty results states */}
      {results.length === 0 && isComplete && (
        <div className="border border-gray-200 dark:border-dark-700 rounded-xl p-8 text-center">
          <FileQuestion className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
            No results
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This run completed but produced no case results. This may indicate a
            configuration issue.
          </p>
        </div>
      )}

      {results.length === 0 && isRunning && (
        <div className="border border-gray-200 dark:border-dark-700 rounded-xl p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto mb-3" />
          <p className="font-medium text-gray-600 dark:text-gray-300">
            Running evaluation cases...
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Results will appear here as cases complete.
          </p>
        </div>
      )}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000)
    const secs = Math.round((ms % 60000) / 1000)
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  const hours = Math.floor(ms / 3600000)
  const mins = Math.round((ms % 3600000) / 60000)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}
