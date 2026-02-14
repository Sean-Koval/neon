'use client'

import { clsx } from 'clsx'
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react'
import { useCallback, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface VersionData {
  version: string
  firstSeen: string
  lastSeen: string
  traceCount: number
  avgScore: number | null
  avgDuration: number
}

interface VersionHistoryTableProps {
  agentId: string
  versions: VersionData[]
}

type SortField =
  | 'version'
  | 'avgScore'
  | 'traceCount'
  | 'firstSeen'
  | 'lastSeen'
type SortDir = 'asc' | 'desc'

const LABELS = ['stable', 'canary', 'deprecated'] as const
type Label = (typeof LABELS)[number]

const labelStyles: Record<Label, string> = {
  stable: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  canary: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  deprecated: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function getScoreColor(score: number): string {
  if (score >= 0.9) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function LabelDropdown({
  version,
  currentLabel,
  onSelect,
}: {
  version: string
  currentLabel: Label | null
  onSelect: (version: string, label: Label) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full transition-colors',
          currentLabel
            ? labelStyles[currentLabel]
            : 'bg-gray-100 dark:bg-dark-700 text-content-muted hover:text-content-secondary',
        )}
      >
        {currentLabel || 'Set label'}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            role="presentation"
          />
          <div className="absolute top-full left-0 mt-1 z-20 bg-surface-card border border-border rounded-lg shadow-lg py-1 w-32">
            {LABELS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onSelect(version, label)
                  setOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-content-secondary hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors"
              >
                <span
                  className={clsx(
                    'font-medium',
                    labelStyles[label].split(' ').slice(1).join(' '),
                  )}
                >
                  {label}
                </span>
                {currentLabel === label && (
                  <Check className="w-3 h-3 text-primary-500" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function VersionHistoryTable({
  agentId,
  versions,
}: VersionHistoryTableProps) {
  const [sortField, setSortField] = useState<SortField>('firstSeen')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [versionLabels, setVersionLabels] = useState<Record<string, Label>>({})
  const [page, setPage] = useState(0)
  const pageSize = 10

  const utils = trpc.useUtils()
  const upsertMutation = trpc.agents.upsert.useMutation({
    onSuccess: () => {
      utils.agents.getVersions.invalidate({ agentId })
    },
  })

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('desc')
      return field
    })
  }, [])

  const handleLabelChange = useCallback(
    (version: string, label: Label) => {
      const newLabels = { ...versionLabels, [version]: label }
      setVersionLabels(newLabels)

      upsertMutation.mutate({
        id: agentId,
        metadata: { versionLabels: newLabels },
      })
    },
    [agentId, versionLabels, upsertMutation],
  )

  const sorted = [...versions].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortField) {
      case 'version':
        return dir * a.version.localeCompare(b.version)
      case 'avgScore':
        return dir * ((a.avgScore ?? 0) - (b.avgScore ?? 0))
      case 'traceCount':
        return dir * (a.traceCount - b.traceCount)
      case 'firstSeen':
        return (
          dir *
          (new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime())
        )
      case 'lastSeen':
        return (
          dir *
          (new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime())
        )
      default:
        return 0
    }
  })

  const totalPages = Math.ceil(sorted.length / pageSize)
  const paginated = sorted.slice(page * pageSize, (page + 1) * pageSize)

  // Derive environments from position
  const envMap: Record<string, string[]> = {}
  if (versions[0]) envMap[versions[0].version] = ['dev']
  if (versions[1]) envMap[versions[1].version] = ['staging']
  if (versions[2]) envMap[versions[2].version] = ['prod']

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField
    children: React.ReactNode
  }) => (
    <th
      className="text-left pb-3 font-medium cursor-pointer select-none hover:text-content-secondary transition-colors"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={clsx(
            'w-3 h-3',
            sortField === field ? 'text-primary-500' : 'opacity-30',
          )}
        />
      </span>
    </th>
  )

  return (
    <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
      <div className="p-6 pb-0">
        <h3 className="text-content-primary font-semibold mb-4">
          Version History
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-content-muted text-xs border-b border-border px-6">
              <SortHeader field="version">
                <span className="pl-6">Version</span>
              </SortHeader>
              <th className="text-left pb-3 font-medium">Label</th>
              <th className="text-left pb-3 font-medium">Environments</th>
              <SortHeader field="avgScore">Avg Score</SortHeader>
              <SortHeader field="traceCount">Traces</SortHeader>
              <th className="text-left pb-3 font-medium">Avg Duration</th>
              <SortHeader field="firstSeen">First Seen</SortHeader>
              <SortHeader field="lastSeen">
                <span className="pr-6">Last Seen</span>
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {paginated.map((v) => (
              <tr
                key={v.version}
                className="border-t border-border/50 hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors"
              >
                <td className="py-3 pl-6 text-content-primary font-mono font-medium">
                  {v.version}
                </td>
                <td className="py-3">
                  <LabelDropdown
                    version={v.version}
                    currentLabel={versionLabels[v.version] ?? null}
                    onSelect={handleLabelChange}
                  />
                </td>
                <td className="py-3">
                  {(envMap[v.version] || []).map((env) => (
                    <span
                      key={env}
                      className={clsx(
                        'px-2 py-0.5 text-xs font-medium rounded-full mr-1',
                        env === 'prod'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : env === 'staging'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                      )}
                    >
                      {env}
                    </span>
                  ))}
                </td>
                <td className="py-3">
                  {v.avgScore !== null ? (
                    <span
                      className={clsx(
                        'font-semibold',
                        getScoreColor(v.avgScore),
                      )}
                    >
                      {(v.avgScore * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-content-muted">--</span>
                  )}
                </td>
                <td className="py-3 text-content-secondary">
                  {v.traceCount.toLocaleString()}
                </td>
                <td className="py-3 text-content-secondary">
                  {formatDuration(v.avgDuration)}
                </td>
                <td className="py-3 text-content-muted text-xs">
                  {formatRelativeTime(v.firstSeen)}
                </td>
                <td className="py-3 pr-6 text-content-muted text-xs">
                  {formatRelativeTime(v.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border">
          <span className="text-xs text-content-muted">
            Showing {page * pageSize + 1}-
            {Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}{' '}
            versions
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-xs font-medium rounded-lg border border-border text-content-secondary hover:bg-gray-50 dark:hover:bg-dark-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-xs font-medium rounded-lg border border-border text-content-secondary hover:bg-gray-50 dark:hover:bg-dark-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
