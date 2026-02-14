'use client'

import { clsx } from 'clsx'
import { Activity, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useTraces } from '@/hooks/use-traces'
import { AgentTraceList } from './agent-trace-list'
import { TraceQualityStats } from './trace-quality-stats'

const PAGE_SIZE = 20

const TIME_RANGES = [
  { label: 'Last 1h', hours: 1 },
  { label: 'Last 6h', hours: 6 },
  { label: 'Last 24h', hours: 24 },
  { label: 'Last 7d', hours: 168 },
  { label: 'Last 30d', hours: 720 },
]

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Success', value: 'ok' },
  { label: 'Error', value: 'error' },
]

interface AgentTracesTabProps {
  agentId: string
}

export function AgentTracesTab({ agentId }: AgentTracesTabProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [timeRange, setTimeRange] = useState(168) // 7d default
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState('timestamp')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const startDate = useMemo(() => {
    const d = new Date()
    d.setHours(d.getHours() - timeRange)
    return d.toISOString()
  }, [timeRange])

  const days = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.hours === timeRange)
    if (!range) return 7
    return Math.max(1, Math.ceil(range.hours / 24))
  }, [timeRange])

  const { data: traces = [], isLoading } = useTraces({
    agentId,
    status: (statusFilter || undefined) as 'ok' | 'error' | undefined,
    search: search || undefined,
    startDate,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedTraces = useMemo(() => {
    const sorted = [...traces]
    sorted.sort((a, b) => {
      const aVal = a[sortField as keyof typeof a]
      const bVal = b[sortField as keyof typeof b]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [traces, sortField, sortDir])

  const handleCompare = () => {
    const ids = Array.from(selectedIds)
    if (ids.length >= 2) {
      router.push(`/traces/diff?a=${ids[0]}&b=${ids[1]}`)
    }
  }

  // Empty state
  if (!isLoading && traces.length === 0 && !search && !statusFilter) {
    return (
      <div className="space-y-6">
        <TraceQualityStats agentId={agentId} days={days} />
        <div className="bg-surface-card border border-border rounded-xl p-8 text-center">
          <Activity className="w-12 h-12 text-content-muted mx-auto mb-3" />
          <h3 className="text-content-primary font-medium mb-2">
            No traces yet
          </h3>
          <p className="text-content-secondary text-sm">
            This agent hasn&apos;t sent any traces. Traces appear automatically
            when the agent executes via the SDK.
          </p>
        </div>
      </div>
    )
  }

  const hasMore = traces.length === PAGE_SIZE
  const showingStart = page * PAGE_SIZE + 1
  const showingEnd = page * PAGE_SIZE + traces.length

  return (
    <div className="space-y-6">
      {/* Quality Stats */}
      <TraceQualityStats agentId={agentId} days={days} />

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          <input
            type="text"
            placeholder="Search traces..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface-default border border-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(0)
          }}
          className="px-3 py-2 text-sm bg-surface-default border border-border rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={timeRange}
          onChange={(e) => {
            setTimeRange(Number(e.target.value))
            setPage(0)
          }}
          className="px-3 py-2 text-sm bg-surface-default border border-border rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        >
          {TIME_RANGES.map((range) => (
            <option key={range.hours} value={range.hours}>
              {range.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={selectedIds.size < 2}
          onClick={handleCompare}
          className={clsx(
            'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
            selectedIds.size >= 2
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-surface-default border border-border text-content-muted cursor-not-allowed',
          )}
        >
          Compare Selected
        </button>

        <Link
          href={`/traces?agent_id=${agentId}`}
          className="ml-auto text-sm text-primary-500 dark:text-primary-400 hover:text-primary-400 dark:hover:text-primary-300 transition-colors"
        >
          View All Traces &rarr;
        </Link>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="bg-surface-card border border-border rounded-xl p-8 animate-pulse">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-10 bg-gray-100 dark:bg-dark-800 rounded"
              />
            ))}
          </div>
        </div>
      ) : traces.length === 0 ? (
        <div className="bg-surface-card border border-border rounded-xl p-8 text-center">
          <p className="text-content-secondary text-sm">
            No traces match your filters.
          </p>
        </div>
      ) : (
        <>
          {/* Trace Table */}
          <AgentTraceList
            traces={sortedTraces}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-content-muted">
              Showing {showingStart}-{showingEnd} traces
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  page === 0
                    ? 'text-content-muted cursor-not-allowed'
                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-default',
                )}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-content-primary font-medium bg-primary-500/10 rounded px-2 py-1 text-sm">
                {page + 1}
              </span>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  !hasMore
                    ? 'text-content-muted cursor-not-allowed'
                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-default',
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
