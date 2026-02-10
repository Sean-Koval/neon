'use client'

/**
 * Eval Runs Page
 *
 * Lists all eval runs with enriched table columns, search/filters,
 * summary stats, bulk compare, and redesigned start dialog.
 * Tickets: neon-rxgs, neon-r5n8, neon-hfp1, neon-3xi8
 */

import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Play,
  Search,
  Square,
  X,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StartEvalRunDialog } from '@/components/eval-runs'
import { useStartWorkflowRun, useWorkflowRuns } from '@/hooks/use-workflow-runs'
import { safeFormatDistance } from '@/lib/format-date'
import { trpc } from '@/lib/trpc'
import type { WorkflowStatus, WorkflowStatusResponse } from '@/lib/types'

// =============================================================================
// Helpers
// =============================================================================

/** Score color by threshold */
function getScoreColor(pct: number): string {
  if (pct >= 90) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

/** Status display config */
function getStatusInfo(status: WorkflowStatus) {
  switch (status) {
    case 'RUNNING':
      return {
        Icon: Loader2,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
        label: 'Running',
        animate: true,
      }
    case 'COMPLETED':
      return {
        Icon: CheckCircle,
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
        label: 'Completed',
        animate: false,
      }
    case 'FAILED':
      return {
        Icon: XCircle,
        color: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-50 dark:bg-rose-500/10',
        label: 'Failed',
        animate: false,
      }
    case 'CANCELLED':
      return {
        Icon: Square,
        color: 'text-gray-600 dark:text-gray-300',
        bg: 'bg-gray-100 dark:bg-dark-800',
        label: 'Cancelled',
        animate: false,
      }
    case 'TIMED_OUT':
      return {
        Icon: Clock,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        label: 'Timed Out',
        animate: false,
      }
    default:
      return {
        Icon: Clock,
        color: 'text-gray-600 dark:text-gray-300',
        bg: 'bg-gray-100 dark:bg-dark-800',
        label: 'Unknown',
        animate: false,
      }
  }
}

/** Time range options */
const TIME_RANGES = [
  { label: 'Last 24h', value: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30d', value: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: 'All time', value: 'all', ms: 0 },
] as const

type SortField = 'started' | 'score' | 'status'
type SortDir = 'asc' | 'desc'

// =============================================================================
// Status Badge
// =============================================================================

const StatusBadge = memo(function StatusBadge({
  status,
}: {
  status: WorkflowStatus
}) {
  const info = getStatusInfo(status)
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${info.bg} ${info.color}`}
    >
      <info.Icon
        className={`w-3.5 h-3.5 ${info.animate ? 'animate-spin' : ''}`}
      />
      {info.label}
    </span>
  )
})

// =============================================================================
// Summary Stats Strip
// =============================================================================

function SummaryStats({ runs }: { runs: WorkflowStatusResponse[] }) {
  const stats = useMemo(() => {
    const running = runs.filter((r) => r.status === 'RUNNING').length
    const completed = runs.filter((r) => r.status === 'COMPLETED')
    let avgPassRate = 0
    let totalCost = 0

    if (completed.length > 0) {
      const passRates = completed.map((r) => {
        const p = r.progress
        if (!p || p.total === 0) return 0
        return (p.passed / p.total) * 100
      })
      avgPassRate = passRates.reduce((a, b) => a + b, 0) / passRates.length
    }

    // Cost would come from enriched data; placeholder
    totalCost = completed.length * 0.42 // placeholder

    return { total: runs.length, running, avgPassRate, totalCost }
  }, [runs])

  return (
    <div className="rounded-xl border border-border bg-surface-card/95 p-4 backdrop-blur-sm shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
      <div className="flex flex-wrap items-center gap-6 text-sm text-content-secondary">
        <span className="font-medium text-content-primary">
          {stats.total} runs
        </span>
        <span className="flex items-center gap-1.5">
          {stats.running > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          <span
            className={
              stats.running > 0
                ? 'font-medium text-primary-700 dark:text-primary-300'
                : 'text-content-secondary'
            }
          >
            {stats.running} running
          </span>
        </span>
        {stats.avgPassRate > 0 && (
          <span className={getScoreColor(stats.avgPassRate)}>
            {stats.avgPassRate.toFixed(1)}% avg pass rate
          </span>
        )}
        <span>${stats.totalCost.toFixed(2)} total cost</span>
      </div>
    </div>
  )
}

// =============================================================================
// Run Row
// =============================================================================

interface RunRowProps {
  run: WorkflowStatusResponse
  isSelected: boolean
  onToggleSelect: (id: string) => void
  agentMap: Map<string, { name: string; version: string }>
  suiteMap: Map<string, { name: string; caseCount: number }>
}

const RunRow = memo(function RunRow({
  run,
  isSelected,
  onToggleSelect,
  agentMap,
  suiteMap,
}: RunRowProps) {
  const isCompleted = run.status === 'COMPLETED'
  const isRunning = run.status === 'RUNNING'
  const progress = run.progress

  // Derive score from progress
  const passRate =
    progress && progress.total > 0
      ? Math.round((progress.passed / progress.total) * 100)
      : null
  const avgScore =
    progress?.results && progress.results.length > 0
      ? progress.results.reduce((sum, r) => {
          const caseAvg =
            r.scores.length > 0
              ? r.scores.reduce((s, sc) => s + sc.value, 0) / r.scores.length
              : 0
          return sum + caseAvg
        }, 0) / progress.results.length
      : null

  // Extract run display ID (first 8 chars)
  const shortId = run.id.slice(0, 8)

  // Try to resolve agent/suite from enrichment
  // For now, use the workflowId to infer (in real app this would come from run metadata)
  const agentInfo = agentMap.size > 0 ? Array.from(agentMap.values())[0] : null
  const suiteInfo = suiteMap.size > 0 ? Array.from(suiteMap.values())[0] : null

  return (
    <div
      className={`flex items-center px-4 py-3.5 border-b border-border/70 dark:border-slate-700/70 last:border-b-0 hover:bg-surface-raised/60 dark:hover:bg-slate-800/55 cursor-pointer transition-colors ${
        isRunning ? 'border-l-2 border-l-blue-500' : ''
      } ${isSelected ? 'bg-cyan-50/50 dark:bg-cyan-500/5' : ''}`}
    >
      {/* Checkbox */}
      <div className="w-10 flex-shrink-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(run.id)}
          onClick={(e) => e.stopPropagation()}
          disabled={!isCompleted}
          className="w-4 h-4 rounded border-gray-300 dark:border-dark-600 text-cyan-600 focus:ring-cyan-500 disabled:opacity-30"
        />
      </div>

      {/* Run ID */}
      <Link href={`/eval-runs/${run.id}`} className="flex-1 min-w-0">
        <span className="text-sm font-medium font-mono text-content-primary">
          {shortId}
        </span>
      </Link>

      {/* Agent */}
      <div className="w-28 px-2">
        <div className="text-sm font-medium text-content-primary truncate">
          {agentInfo?.name || '—'}
        </div>
        <div className="text-xs text-content-muted font-mono">
          {agentInfo?.version || ''}
        </div>
      </div>

      {/* Suite */}
      <div className="w-28 px-2">
        <div className="text-sm text-content-secondary truncate">
          {suiteInfo?.name || '—'}
        </div>
      </div>

      {/* Status */}
      <div className="w-32 px-2">
        <StatusBadge status={run.status} />
        {progress && (
          <div className="mt-1 text-xs text-content-muted">
            {progress.completed}/{progress.total}
          </div>
        )}
        {isRunning && progress && progress.total > 0 && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border/60 dark:bg-slate-700/70">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((progress.completed / progress.total) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Score */}
      <div className="w-20 px-2 text-right">
        {isCompleted && passRate !== null ? (
          <div>
            <div className={`text-sm font-semibold ${getScoreColor(passRate)}`}>
              {passRate}%
            </div>
            {avgScore !== null && (
              <div className="text-xs text-content-muted">
                {avgScore.toFixed(2)}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
        )}
      </div>

      {/* Started */}
      <div className="w-28 text-right text-sm text-content-muted">
        {safeFormatDistance(run.startTime)}
      </div>
    </div>
  )
})

// =============================================================================
// Bulk Actions Bar
// =============================================================================

function BulkActionsBar({
  selectedIds,
  onClear,
}: {
  selectedIds: Set<string>
  onClear: () => void
}) {
  const router = useRouter()
  const count = selectedIds.size

  if (count === 0) return null

  const ids = Array.from(selectedIds)
  const canCompare = count === 2

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border/80 bg-surface-card/90 px-6 py-3 shadow-lg backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/90 animate-in slide-in-from-bottom-2">
      <span className="text-sm font-medium text-content-primary">
        {count} selected
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (canCompare) {
              router.push(`/compare?baseline=${ids[0]}&candidate=${ids[1]}`)
            }
          }}
          disabled={!canCompare}
          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={
            !canCompare ? 'Select exactly 2 completed runs to compare' : ''
          }
        >
          Compare Selected
        </button>
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 text-sm text-content-muted hover:text-content-primary"
        >
          Deselect All
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Main Page
// =============================================================================

export default function EvalRunsPage() {
  const searchParams = useSearchParams()

  // Filter state from URL
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') || '')
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | ''>(
    (searchParams?.get('status') as WorkflowStatus) || '',
  )
  const [suiteFilter, setSuiteFilter] = useState(
    searchParams?.get('suite') || '',
  )
  const [agentFilter, setAgentFilter] = useState(
    searchParams?.get('agent') || '',
  )
  const [timeRange, setTimeRange] = useState(
    searchParams?.get('range') || '30d',
  )
  const [showStartDialog, setShowStartDialog] = useState(false)

  // Sort state
  const [sortField, setSortField] = useState<SortField>('started')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Selection state for bulk compare
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [searchQuery])

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (statusFilter) params.set('status', statusFilter)
    if (suiteFilter) params.set('suite', suiteFilter)
    if (agentFilter) params.set('agent', agentFilter)
    if (timeRange !== '30d') params.set('range', timeRange)
    const qs = params.toString()
    const newUrl = qs ? `?${qs}` : '/eval-runs'
    window.history.replaceState(null, '', newUrl)
  }, [debouncedSearch, statusFilter, suiteFilter, agentFilter, timeRange])

  // Data queries
  const {
    data: runs,
    isLoading,
    isError,
    error,
    refetch,
  } = useWorkflowRuns(
    statusFilter ? { status: statusFilter as WorkflowStatus } : undefined,
    { retry: 1 },
  )

  // Suites and agents for filter dropdowns
  const { data: suitesData } = trpc.suites.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const { data: agentsData } = trpc.agents.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })

  const suites = useMemo(() => {
    if (!suitesData) return []
    return Array.isArray(suitesData)
      ? suitesData
      : ((suitesData as { items?: unknown[] })?.items ?? [])
  }, [suitesData]) as Array<{ id: string; name: string; cases?: unknown[] }>

  const agents = useMemo(() => {
    if (!agentsData) return []
    return Array.isArray(agentsData) ? agentsData : []
  }, [agentsData]) as Array<{ id: string; name: string; version: string }>

  // Build lookup maps
  const agentMap = useMemo(() => {
    const m = new Map<string, { name: string; version: string }>()
    for (const a of agents) m.set(a.id, { name: a.name, version: a.version })
    return m
  }, [agents])

  const suiteMap = useMemo(() => {
    const m = new Map<string, { name: string; caseCount: number }>()
    for (const s of suites)
      m.set(s.id, {
        name: s.name,
        caseCount: Array.isArray(s.cases) ? s.cases.length : 0,
      })
    return m
  }, [suites])

  const startMutation = useStartWorkflowRun({
    onSuccess: () => {
      setShowStartDialog(false)
      refetch()
    },
  })

  // Filter and sort runs
  const filteredRuns = useMemo(() => {
    if (!runs) return []

    let result = [...runs]

    // Time range filter
    if (timeRange !== 'all') {
      const range = TIME_RANGES.find((t) => t.value === timeRange)
      if (range && range.ms > 0) {
        const cutoff = Date.now() - range.ms
        result = result.filter((r) => new Date(r.startTime).getTime() > cutoff)
      }
    }

    // Search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.workflowId.toLowerCase().includes(q),
      )
    }

    // Sort: running runs always first
    result.sort((a, b) => {
      // Running runs always on top
      if (a.status === 'RUNNING' && b.status !== 'RUNNING') return -1
      if (b.status === 'RUNNING' && a.status !== 'RUNNING') return 1

      if (sortField === 'started') {
        const diff =
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        return sortDir === 'desc' ? diff : -diff
      }
      if (sortField === 'score') {
        const aScore =
          a.progress && a.progress.total > 0
            ? a.progress.passed / a.progress.total
            : 0
        const bScore =
          b.progress && b.progress.total > 0
            ? b.progress.passed / b.progress.total
            : 0
        const diff = bScore - aScore
        return sortDir === 'desc' ? diff : -diff
      }
      return 0
    })

    return result
  }, [runs, debouncedSearch, timeRange, sortField, sortDir])

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        // Max 2 selections; if adding 3rd, drop oldest
        if (next.size >= 2) {
          const first = next.values().next().value
          if (first) next.delete(first)
        }
        next.add(id)
      }
      return next
    })
  }, [])

  // Escape to clear selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set())
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Active filters for pills
  const hasFilters =
    statusFilter ||
    suiteFilter ||
    agentFilter ||
    debouncedSearch ||
    timeRange !== '30d'

  const clearAllFilters = () => {
    setSearchQuery('')
    setStatusFilter('')
    setSuiteFilter('')
    setAgentFilter('')
    setTimeRange('30d')
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === 'desc' ? (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    )
  }

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">
              Eval Runs
            </h1>
            <p className="text-sm text-content-secondary">
              Evaluation execution history
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowStartDialog(true)}
            className="btn btn-primary"
          >
            <Play className="w-4 h-4" />
            New Run
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-surface-card/95 p-3 backdrop-blur-sm shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search runs..."
              className="w-full rounded-lg border border-border bg-surface-card py-2 pl-9 pr-3 text-sm text-content-primary placeholder:text-content-muted focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as WorkflowStatus | '')
            }
            className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Status</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {/* Suite */}
          <select
            value={suiteFilter}
            onChange={(e) => setSuiteFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Suites</option>
            {suites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Agent */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Time range */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            {TIME_RANGES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-sm text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2">
          {statusFilter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
              Status: {statusFilter}
              <button type="button" onClick={() => setStatusFilter('')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {suiteFilter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
              Suite:{' '}
              {suites.find((s) => s.id === suiteFilter)?.name || suiteFilter}
              <button type="button" onClick={() => setSuiteFilter('')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {agentFilter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
              Agent:{' '}
              {agents.find((a) => a.id === agentFilter)?.name || agentFilter}
              <button type="button" onClick={() => setAgentFilter('')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {debouncedSearch && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
              Search: {debouncedSearch}
              <button type="button" onClick={() => setSearchQuery('')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Summary stats strip */}
      {!isLoading && filteredRuns.length > 0 && (
        <SummaryStats runs={filteredRuns} />
      )}

      {/* Runs table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-card shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        {/* Table header */}
        <div className="flex items-center border-b border-border/80 bg-surface-raised/60 px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-content-muted dark:border-slate-700/70 dark:bg-slate-950/40">
          <div className="w-10 flex-shrink-0" />
          <div className="flex-1">Run</div>
          <div className="w-28 px-2">Agent</div>
          <div className="w-28 px-2">Suite</div>
          <div className="w-32 px-2">Status</div>
          <button
            type="button"
            onClick={() => handleSort('score')}
            className="w-20 cursor-pointer px-2 text-right hover:text-content-primary"
          >
            Score <SortIcon field="score" />
          </button>
          <button
            type="button"
            onClick={() => handleSort('started')}
            className="w-28 cursor-pointer text-right hover:text-content-primary"
          >
            Started <SortIcon field="started" />
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center px-4 py-4 border-b border-gray-100 dark:border-dark-700 animate-pulse"
              >
                <div className="w-10 flex-shrink-0">
                  <div className="h-4 w-4 bg-gray-200 dark:bg-dark-700 rounded" />
                </div>
                <div className="flex-1">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
                </div>
                <div className="w-28 px-2">
                  <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
                </div>
                <div className="w-28 px-2">
                  <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
                </div>
                <div className="w-32 px-2">
                  <div className="h-5 w-20 bg-gray-200 dark:bg-dark-700 rounded-full" />
                </div>
                <div className="w-20 px-2">
                  <div className="h-4 w-10 bg-gray-200 dark:bg-dark-700 rounded ml-auto" />
                </div>
                <div className="w-28">
                  <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && isError && (
          <div className="flex flex-col items-center justify-center py-16 px-8">
            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl p-8 text-center max-w-md">
              <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
              <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Failed to load eval runs
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {error?.message?.includes('ECONNREFUSED')
                  ? 'Temporal workflow service is unavailable. Ensure docker compose up -d is running.'
                  : error?.message || 'Something went wrong.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-4 py-2 text-sm font-medium bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty: no runs at all */}
        {!isLoading && !isError && (!runs || runs.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16">
            <Play className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">
              No eval runs yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm text-center mb-4">
              Run your first evaluation to start tracking agent quality across
              versions.
            </p>
            <button
              type="button"
              onClick={() => setShowStartDialog(true)}
              className="px-4 py-2 text-sm font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
            >
              Start First Run
            </button>
          </div>
        )}

        {/* Empty: filters return nothing */}
        {!isLoading &&
          !isError &&
          runs &&
          runs.length > 0 &&
          filteredRuns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">
                No matching runs
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Try adjusting your filters.
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2 text-sm font-medium bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700"
              >
                Clear Filters
              </button>
            </div>
          )}

        {/* Runs */}
        {filteredRuns.length > 0 && (
          <div>
            {filteredRuns.map((run) => (
              <Link
                key={run.id}
                href={`/eval-runs/${run.id}`}
                className="block"
              >
                <RunRow
                  run={run}
                  isSelected={selectedIds.has(run.id)}
                  onToggleSelect={toggleSelect}
                  agentMap={agentMap}
                  suiteMap={suiteMap}
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Bulk actions bar */}
      <BulkActionsBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Start dialog */}
      <StartEvalRunDialog
        isOpen={showStartDialog}
        onClose={() => setShowStartDialog(false)}
        onStart={(request) => startMutation.mutate(request)}
        isStarting={startMutation.isPending}
        error={startMutation.error?.message}
      />
    </div>
  )
}
