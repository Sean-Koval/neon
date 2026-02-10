'use client'

/**
 * Suite Detail Page — Redesigned
 *
 * Implements tickets:
 *   neon-od6k: Suite detail action buttons (Run Suite, Edit Suite, Delete)
 *   neon-iere: Summary stat cards
 *   neon-n78f: Expandable test case cards
 *   neon-r211: Score trend chart
 *   neon-7qso: Run history table
 *   neon-kxw1: Add Case button/form
 *   neon-8886: Evaluation Defaults card (config section)
 */

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  ListChecks,
  Loader2,
  MinusCircle,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Tag,
  Target,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { StartEvalRunDialog } from '@/components/eval-runs'
import { useStartWorkflowRun } from '@/hooks/use-workflow-runs'
import { useToast } from '@/components/toast'
import { CONFIG } from '@/lib/config'
import { safeFormatDistance } from '@/lib/format-date'
import { trpc } from '@/lib/trpc'
import type { StartEvalRunRequest } from '@/lib/types'

interface SuiteData {
  id: string
  name: string
  description?: string
  agent_id?: string
  default_scorers?: string[]
  default_min_score?: number
  default_timeout_seconds?: number
  parallel?: boolean
  stop_on_failure?: boolean
  created_at?: string
  updated_at?: string
}

interface CaseData {
  id: string
  name: string
  description?: string
  input?: Record<string, unknown>
  expected_tools?: string[]
  expected_tool_sequence?: string[]
  expected_output_contains?: string[]
  expected_output_pattern?: string
  scorers?: string[]
  min_score?: number
  tags?: string[]
  timeout_seconds?: number
}

interface EvalRun {
  id: string
  status?: string
  agent_version?: string
  trigger?: string
  summary?: {
    total_cases?: number
    passed?: number
    avg_score?: number
  }
  created_at?: string
}

export default function SuiteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { addToast } = useToast()
  const suiteId = typeof params.id === 'string' ? params.id : ''

  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set())
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  // Fetch suite detail
  const {
    data: suiteData,
    isLoading: suiteLoading,
    error: suiteError,
    refetch: refetchSuite,
  } = trpc.suites.get.useQuery({ suiteId }, { enabled: !!suiteId, staleTime: 5 * 60 * 1000 })

  // Fetch cases
  const {
    data: casesData,
    isLoading: casesLoading,
    error: casesError,
    refetch: refetchCases,
  } = trpc.suites.listCases.useQuery({ suiteId }, { enabled: !!suiteId })

  // Fetch run history
  const { data: runsData } = trpc.evals.listRuns.useQuery(
    { suiteId, limit: 10 },
    { enabled: !!suiteId, staleTime: 2 * 60 * 1000 },
  )

  // Mutations
  const deleteMutation = trpc.suites.delete.useMutation()
  const startMutation = useStartWorkflowRun()

  const suite = suiteData as SuiteData | undefined
  const cases: CaseData[] = useMemo(() => {
    if (!casesData) return []
    return Array.isArray(casesData)
      ? casesData
      : (casesData as { items?: CaseData[]; cases?: CaseData[] })?.items ??
          (casesData as { cases?: CaseData[] })?.cases ??
          []
  }, [casesData])

  const runs: EvalRun[] = useMemo(() => {
    if (!runsData) return []
    return Array.isArray(runsData)
      ? runsData
      : (runsData as { items?: EvalRun[] })?.items ?? []
  }, [runsData])

  const isLoading = suiteLoading || casesLoading

  // Summary stats
  const summaryStats = useMemo(() => {
    const lastCompletedRun = runs.find(
      (r) => r.status === 'COMPLETED' || r.status === 'completed',
    )
    return {
      caseCount: cases.length,
      lastPassRate:
        lastCompletedRun?.summary?.passed != null &&
        lastCompletedRun?.summary?.total_cases
          ? lastCompletedRun.summary.passed /
            lastCompletedRun.summary.total_cases
          : null,
      avgScore: lastCompletedRun?.summary?.avg_score ?? null,
      totalRuns: runs.length,
    }
  }, [cases, runs])

  // Score trend chart data
  const trendData = useMemo(() => {
    return runs
      .filter((r) => r.status === 'COMPLETED' || r.status === 'completed')
      .reverse()
      .map((run, index) => ({
        runNumber: index + 1,
        avgScore: run.summary?.avg_score ?? 0,
        passRate: run.summary?.passed && run.summary?.total_cases
          ? run.summary.passed / run.summary.total_cases
          : 0,
        runId: run.id,
        date: run.created_at,
      }))
  }, [runs])

  const toggleCase = (caseId: string) => {
    setExpandedCases((prev) => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate(
      { suiteId },
      {
        onSuccess: () => {
          addToast('Suite deleted successfully', 'success')
          router.push('/suites')
        },
        onError: (err) => {
          addToast(`Failed to delete suite: ${err.message}`, 'error')
        },
      },
    )
  }

  const handleStartRun = (request: StartEvalRunRequest) => {
    setStartError(null)
    startMutation.mutate(request, {
      onSuccess: (data: { workflowId?: string }) => {
        setIsDialogOpen(false)
        if (data?.workflowId) {
          router.push(`/eval-runs/${data.workflowId}`)
        }
      },
      onError: (err: Error) => {
        setStartError(err.message)
      },
    })
  }

  // Loading
  if (isLoading) {
    return <SuiteDetailSkeleton />
  }

  // Error
  if (suiteError || !suite) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Suite not found
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {suiteError?.message || 'This suite may have been deleted.'}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => refetchSuite()}
            className="btn btn-secondary"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          <Link
            href="/suites"
            className="text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
          >
            Back to Suites
          </Link>
        </div>
      </div>
    )
  }

  const minScore = suite.default_min_score ?? CONFIG.DEFAULT_MIN_SCORE ?? 0.7

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/suites"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Suites
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {suite.name}
        </h1>
        {suite.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {suite.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              setStartError(null)
              setIsDialogOpen(true)
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            Run Suite
          </button>
          <Link
            href={`/suites/${suiteId}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-dark-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300"
          >
            <Pencil className="w-4 h-4" />
            Edit Suite
          </Link>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Test Cases
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {summaryStats.caseCount}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Last Pass Rate
          </p>
          <p
            className={`text-2xl font-bold ${
              summaryStats.lastPassRate === null
                ? 'text-gray-900 dark:text-gray-100'
                : summaryStats.lastPassRate >= 0.9
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : summaryStats.lastPassRate >= 0.7
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {summaryStats.lastPassRate !== null
              ? `${Math.round(summaryStats.lastPassRate * 100)}%`
              : '--'}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Avg Score
          </p>
          <p
            className={`text-2xl font-bold ${
              summaryStats.avgScore === null
                ? 'text-gray-900 dark:text-gray-100'
                : summaryStats.avgScore >= 0.85
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : summaryStats.avgScore >= 0.7
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {summaryStats.avgScore !== null
              ? summaryStats.avgScore.toFixed(2)
              : '--'}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Total Runs
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {summaryStats.totalRuns}
          </p>
        </div>
      </div>

      {/* Configuration Card */}
      <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Configuration
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
              Agent
            </p>
            {suite.agent_id ? (
              <Link
                href={`/agents/${suite.agent_id}`}
                className="text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
              >
                {suite.agent_id}
              </Link>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Not set
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
              Min Score
            </p>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {minScore}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
              Timeout
            </p>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {suite.default_timeout_seconds ?? 30}s
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
              Execution
            </p>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {suite.parallel !== false ? 'Parallel' : 'Sequential'}
              {suite.stop_on_failure && (
                <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">
                  (stops on first failure)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Default Scorers */}
        {suite.default_scorers && suite.default_scorers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-700">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Default Scorers
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suite.default_scorers.map((scorer) => (
                <span
                  key={scorer}
                  className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-400"
                >
                  {scorer.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Test Cases */}
      <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ListChecks className="w-5 h-5" />
            Test Cases
            {cases.length > 0 && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({cases.length})
              </span>
            )}
          </h2>
          <Link
            href={`/suites/${suiteId}/edit`}
            className="inline-flex items-center gap-1 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
          >
            <Plus className="w-4 h-4" />
            Add Case
          </Link>
        </div>

        {casesError ? (
          <div className="p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Failed to load test cases
            </p>
            <button
              type="button"
              onClick={() => refetchCases()}
              className="mt-2 text-sm text-cyan-600 dark:text-cyan-400"
            >
              Retry
            </button>
          </div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center">
            <ListChecks className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
              No test cases
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Add test cases to start evaluating this agent.
            </p>
            <Link
              href={`/suites/${suiteId}/edit`}
              className="inline-flex items-center gap-1 text-sm bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700"
            >
              <Plus className="w-4 h-4" />
              Add Case
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-700">
            {cases.map((testCase, index) => {
              const isExpanded = expandedCases.has(testCase.id)
              const hasSameScorers =
                !testCase.scorers ||
                testCase.scorers.length === 0 ||
                JSON.stringify(testCase.scorers?.sort()) ===
                  JSON.stringify(suite.default_scorers?.sort())

              return (
                <div key={testCase.id}>
                  {/* Collapsed Header */}
                  <div
                    className="flex items-center px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700/30 transition-colors"
                    onClick={() => toggleCase(testCase.id)}
                  >
                    <div className="text-gray-400 dark:text-gray-500 mr-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                    <span className="text-sm text-gray-400 dark:text-gray-500 w-8">
                      {index + 1}.
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 truncate">
                      {testCase.name}
                    </span>
                    {testCase.min_score != null && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-dark-700 px-2 py-0.5 rounded ml-2">
                        Min: {testCase.min_score}
                      </span>
                    )}
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-5 py-4 bg-gray-50/50 dark:bg-dark-900/30 border-t border-gray-100 dark:border-dark-700">
                      {testCase.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                          {testCase.description}
                        </p>
                      )}

                      {/* Input JSON */}
                      {testCase.input &&
                        Object.keys(testCase.input).length > 0 && (
                          <div className="mb-3">
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                              Input
                            </p>
                            <pre className="bg-gray-100 dark:bg-dark-800 rounded-lg p-3 font-mono text-xs text-gray-700 dark:text-gray-300 max-h-[200px] overflow-y-auto">
                              {JSON.stringify(testCase.input, null, 2)}
                            </pre>
                          </div>
                        )}

                      {/* Expectations */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        {testCase.expected_tools &&
                          testCase.expected_tools.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                Expected Tools
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {testCase.expected_tools.map((tool) => (
                                  <span
                                    key={tool}
                                    className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded font-mono"
                                  >
                                    {tool}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                        {testCase.expected_tool_sequence &&
                          testCase.expected_tool_sequence.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                Expected Tool Sequence (Ordered)
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {testCase.expected_tool_sequence.map(
                                  (tool, i) => (
                                    <span
                                      key={`${tool}-${i}`}
                                      className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded font-mono"
                                    >
                                      {i + 1}. {tool}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                        {testCase.expected_output_contains &&
                          testCase.expected_output_contains.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                Expected Output Contains
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {testCase.expected_output_contains.map(
                                  (text, i) => (
                                    <span
                                      key={i}
                                      className="text-xs bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded"
                                    >
                                      {text}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                        {testCase.expected_output_pattern && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                              Output Pattern
                            </p>
                            <code className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-800 px-2 py-1 rounded">
                              /{testCase.expected_output_pattern}/
                            </code>
                          </div>
                        )}

                        {!testCase.expected_tools?.length &&
                          !testCase.expected_tool_sequence?.length &&
                          !testCase.expected_output_contains?.length &&
                          !testCase.expected_output_pattern && (
                            <p className="text-sm text-gray-400 dark:text-gray-500 italic col-span-2">
                              No output expectations
                            </p>
                          )}
                      </div>

                      {/* Case Config */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                        <span>
                          Scorers:{' '}
                          {hasSameScorers ? (
                            <span className="text-gray-400 dark:text-gray-500">
                              Suite defaults
                            </span>
                          ) : (
                            testCase.scorers?.map((s) => (
                              <span
                                key={s}
                                className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-400 mx-0.5"
                              >
                                {s.replace(/_/g, ' ')}
                              </span>
                            ))
                          )}
                        </span>
                        {testCase.timeout_seconds && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {testCase.timeout_seconds}s timeout
                          </span>
                        )}
                        {testCase.tags && testCase.tags.length > 0 && (
                          <span className="flex items-center gap-1">
                            {testCase.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              >
                                <Tag className="w-2.5 h-2.5" />
                                {tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Score Trend Chart */}
      <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Score Trend
        </h2>
        {trendData.length >= 2 ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis
                  dataKey="runNumber"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v) => `#${v}`}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v) => v.toFixed(1)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.[0]) {
                      const data = payload[0].payload
                      return (
                        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg p-2 text-xs">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            Run #{data.runNumber}
                          </p>
                          <p className="text-gray-500 dark:text-gray-400">
                            Score: {data.avgScore.toFixed(2)}
                          </p>
                          <p className="text-gray-500 dark:text-gray-400">
                            Pass: {Math.round(data.passRate * 100)}%
                          </p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <ReferenceLine
                  y={minScore}
                  stroke="#9ca3af"
                  strokeDasharray="4 4"
                  label={{
                    value: `min: ${minScore}`,
                    position: 'left',
                    fill: '#9ca3af',
                    fontSize: 10,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-8">
            Run this suite at least twice to see score trends.
          </p>
        )}
      </div>

      {/* Run History */}
      <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Run History
          </h2>
          <Link
            href={`/eval-runs?suite_id=${suiteId}`}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            View All Runs
          </Link>
        </div>

        {runs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              No runs yet. Run this suite to see execution history and score
              trends.
            </p>
            <button
              type="button"
              onClick={() => {
                setStartError(null)
                setIsDialogOpen(true)
              }}
              className="inline-flex items-center gap-1 text-sm bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700"
            >
              <Play className="w-4 h-4" />
              Run Suite
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-900 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                  <th className="px-4 py-2 text-left">Run</th>
                  <th className="px-4 py-2 text-left">Version</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Pass</th>
                  <th className="px-4 py-2 text-left">Score</th>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                {runs.map((run, index) => {
                  const runPassRate =
                    run.summary?.passed != null && run.summary?.total_cases
                      ? run.summary.passed / run.summary.total_cases
                      : null
                  const runStatus =
                    run.status?.toUpperCase() || 'UNKNOWN'
                  const isCompleted =
                    runStatus === 'COMPLETED'
                  const isFailed = runStatus === 'FAILED'
                  const isRunning = runStatus === 'RUNNING'
                  const isCancelled = runStatus === 'CANCELLED'

                  return (
                    <tr
                      key={run.id}
                      className="hover:bg-gray-50 dark:hover:bg-dark-700/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/eval-runs/${run.id}`)}
                    >
                      <td className="px-4 py-2.5 font-mono text-gray-900 dark:text-gray-100">
                        #{runs.length - index}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {run.agent_version || '--'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs">
                          {isCompleted && (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">
                                done
                              </span>
                            </>
                          )}
                          {isFailed && (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span className="text-rose-600 dark:text-rose-400">
                                fail
                              </span>
                            </>
                          )}
                          {isRunning && (
                            <>
                              <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                              <span className="text-amber-600 dark:text-amber-400">
                                running
                              </span>
                            </>
                          )}
                          {isCancelled && (
                            <>
                              <MinusCircle className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-500 dark:text-gray-400">
                                cancel
                              </span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {runPassRate !== null ? (
                          <span
                            className={`font-medium text-xs ${
                              runPassRate >= 0.9
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : runPassRate >= 0.7
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {Math.round(runPassRate * 100)}%
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">
                            --
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {run.summary?.avg_score != null ? (
                          <span
                            className={`font-medium text-xs ${
                              run.summary.avg_score >= 0.85
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : run.summary.avg_score >= 0.7
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {run.summary.avg_score.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">
                            --
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                        {run.created_at
                          ? safeFormatDistance(run.created_at)
                          : '--'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                        {run.trigger === 'scheduled'
                          ? 'sched.'
                          : run.trigger || 'manual'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Start Eval Run Dialog */}
      <StartEvalRunDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onStart={handleStartRun}
        isStarting={startMutation.isPending}
        error={startError}
        prefilledSuiteId={suiteId}
      />

      {/* Delete Confirmation Dialog */}
      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsDeleteOpen(false)}
          />
          <div className="relative bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-6 max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete &quot;{suite.name}&quot;?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              This will permanently delete this suite and all{' '}
              {cases.length} test case{cases.length !== 1 ? 's' : ''}.
              This action cannot be undone.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Existing eval runs that used this suite will not be affected —
              their results are stored independently.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete Suite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SuiteDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-1 text-sm text-gray-400">
        <ArrowLeft className="w-4 h-4" />
        Back to Suites
      </div>
      <div className="animate-pulse space-y-6">
        <div>
          <div className="h-7 w-64 bg-gray-200 dark:bg-dark-700 rounded mb-2" />
          <div className="h-4 w-96 bg-gray-200 dark:bg-dark-700 rounded mb-3" />
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
            <div className="h-9 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
            <div className="h-9 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-4">
              <div className="h-3 w-16 bg-gray-200 dark:bg-dark-700 rounded mb-2" />
              <div className="h-7 w-12 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
          <div className="h-4 w-24 bg-gray-200 dark:bg-dark-700 rounded mb-3" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="h-3 w-16 bg-gray-200 dark:bg-dark-700 rounded mb-1" />
                <div className="h-4 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-xl p-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-dark-700 rounded mb-2" />
          ))}
        </div>
      </div>
    </div>
  )
}
