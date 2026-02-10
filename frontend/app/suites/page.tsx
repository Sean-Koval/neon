'use client'

/**
 * Suites List Page — Redesigned
 *
 * Implements tickets:
 *   neon-19rl: Fix New Suite button (links to /suites/new)
 *   neon-orb5: Summary stats strip
 *   neon-fsrr: Search and filters
 *   neon-oa3k: Last run stats to cards
 *   neon-mqtm: Run Suite button
 *   neon-d7lt: Agent name and scorer badges
 */

import {
  AlertCircle,
  ChevronRight,
  Clock,
  FlaskConical,
  Play,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { StartEvalRunDialog } from '@/components/eval-runs'
import { useStartWorkflowRun } from '@/hooks/use-workflow-runs'
import { safeFormatDistance } from '@/lib/format-date'
import { trpc } from '@/lib/trpc'
import type { StartEvalRunRequest } from '@/lib/types'

interface Suite {
  id: string
  name: string
  description?: string
  agent_id?: string
  default_scorers?: string[]
  default_min_score?: number
  default_timeout_seconds?: number
  created_at?: string
  cases?: unknown[]
}

interface EvalRun {
  id: string
  suite_id?: string
  status?: string
  summary?: {
    total_cases?: number
    passed?: number
    avg_score?: number
  }
  created_at?: string
}

const SCORER_LABELS: Record<string, string> = {
  tool_selection: 'Tool',
  reasoning: 'Reason',
  grounding: 'Ground',
  efficiency: 'Effic',
  custom: 'Custom',
}

type SortOption = 'last_run' | 'name' | 'cases' | 'pass_rate'

export default function SuitesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [agentFilter, setAgentFilter] = useState(
    searchParams.get('agent') || '',
  )
  const [scorerFilter, setScorerFilter] = useState(
    searchParams.get('scorer') || '',
  )
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get('sort') as SortOption) || 'last_run',
  )

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [prefilledSuiteId, setPrefilledSuiteId] = useState<string>()
  const [startError, setStartError] = useState<string | null>(null)

  // Fetch suites
  const {
    data: suitesData,
    isLoading,
    error,
    refetch,
  } = trpc.suites.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })

  // Fetch runs for last-run stats
  const { data: runsData } = trpc.evals.listRuns.useQuery(
    { limit: 200 },
    { staleTime: 2 * 60 * 1000 },
  )

  const startMutation = useStartWorkflowRun()

  const suites: Suite[] = useMemo(() => {
    if (!suitesData) return []
    return Array.isArray(suitesData)
      ? suitesData
      : ((suitesData as { items?: Suite[] })?.items ??
          (suitesData as { suites?: Suite[] })?.suites ??
          [])
  }, [suitesData])

  const runs: EvalRun[] = useMemo(() => {
    if (!runsData) return []
    return Array.isArray(runsData)
      ? runsData
      : ((runsData as { items?: EvalRun[] })?.items ?? [])
  }, [runsData])

  // Last run per suite
  const lastRunMap = useMemo(() => {
    const map = new Map<string, EvalRun>()
    for (const run of runs) {
      if (!run.suite_id) continue
      const existing = map.get(run.suite_id)
      if (
        !existing ||
        new Date(run.created_at || 0) > new Date(existing.created_at || 0)
      ) {
        map.set(run.suite_id, run)
      }
    }
    return map
  }, [runs])

  // Unique agents for filter dropdown
  const uniqueAgents = useMemo(
    () =>
      [...new Set(suites.map((s) => s.agent_id).filter(Boolean))] as string[],
    [suites],
  )

  // Update URL params
  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      router.replace(`/suites?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Filter + sort suites
  const filteredSuites = useMemo(() => {
    let result = suites

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q),
      )
    }

    // Agent filter
    if (agentFilter) {
      result = result.filter((s) => s.agent_id === agentFilter)
    }

    // Scorer filter
    if (scorerFilter) {
      result = result.filter((s) => s.default_scorers?.includes(scorerFilter))
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'cases':
          return (
            ((b.cases as unknown[])?.length ?? 0) -
            ((a.cases as unknown[])?.length ?? 0)
          )
        case 'pass_rate': {
          const aRun = lastRunMap.get(a.id)
          const bRun = lastRunMap.get(b.id)
          const aRate =
            aRun?.summary?.passed && aRun?.summary?.total_cases
              ? aRun.summary.passed / aRun.summary.total_cases
              : -1
          const bRate =
            bRun?.summary?.passed && bRun?.summary?.total_cases
              ? bRun.summary.passed / bRun.summary.total_cases
              : -1
          return bRate - aRate
        }
        default: {
          const aRun = lastRunMap.get(a.id)
          const bRun = lastRunMap.get(b.id)
          if (!aRun && !bRun) return 0
          if (!aRun) return 1
          if (!bRun) return -1
          return (
            new Date(bRun.created_at || 0).getTime() -
            new Date(aRun.created_at || 0).getTime()
          )
        }
      }
    })

    return result
  }, [suites, searchQuery, agentFilter, scorerFilter, sortBy, lastRunMap])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalCases = suites.reduce(
      (sum, s) => sum + ((s.cases as unknown[])?.length ?? 0),
      0,
    )
    const suitesWithRuns = suites.filter((s) => lastRunMap.has(s.id))
    const avgPassRate =
      suitesWithRuns.length > 0
        ? suitesWithRuns.reduce((sum, s) => {
            const run = lastRunMap.get(s.id)
            if (run?.summary?.passed && run?.summary?.total_cases) {
              return sum + run.summary.passed / run.summary.total_cases
            }
            return sum
          }, 0) / suitesWithRuns.length
        : 0

    // Most recent run time
    let lastRunTime: string | null = null
    for (const run of runs) {
      if (
        !lastRunTime ||
        new Date(run.created_at || 0) > new Date(lastRunTime)
      ) {
        lastRunTime = run.created_at || null
      }
    }

    return {
      suiteCount: suites.length,
      totalCases,
      avgPassRate,
      lastRunTime,
    }
  }, [suites, lastRunMap, runs])

  const hasActiveFilters = searchQuery || agentFilter || scorerFilter

  const handleRunSuite = (suiteId: string) => {
    setPrefilledSuiteId(suiteId)
    setStartError(null)
    setIsDialogOpen(true)
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

  const clearFilters = () => {
    setSearchQuery('')
    setAgentFilter('')
    setScorerFilter('')
    updateParams({ q: '', agent: '', scorer: '' })
  }

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-content-primary">
              Evaluation Suites
            </h1>
            <p className="text-sm text-content-secondary">
              Reusable test definitions for evaluating agent capabilities
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-border bg-surface-card px-3 py-1 text-xs font-medium text-content-secondary">
              {suites.length} total
            </span>
            <Link href="/suites/new" className="btn btn-primary">
              <Plus className="w-4 h-4" />
              Create Suite
            </Link>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {!isLoading && suites.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="group relative overflow-hidden rounded-xl border border-border bg-surface-card p-4 shadow-sm transition-colors dark:border-slate-700/80 dark:bg-slate-900/75">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
            <p className="mb-1 text-[10px] uppercase tracking-wider text-content-muted">
              Suites
            </p>
            <p className="text-2xl font-bold text-content-primary">
              {summaryStats.suiteCount}
            </p>
          </div>
          <div className="group relative overflow-hidden rounded-xl border border-border bg-surface-card p-4 shadow-sm transition-colors dark:border-slate-700/80 dark:bg-slate-900/75">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
            <p className="mb-1 text-[10px] uppercase tracking-wider text-content-muted">
              Total Cases
            </p>
            <p className="text-2xl font-bold text-content-primary">
              {summaryStats.totalCases}
            </p>
          </div>
          <div className="group relative overflow-hidden rounded-xl border border-border bg-surface-card p-4 shadow-sm transition-colors dark:border-slate-700/80 dark:bg-slate-900/75">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
            <p className="mb-1 text-[10px] uppercase tracking-wider text-content-muted">
              Avg Pass Rate
            </p>
            <p
              className={`text-2xl font-bold ${
                summaryStats.avgPassRate >= 0.9
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : summaryStats.avgPassRate >= 0.7
                    ? 'text-amber-600 dark:text-amber-400'
                    : summaryStats.avgPassRate > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-content-primary'
              }`}
            >
              {summaryStats.avgPassRate > 0
                ? `${Math.round(summaryStats.avgPassRate * 100)}%`
                : '--'}
            </p>
          </div>
          <div className="group relative overflow-hidden rounded-xl border border-border bg-surface-card p-4 shadow-sm transition-colors dark:border-slate-700/80 dark:bg-slate-900/75">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
            <p className="mb-1 text-[10px] uppercase tracking-wider text-content-muted">
              Last Run
            </p>
            <p className="text-2xl font-bold text-content-primary">
              {summaryStats.lastRunTime
                ? safeFormatDistance(summaryStats.lastRunTime)
                : '--'}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {!isLoading && suites.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-card/95 p-3 backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  updateParams({ q: e.target.value })
                }}
                placeholder="Search suites..."
                className="w-full rounded-lg border border-border bg-surface-card py-2 pl-9 pr-3 text-sm text-content-primary placeholder:text-content-muted focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            {/* Agent filter */}
            <select
              value={agentFilter}
              onChange={(e) => {
                setAgentFilter(e.target.value)
                updateParams({ agent: e.target.value })
              }}
              className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary"
            >
              <option value="">All Agents</option>
              {uniqueAgents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>

            {/* Scorer filter */}
            <select
              value={scorerFilter}
              onChange={(e) => {
                setScorerFilter(e.target.value)
                updateParams({ scorer: e.target.value })
              }}
              className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary"
            >
              <option value="">All Scorers</option>
              <option value="tool_selection">Tool Selection</option>
              <option value="reasoning">Reasoning</option>
              <option value="grounding">Grounding</option>
              <option value="efficiency">Efficiency</option>
              <option value="custom">Custom</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption)
                updateParams({ sort: e.target.value })
              }}
              className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary"
            >
              <option value="last_run">Sort: Last Run</option>
              <option value="name">Sort: Name</option>
              <option value="cases">Sort: Cases</option>
              <option value="pass_rate">Sort: Pass Rate</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SuitesSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <h3 className="font-medium text-content-primary">
            Failed to load suites
          </h3>
          <p className="text-sm text-content-muted">
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn btn-secondary"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      ) : suites.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20">
          <FlaskConical className="w-12 h-12 text-content-muted" />
          <h3 className="text-lg font-semibold text-content-primary">
            No evaluation suites yet
          </h3>
          <p className="max-w-md text-center text-sm text-content-muted">
            Create your first suite to start evaluating your agents with
            reusable test definitions.
          </p>
          <Link href="/suites/new" className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Create Suite
          </Link>
        </div>
      ) : filteredSuites.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <Search className="w-10 h-10 text-content-muted" />
          <h3 className="font-medium text-content-primary">
            No suites match your filters
          </h3>
          <p className="text-sm text-content-muted">
            Try adjusting your search or filter criteria.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="btn btn-secondary text-sm"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredSuites.map((suite) => (
            <SuiteCard
              key={suite.id}
              suite={suite}
              lastRun={lastRunMap.get(suite.id)}
              onRunSuite={() => handleRunSuite(suite.id)}
            />
          ))}
        </div>
      )}

      {/* Start Eval Run Dialog */}
      <StartEvalRunDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onStart={handleStartRun}
        isStarting={startMutation.isPending}
        error={startError}
        prefilledSuiteId={prefilledSuiteId}
      />
    </div>
  )
}

function SuiteCard({
  suite,
  lastRun,
  onRunSuite,
}: {
  suite: Suite
  lastRun?: EvalRun
  onRunSuite: () => void
}) {
  const caseCount = (suite.cases as unknown[])?.length ?? 0
  const scorers = suite.default_scorers || []

  const lastRunPassRate =
    lastRun?.summary?.passed != null && lastRun?.summary?.total_cases
      ? lastRun.summary.passed / lastRun.summary.total_cases
      : null

  const lastRunScore = lastRun?.summary?.avg_score ?? null

  return (
    <div className="group rounded-xl border border-border bg-surface-card p-5 shadow-sm transition-colors hover:border-primary-500/30 dark:border-slate-700/80 dark:bg-slate-900/75">
      {/* Card Header */}
      <div className="flex items-start justify-between mb-2">
        <Link
          href={`/suites/${suite.id}`}
          className="truncate font-semibold text-content-primary transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400"
        >
          {suite.name}
        </Link>
        <span className="ml-2 flex-shrink-0 text-xs text-content-muted">
          {caseCount} case{caseCount !== 1 ? 's' : ''}
        </span>
      </div>

      {suite.description && (
        <p className="mb-3 line-clamp-2 text-sm text-content-muted">
          {suite.description}
        </p>
      )}

      {/* Metadata Row */}
      <div className="space-y-2 mb-3">
        {suite.agent_id && (
          <div className="flex items-center gap-2 text-xs text-content-muted">
            <span>Agent:</span>
            <span className="text-content-secondary">{suite.agent_id}</span>
          </div>
        )}
        {scorers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {scorers.map((scorer) => (
              <span
                key={scorer}
                className="inline-flex items-center rounded border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-content-secondary dark:border-slate-700/70 dark:bg-slate-800/65"
              >
                {SCORER_LABELS[scorer] || scorer.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Last Run Stats */}
      {lastRun ? (
        <div className="mb-3 flex items-center gap-4 text-xs text-content-muted">
          {lastRun.created_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {safeFormatDistance(lastRun.created_at)}
            </span>
          )}
          {lastRunPassRate !== null && (
            <span>
              Pass:{' '}
              <span
                className={`font-medium ${
                  lastRunPassRate >= 0.9
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : lastRunPassRate >= 0.7
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {Math.round(lastRunPassRate * 100)}%
              </span>
              <span className="ml-0.5 text-content-muted">
                ({lastRun.summary?.passed}/{lastRun.summary?.total_cases})
              </span>
            </span>
          )}
          {lastRunScore !== null && (
            <span>
              Score:{' '}
              <span
                className={`font-medium ${
                  lastRunScore >= 0.85
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : lastRunScore >= 0.7
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {lastRunScore.toFixed(2)}
              </span>
            </span>
          )}
        </div>
      ) : (
        <p className="mb-3 text-sm italic text-content-muted">No runs yet</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border pt-3 dark:border-slate-700/70">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRunSuite()
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-raised dark:border-slate-700/80 dark:bg-slate-900/70 dark:hover:bg-slate-800/70"
        >
          <Play className="w-3 h-3" />
          Run Suite
        </button>
        <Link
          href={`/suites/${suite.id}`}
          className="inline-flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-content-secondary"
        >
          View
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

function SuitesSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-surface-card p-4 animate-pulse dark:border-slate-700/80 dark:bg-slate-900/75"
          >
            <div className="mb-2 h-3 w-16 rounded bg-surface-raised" />
            <div className="h-7 w-12 rounded bg-surface-raised" />
          </div>
        ))}
      </div>
      {/* Card skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-surface-card p-5 animate-pulse dark:border-slate-700/80 dark:bg-slate-900/75"
          >
            <div className="mb-3 h-5 w-40 rounded bg-surface-raised" />
            <div className="mb-2 h-4 w-full rounded bg-surface-raised" />
            <div className="mb-3 h-4 w-2/3 rounded bg-surface-raised" />
            <div className="mb-3 flex gap-2">
              <div className="h-5 w-12 rounded bg-surface-raised" />
              <div className="h-5 w-14 rounded bg-surface-raised" />
              <div className="h-5 w-10 rounded bg-surface-raised" />
            </div>
            <div className="flex gap-4">
              <div className="h-3 w-16 rounded bg-surface-raised" />
              <div className="h-3 w-12 rounded bg-surface-raised" />
            </div>
            <div className="mt-3 flex justify-between border-t border-border pt-3 dark:border-slate-700/70">
              <div className="h-7 w-20 rounded bg-surface-raised" />
              <div className="h-4 w-12 rounded bg-surface-raised" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
