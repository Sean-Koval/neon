'use client'

/**
 * Traces List Page
 *
 * Full observability hub with stat cards, advanced filters, bulk actions,
 * cost column, loop/multi-agent badges, and test case creation.
 */

import { clsx } from 'clsx'
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FlaskConical,
  GitCompare,
  MessageSquare,
  RefreshCw,
  Search,
  TrendingUp,
  Wrench,
  X,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useRef, useState } from 'react'
import { CreateTestCasesModal } from '@/components/traces/create-test-cases-modal'
import { type TraceFilters, useTraces } from '@/hooks/use-traces'

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function formatCost(cost: number | null | undefined): {
  text: string
  color: string
} {
  if (cost == null || cost === 0) {
    return { text: '---', color: 'text-content-muted' }
  }
  const text = `$${cost.toFixed(2)}`
  if (cost < 0.1)
    return { text, color: 'text-emerald-600 dark:text-emerald-400' }
  if (cost <= 0.5) return { text, color: 'text-amber-600 dark:text-amber-400' }
  return { text, color: 'text-rose-600 dark:text-rose-400' }
}

// ─── Sparkline SVG ──────────────────────────────────────────────────────────

function Sparkline({
  data,
  color = '#06b6d4',
}: {
  data: number[]
  color?: string
}) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const h = 24
  const w = 64
  const step = w / (data.length - 1)
  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * (h - 2)}`)
    .join(' ')
  const areaPath = `M0,${h} L${points} L${w},${h} Z`

  return (
    <svg width={w} height={h} className="flex-shrink-0" aria-hidden="true">
      <path d={areaPath} fill={color} fillOpacity={0.15} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Stat Cards ─────────────────────────────────────────────────────────────

function StatCards({ traces }: { traces: Array<Record<string, unknown>> }) {
  const stats = useMemo(() => {
    const total = traces.length
    const errors = traces.filter((t) => t.status === 'error').length
    const safeDuration = (v: unknown): number => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : 0
    }
    const safeCost = (v: unknown): number => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 && n < 1e6 ? n : 0
    }
    const avgDuration =
      total > 0
        ? traces.reduce((s, t) => s + safeDuration(t.duration_ms), 0) / total
        : 0
    const avgCost =
      total > 0
        ? traces.reduce((s, t) => s + safeCost(t.total_cost), 0) / total
        : 0

    // Build 7-day sparkline data
    const now = new Date()
    const dailyCounts: number[] = []
    const dailyErrors: number[] = []
    const dailyDurations: number[] = []
    const dailyCosts: number[] = []

    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(day.getDate() - i)
      const dateStr = day.toISOString().split('T')[0]
      const dayTraces = traces.filter(
        (t) =>
          typeof t.timestamp === 'string' && t.timestamp.startsWith(dateStr),
      )
      dailyCounts.push(dayTraces.length)
      const de = dayTraces.filter((t) => t.status === 'error').length
      dailyErrors.push(dayTraces.length > 0 ? (de / dayTraces.length) * 100 : 0)
      dailyDurations.push(
        dayTraces.length > 0
          ? dayTraces.reduce((s, t) => s + safeDuration(t.duration_ms), 0) /
              dayTraces.length
          : 0,
      )
      dailyCosts.push(
        dayTraces.length > 0
          ? dayTraces.reduce((s, t) => s + safeCost(t.total_cost), 0) /
              dayTraces.length
          : 0,
      )
    }

    return {
      total,
      errorRate: total > 0 ? (errors / total) * 100 : 0,
      avgDuration,
      avgCost,
      dailyCounts,
      dailyErrors,
      dailyDurations,
      dailyCosts,
    }
  }, [traces])

  const cards = [
    {
      label: 'Total Traces',
      value: stats.total.toLocaleString(),
      sparkline: stats.dailyCounts,
      color: '#06b6d4',
      icon: TrendingUp,
      iconTone: 'text-primary-600 dark:text-primary-400',
    },
    {
      label: 'Error Rate',
      value: `${stats.errorRate.toFixed(1)}%`,
      sparkline: stats.dailyErrors,
      color: stats.errorRate > 5 ? '#f43f5e' : '#06b6d4',
      icon: XCircle,
      valueColor:
        stats.errorRate > 5 ? 'text-rose-600 dark:text-rose-400' : undefined,
      iconTone: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Avg Duration',
      value:
        stats.avgDuration < 1000
          ? `${Math.round(stats.avgDuration)}ms`
          : stats.avgDuration < 60000
            ? `${(stats.avgDuration / 1000).toFixed(2)}s`
            : `${(stats.avgDuration / 60000).toFixed(2)}m`,
      sparkline: stats.dailyDurations,
      color: '#06b6d4',
      icon: Clock,
      iconTone: 'text-accent-600 dark:text-accent-400',
    },
    {
      label: 'Avg Cost',
      value: stats.avgCost > 0 ? `$${stats.avgCost.toFixed(2)}` : '---',
      sparkline: stats.dailyCosts,
      color: '#06b6d4',
      icon: DollarSign,
      iconTone: 'text-emerald-600 dark:text-emerald-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="group relative overflow-hidden rounded-xl border border-border bg-surface-card px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/25 hover:shadow-md dark:border-slate-700/80 dark:bg-slate-900/75"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-content-muted">{card.label}</span>
            <card.icon className={clsx('w-4 h-4', card.iconTone)} />
          </div>
          <div className="flex items-end justify-between gap-2">
            <span
              className={clsx(
                'text-xl font-semibold',
                card.valueColor || 'text-content-primary',
              )}
            >
              {card.value}
            </span>
            <Sparkline data={card.sparkline} color={card.color} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Filter Dropdowns ───────────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: 'Any duration', value: '' },
  { label: '<1s', value: 'lt1s' },
  { label: '1-5s', value: '1s-5s' },
  { label: '5-30s', value: '5s-30s' },
  { label: '>30s', value: 'gt30s' },
]

const TIME_RANGE_PRESETS = [
  { label: 'All time', value: '' },
  { label: 'Last 1h', value: '1h' },
  { label: 'Last 6h', value: '6h' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7d', value: '7d' },
  { label: 'Last 30d', value: '30d' },
]

function getTimeRangeDate(preset: string): string | undefined {
  const now = new Date()
  switch (preset) {
    case '1h':
      return new Date(now.getTime() - 3600000).toISOString()
    case '6h':
      return new Date(now.getTime() - 21600000).toISOString()
    case '24h':
      return new Date(now.getTime() - 86400000).toISOString()
    case '7d':
      return new Date(now.getTime() - 604800000).toISOString()
    case '30d':
      return new Date(now.getTime() - 2592000000).toISOString()
    default:
      return undefined
  }
}

interface ActiveFilter {
  key: string
  label: string
  value: string
}

// ─── Trace Badges ───────────────────────────────────────────────────────────

function TraceBadges({
  trace,
  medianSpanCount,
}: {
  trace: Record<string, unknown>
  medianSpanCount: number
}) {
  const spanCount =
    (trace.span_count as number) ||
    (trace.llm_calls as number) + (trace.tool_calls as number) ||
    0
  const agentCount = (trace.distinct_agent_count as number) || 0
  const isLoop = medianSpanCount > 0 && spanCount > medianSpanCount * 2

  return (
    <>
      {isLoop && (
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          title="This trace has significantly more spans than typical, indicating a potential loop"
        >
          loop!
        </span>
      )}
      {agentCount >= 2 && (
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
          title="This trace involves multiple agents"
        >
          multi-agent
        </span>
      )}
    </>
  )
}

// ─── Bulk Action Bar ────────────────────────────────────────────────────────

function BulkActionBar({
  selectedCount,
  onDeselectAll,
  onCompare,
  onCreateTestCases,
}: {
  selectedCount: number
  onDeselectAll: () => void
  onCompare: () => void
  onCreateTestCases: () => void
}) {
  return (
    <div
      className={clsx(
        'fixed bottom-0 left-0 right-0 z-40 transition-transform duration-200',
        selectedCount > 0 ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <div className="bg-surface-card border-t border-border shadow-lg px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="text-sm font-medium text-content-secondary">
            {selectedCount} selected
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCompare}
              disabled={selectedCount !== 2}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <GitCompare className="w-4 h-4" />
              Compare Selected
            </button>
            <button
              type="button"
              onClick={onCreateTestCases}
              disabled={selectedCount < 1}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border bg-surface-card rounded-lg hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
              Create Test Cases
            </button>
          </div>

          <button
            type="button"
            onClick={onDeselectAll}
            className="text-sm text-content-muted hover:text-content-primary"
          >
            Deselect All
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TracesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read filters from URL
  const agentFilter = searchParams.get('agent') || ''
  const durationFilter = searchParams.get('duration') || ''
  const timeRange = searchParams.get('timeRange') || ''
  const statusFilter =
    (searchParams.get('status') as 'ok' | 'error') || undefined
  const searchFilter = searchParams.get('search') || ''

  const [searchQuery, setSearchQuery] = useState(searchFilter)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showTestCasesModal, setShowTestCasesModal] = useState(false)
  const [sortColumn, setSortColumn] = useState<'duration' | 'cost' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const lastSelectedIndex = useRef<number | null>(null)

  // Build filters from URL
  const filters: TraceFilters = useMemo(() => {
    const f: TraceFilters = { limit: 50 }
    if (statusFilter) f.status = statusFilter
    if (agentFilter) f.agentId = agentFilter
    if (searchFilter) f.search = searchFilter
    const startDate = getTimeRangeDate(timeRange)
    if (startDate) f.startDate = startDate
    return f
  }, [statusFilter, agentFilter, searchFilter, timeRange])

  const { data: traces, isLoading, refetch } = useTraces(filters)

  // Compute median span count for loop badge
  const medianSpanCount = useMemo(() => {
    if (!traces || traces.length === 0) return 0
    const counts = traces
      .map(
        (t) =>
          ((t as unknown as Record<string, unknown>).span_count as number) ||
          t.llm_calls + t.tool_calls,
      )
      .sort((a, b) => a - b)
    return counts[Math.floor(counts.length / 2)]
  }, [traces])

  // Extract unique agent IDs for filter dropdown
  const uniqueAgents = useMemo(() => {
    if (!traces) return []
    const agents = new Set<string>()
    for (const t of traces) {
      if (t.agent_id) agents.add(t.agent_id)
    }
    return Array.from(agents).sort()
  }, [traces])

  // Client-side duration filtering
  const filteredTraces = useMemo(() => {
    let list = traces || []
    if (durationFilter) {
      list = list.filter((t) => {
        const ms = t.duration_ms
        switch (durationFilter) {
          case 'lt1s':
            return ms < 1000
          case '1s-5s':
            return ms >= 1000 && ms < 5000
          case '5s-30s':
            return ms >= 5000 && ms < 30000
          case 'gt30s':
            return ms >= 30000
          default:
            return true
        }
      })
    }
    if (sortColumn) {
      list = [...list].sort((a, b) => {
        const aVal =
          sortColumn === 'cost'
            ? ((a as unknown as Record<string, unknown>)
                .total_cost as number) || 0
            : a.duration_ms
        const bVal =
          sortColumn === 'cost'
            ? ((b as unknown as Record<string, unknown>)
                .total_cost as number) || 0
            : b.duration_ms
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      })
    }
    return list
  }, [traces, durationFilter, sortColumn, sortDirection])

  // URL update helper
  const updateUrl = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.replace(`/traces?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Active filter pills
  const activeFilters: ActiveFilter[] = useMemo(() => {
    const pills: ActiveFilter[] = []
    if (agentFilter)
      pills.push({
        key: 'agent',
        label: `Agent: ${agentFilter}`,
        value: agentFilter,
      })
    if (durationFilter) {
      const preset = DURATION_PRESETS.find((p) => p.value === durationFilter)
      pills.push({
        key: 'duration',
        label: `Duration: ${preset?.label || durationFilter}`,
        value: durationFilter,
      })
    }
    if (timeRange) {
      const preset = TIME_RANGE_PRESETS.find((p) => p.value === timeRange)
      pills.push({
        key: 'timeRange',
        label: `Time: ${preset?.label || timeRange}`,
        value: timeRange,
      })
    }
    if (statusFilter)
      pills.push({
        key: 'status',
        label: `Status: ${statusFilter}`,
        value: statusFilter,
      })
    return pills
  }, [agentFilter, durationFilter, timeRange, statusFilter])

  // Selection handlers
  const toggleSelect = useCallback(
    (traceId: string, index: number, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (shiftKey && lastSelectedIndex.current !== null && filteredTraces) {
          const start = Math.min(lastSelectedIndex.current, index)
          const end = Math.max(lastSelectedIndex.current, index)
          for (let i = start; i <= end; i++) {
            next.add(filteredTraces[i].trace_id)
          }
        } else if (next.has(traceId)) {
          next.delete(traceId)
        } else {
          next.add(traceId)
        }
        lastSelectedIndex.current = index
        return next
      })
    },
    [filteredTraces],
  )

  const toggleSelectAll = useCallback(() => {
    if (!filteredTraces) return
    setSelectedIds((prev) => {
      const allSelected = filteredTraces.every((t) => prev.has(t.trace_id))
      if (allSelected) return new Set()
      return new Set(filteredTraces.map((t) => t.trace_id))
    })
  }, [filteredTraces])

  const handleCompare = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 2) {
      router.push(`/traces/diff?baseline=${ids[0]}&candidate=${ids[1]}`)
    }
  }, [selectedIds, router])

  const handleSort = useCallback((column: 'duration' | 'cost') => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
        return column
      }
      setSortDirection('desc')
      return column
    })
  }, [])

  const allSelected =
    filteredTraces &&
    filteredTraces.length > 0 &&
    filteredTraces.every((t) => selectedIds.has(t.trace_id))

  return (
    <div className="relative p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <div className="relative mt-6 mb-6 rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Traces</h1>
            <p className="text-content-secondary">
              View and analyze agent execution traces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/traces/diff"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-content-secondary bg-surface-card border border-border rounded-lg hover:bg-surface-raised transition-colors"
            >
              <GitCompare className="w-4 h-4" />
              Compare
            </Link>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 hover:bg-surface-raised rounded-lg"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5 text-content-secondary" />
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      {filteredTraces && filteredTraces.length > 0 && (
        <StatCards
          traces={filteredTraces as unknown as Array<Record<string, unknown>>}
        />
      )}

      {/* Filter Bar */}
      <div className="mb-4 rounded-xl border border-border bg-surface-card/95 p-3 backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input
              type="text"
              placeholder="Search traces..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                updateUrl('search', e.target.value)
              }}
              className="w-full pl-10 pr-4 py-2 border border-border bg-surface-card text-content-primary rounded-lg focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
            />
          </div>

          {/* Agent filter */}
          <select
            value={agentFilter}
            onChange={(e) => updateUrl('agent', e.target.value)}
            className="px-3 py-2 border border-border bg-surface-card text-content-secondary rounded-lg focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 text-sm"
          >
            <option value="">All Agents</option>
            {uniqueAgents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter || ''}
            onChange={(e) => updateUrl('status', e.target.value)}
            className="px-3 py-2 border border-border bg-surface-card text-content-secondary rounded-lg focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 text-sm"
          >
            <option value="">All Status</option>
            <option value="ok">Success</option>
            <option value="error">Error</option>
          </select>

          {/* Duration filter */}
          <select
            value={durationFilter}
            onChange={(e) => updateUrl('duration', e.target.value)}
            className="px-3 py-2 border border-border bg-surface-card text-content-secondary rounded-lg focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 text-sm"
          >
            {DURATION_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Time Range */}
          <select
            value={timeRange}
            onChange={(e) => updateUrl('timeRange', e.target.value)}
            className="px-3 py-2 border border-border bg-surface-card text-content-secondary rounded-lg focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 text-sm"
          >
            {TIME_RANGE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Filter Pills */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400 rounded-full border border-cyan-200 dark:border-cyan-500/25"
            >
              {filter.label}
              <button
                type="button"
                onClick={() => updateUrl(filter.key, '')}
                className="hover:text-cyan-900 dark:hover:text-cyan-200"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              router.replace('/traces', { scroll: false })
              setSearchQuery('')
            }}
            className="text-xs text-content-muted hover:text-content-primary"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Traces Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-card shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        {/* Table Header */}
        <div className="flex items-center border-b border-border bg-surface-raised px-4 py-3 text-sm font-medium text-content-muted dark:border-slate-700/80 dark:bg-slate-900/95">
          <div className="w-10 flex-shrink-0">
            <input
              type="checkbox"
              checked={!!allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-border text-cyan-600 focus:ring-cyan-500"
            />
          </div>
          <div className="flex-1">Trace</div>
          <div className="w-24 text-center">Status</div>
          <button
            type="button"
            onClick={() => handleSort('duration')}
            className="w-24 text-right flex items-center justify-end gap-1 hover:text-content-primary"
          >
            Duration
            {sortColumn === 'duration' && (
              <ChevronDown
                className={clsx(
                  'w-3 h-3',
                  sortDirection === 'asc' && 'rotate-180',
                )}
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSort('cost')}
            className="w-24 text-right flex items-center justify-end gap-1 hover:text-content-primary"
          >
            Cost
            {sortColumn === 'cost' && (
              <ChevronDown
                className={clsx(
                  'w-3 h-3',
                  sortDirection === 'asc' && 'rotate-180',
                )}
              />
            )}
          </button>
          <div className="w-20 text-center">
            <MessageSquare className="w-4 h-4 inline" />
          </div>
          <div className="w-20 text-center">
            <Wrench className="w-4 h-4 inline" />
          </div>
          <div className="w-32 text-right">Time</div>
          <div className="w-8" />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-content-muted">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading traces...
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!filteredTraces || filteredTraces.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <div className="w-12 h-12 rounded-xl bg-surface-raised flex items-center justify-center mb-3">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-content-secondary font-medium">
              No traces found
            </p>
            <p className="text-sm">Traces will appear here when agents run</p>
          </div>
        )}

        {/* Trace rows */}
        {filteredTraces?.map((trace, index) => {
          const isSelected = selectedIds.has(trace.trace_id)
          const cost = formatCost(
            (trace as unknown as Record<string, unknown>).total_cost as number,
          )

          return (
            <div
              key={trace.trace_id}
              className={clsx(
                'flex items-center px-4 py-3 border-b border-border hover:bg-surface-raised cursor-pointer transition-colors',
                'dark:border-slate-800 dark:hover:bg-slate-800/55',
                isSelected && 'bg-cyan-50/50 dark:bg-cyan-500/5',
              )}
            >
              {/* Checkbox */}
              <div className="w-10 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) =>
                    toggleSelect(
                      trace.trace_id,
                      index,
                      (e.nativeEvent as MouseEvent).shiftKey,
                    )
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-border text-cyan-600 focus:ring-cyan-500"
                />
              </div>

              {/* Name + badges */}
              <Link
                href={`/traces/${trace.trace_id}`}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate text-content-primary">
                    {trace.name}
                  </span>
                  <TraceBadges
                    trace={trace as unknown as Record<string, unknown>}
                    medianSpanCount={medianSpanCount}
                  />
                </div>
                <div className="text-sm text-content-muted truncate">
                  {trace.trace_id}
                </div>
              </Link>

              {/* Status */}
              <div className="w-24 flex justify-center">
                {trace.status === 'ok' ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    OK
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
                    <XCircle className="w-4 h-4" />
                    Error
                  </span>
                )}
              </div>

              {/* Duration */}
              <div className="w-24 text-right text-sm text-content-secondary">
                {formatDuration(trace.duration_ms)}
              </div>

              {/* Cost */}
              <div
                className={clsx(
                  'w-24 text-right text-sm font-medium',
                  cost.color,
                )}
              >
                {cost.text}
              </div>

              {/* LLM calls */}
              <div className="w-20 text-center text-sm text-content-muted">
                {trace.llm_calls}
              </div>

              {/* Tool calls */}
              <div className="w-20 text-center text-sm text-content-muted">
                {trace.tool_calls}
              </div>

              {/* Time */}
              <div className="w-32 text-right text-sm text-content-muted">
                {formatRelativeTime(trace.timestamp)}
              </div>

              {/* Arrow */}
              <Link
                href={`/traces/${trace.trace_id}`}
                className="w-8 flex justify-center"
              >
                <ChevronRight className="w-4 h-4 text-content-muted" />
              </Link>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {filteredTraces && filteredTraces.length >= (filters.limit || 50) && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => {
              const current = Number(searchParams.get('offset') || '0')
              updateUrl('offset', String(current + (filters.limit || 50)))
            }}
            className="rounded-lg border border-border bg-surface-card px-4 py-2 hover:bg-surface-raised dark:border-slate-700/80 dark:bg-slate-900/80 dark:hover:bg-slate-800/60"
          >
            Load More
          </button>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onDeselectAll={() => setSelectedIds(new Set())}
        onCompare={handleCompare}
        onCreateTestCases={() => setShowTestCasesModal(true)}
      />

      {/* Create Test Cases Modal */}
      <CreateTestCasesModal
        traceIds={[...selectedIds]}
        open={showTestCasesModal}
        onClose={() => {
          setShowTestCasesModal(false)
          setSelectedIds(new Set())
        }}
      />
    </div>
  )
}
