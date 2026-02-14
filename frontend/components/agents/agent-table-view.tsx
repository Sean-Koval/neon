'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import type { AgentCardData } from './agent-card'

type SortKey = 'name' | 'health' | 'errorRate' | 'p50Latency' | 'traceCount'
type SortDir = 'asc' | 'desc'

const healthOrder: Record<string, number> = {
  healthy: 0,
  degraded: 1,
  failing: 2,
}

const envBadgeStyles: Record<string, string> = {
  dev: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  staging:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  prod: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  development:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  production:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
}

const healthStyles: Record<string, { dot: string; label: string }> = {
  healthy: { dot: 'bg-emerald-500', label: 'Healthy' },
  degraded: { dot: 'bg-amber-500', label: 'Degraded' },
  failing: { dot: 'bg-rose-500', label: 'Failing' },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

interface AgentTableViewProps {
  agents: AgentCardData[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
}

export function AgentTableView({
  agents,
  selectedIds,
  onSelectionChange,
}: AgentTableViewProps) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDir('asc')
      }
    },
    [sortKey],
  )

  const sorted = [...agents].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'health':
        cmp = (healthOrder[a.health] ?? 3) - (healthOrder[b.health] ?? 3)
        break
      case 'errorRate':
        cmp = a.errorRate - b.errorRate
        break
      case 'p50Latency':
        cmp = a.p50Latency - b.p50Latency
        break
      case 'traceCount':
        cmp = a.traceCount - b.traceCount
        break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const allSelected = agents.length > 0 && selectedIds.size === agents.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(agents.map((a) => a.id)))
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onSelectionChange(next)
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column)
      return <ArrowUpDown className="w-3 h-3 opacity-40" />
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-raised/50">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="rounded border-border text-primary-500 focus:ring-primary-500"
                />
              </th>
              <th className="text-left px-3 py-3">
                <button
                  type="button"
                  onClick={() => handleSort('name')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-content-muted uppercase tracking-wider hover:text-content-secondary"
                >
                  Agent <SortIcon column="name" />
                </button>
              </th>
              <th className="text-left px-3 py-3">
                <button
                  type="button"
                  onClick={() => handleSort('health')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-content-muted uppercase tracking-wider hover:text-content-secondary"
                >
                  Status <SortIcon column="health" />
                </button>
              </th>
              <th className="text-left px-3 py-3">
                <span className="text-xs font-medium text-content-muted uppercase tracking-wider">
                  Environment
                </span>
              </th>
              <th className="text-right px-3 py-3">
                <button
                  type="button"
                  onClick={() => handleSort('errorRate')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-content-muted uppercase tracking-wider hover:text-content-secondary"
                >
                  Error Rate <SortIcon column="errorRate" />
                </button>
              </th>
              <th className="text-right px-3 py-3">
                <button
                  type="button"
                  onClick={() => handleSort('p50Latency')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-content-muted uppercase tracking-wider hover:text-content-secondary"
                >
                  P50 Latency <SortIcon column="p50Latency" />
                </button>
              </th>
              <th className="text-right px-3 py-3">
                <button
                  type="button"
                  onClick={() => handleSort('traceCount')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-content-muted uppercase tracking-wider hover:text-content-secondary"
                >
                  Traces <SortIcon column="traceCount" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent) => {
              const health = healthStyles[agent.health]
              return (
                <tr
                  key={agent.id}
                  onClick={() => router.push(`/agents/${agent.id}`)}
                  className="border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(agent.id)}
                      onChange={() => toggleOne(agent.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-border text-primary-500 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div>
                      <span className="font-medium text-content-primary">
                        {agent.name}
                      </span>
                      <span className="text-content-muted text-xs ml-2">
                        v{agent.version}
                      </span>
                    </div>
                    {agent.team && (
                      <span className="text-xs text-content-muted">
                        {agent.team}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="inline-flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${health?.dot ?? 'bg-zinc-400'}`}
                      />
                      <span className="text-content-secondary text-xs">
                        {health?.label ?? agent.health}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {agent.environments.map((env) => (
                        <span
                          key={env}
                          className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded border ${
                            envBadgeStyles[env] ??
                            'bg-surface-raised/60 text-content-muted border-border'
                          }`}
                        >
                          {env}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`font-medium ${
                        agent.errorRate > 5
                          ? 'text-rose-600 dark:text-rose-400'
                          : agent.errorRate > 2
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-content-primary'
                      }`}
                    >
                      {agent.errorRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`font-medium ${
                        agent.p50Latency > 6000
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-content-primary'
                      }`}
                    >
                      {formatDuration(agent.p50Latency)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-content-primary font-medium">
                      {agent.traceCount.toLocaleString()}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
