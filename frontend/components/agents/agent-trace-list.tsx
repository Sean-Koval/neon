'use client'

import { clsx } from 'clsx'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { TraceSummary } from '@/hooks/use-traces'

interface AgentTraceListProps {
  traces: TraceSummary[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  sortField: string
  sortDir: 'asc' | 'desc'
  onSort: (field: string) => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const diff = now - new Date(timestamp).getTime()

  if (diff < 60 * 1000) return 'just now'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok')
    return <CheckCircle className="w-4 h-4 text-emerald-500" />
  if (status === 'error') return <XCircle className="w-4 h-4 text-rose-500" />
  return <AlertTriangle className="w-4 h-4 text-amber-500" />
}

function SortIndicator({
  field,
  sortField,
  sortDir,
}: {
  field: string
  sortField: string
  sortDir: 'asc' | 'desc'
}) {
  if (field !== sortField) return null
  return sortDir === 'asc' ? (
    <ArrowUp className="w-3 h-3 inline ml-1" />
  ) : (
    <ArrowDown className="w-3 h-3 inline ml-1" />
  )
}

export function AgentTraceList({
  traces,
  selectedIds,
  onToggleSelect,
  sortField,
  sortDir,
  onSort,
}: AgentTraceListProps) {
  const router = useRouter()

  const columns = [
    { id: 'trace_id', label: 'Trace ID' },
    { id: 'status', label: 'Status' },
    { id: 'llm_calls', label: 'Spans' },
    { id: 'duration_ms', label: 'Duration' },
    { id: 'total_tokens', label: 'Tokens' },
    { id: 'timestamp', label: 'Time' },
  ]

  return (
    <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-default">
            <th className="w-10 px-3 py-3">
              <span className="sr-only">Select</span>
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="px-3 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider cursor-pointer hover:text-content-primary"
                onClick={() => onSort(col.id)}
              >
                {col.label}
                <SortIndicator
                  field={col.id}
                  sortField={sortField}
                  sortDir={sortDir}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {traces.map((trace) => {
            const isHighSpan = trace.llm_calls + trace.tool_calls > 50

            return (
              <tr
                key={trace.trace_id}
                className="hover:bg-gray-50 dark:hover:bg-dark-700/50 cursor-pointer transition-colors"
                onClick={() => router.push(`/traces/${trace.trace_id}`)}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(trace.trace_id)}
                    onChange={() => onToggleSelect(trace.trace_id)}
                    className="rounded border-border"
                  />
                </td>
                <td className="px-3 py-3">
                  <span className="font-mono text-sm text-content-primary">
                    {trace.trace_id.slice(0, 8)}&hellip;
                  </span>
                  {trace.name && (
                    <span className="ml-2 text-content-muted text-xs">
                      {trace.name}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <StatusIcon status={trace.status} />
                </td>
                <td className="px-3 py-3 text-content-secondary">
                  {trace.llm_calls + trace.tool_calls}
                  {isHighSpan && (
                    <span className="ml-1.5 text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded-full">
                      loop
                    </span>
                  )}
                </td>
                <td
                  className={clsx(
                    'px-3 py-3',
                    trace.duration_ms > 30000
                      ? 'text-rose-600 dark:text-rose-400 font-medium'
                      : 'text-content-secondary',
                  )}
                >
                  {formatDuration(trace.duration_ms)}
                </td>
                <td className="px-3 py-3 text-content-secondary">
                  {trace.total_tokens > 0
                    ? trace.total_tokens.toLocaleString()
                    : '--'}
                </td>
                <td className="px-3 py-3 text-content-muted text-xs">
                  {formatRelativeTime(trace.timestamp)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
