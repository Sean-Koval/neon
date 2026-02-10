'use client'

/**
 * Trace Selector Component
 *
 * Dropdown selectors for choosing two traces to compare.
 */

import { clsx } from 'clsx'
import { CheckCircle, ChevronDown, Search, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { type TraceSummary, useTraces } from '@/hooks/use-traces'

interface TraceSelectorProps {
  label: string
  value: string | null
  onChange: (traceId: string) => void
  excludeId?: string
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/**
 * Trace option row
 */
function TraceOption({
  trace,
  isSelected,
  onClick,
}: {
  trace: TraceSummary
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors',
        isSelected && 'bg-primary-500/10',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
            {trace.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{trace.trace_id}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {trace.status === 'ok' ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatRelativeTime(trace.timestamp)}
          </span>
        </div>
      </div>
    </button>
  )
}

export function TraceSelector({
  label,
  value,
  onChange,
  excludeId,
}: TraceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: traces, isLoading } = useTraces({
    limit: 100,
    search: searchQuery || undefined,
  })

  // Filter out excluded trace
  const filteredTraces = traces?.filter((t) => t.trace_id !== excludeId) || []

  // Find selected trace
  const selectedTrace = traces?.find((t) => t.trace_id === value)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-content-secondary mb-1">
        {label}
      </label>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'w-full flex items-center justify-between gap-2 px-3 py-2 border border-border rounded-lg bg-surface-card text-left',
          'hover:bg-surface-raised transition-colors shadow-sm',
          isOpen && 'ring-2 ring-primary-500/35 border-primary-500/40',
        )}
      >
        {selectedTrace ? (
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
              {selectedTrace.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {selectedTrace.trace_id.slice(0, 12)}...
            </div>
          </div>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">Select a trace...</span>
        )}
        <ChevronDown
          className={clsx(
            'w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-surface-card border border-border rounded-lg shadow-xl max-h-80 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-border bg-surface-raised/40">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search traces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-border bg-surface-card rounded-lg focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/40"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                Loading traces...
              </div>
            ) : filteredTraces.length === 0 ? (
              <div className="px-3 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                No traces found
              </div>
            ) : (
              filteredTraces.map((trace) => (
                <TraceOption
                  key={trace.trace_id}
                  trace={trace}
                  isSelected={trace.trace_id === value}
                  onClick={() => {
                    onChange(trace.trace_id)
                    setIsOpen(false)
                    setSearchQuery('')
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Dual trace selector for comparing two traces
 */
interface DualTraceSelectorProps {
  baselineId: string | null
  candidateId: string | null
  onBaselineChange: (id: string) => void
  onCandidateChange: (id: string) => void
}

export function DualTraceSelector({
  baselineId,
  candidateId,
  onBaselineChange,
  onCandidateChange,
}: DualTraceSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <TraceSelector
        label="Baseline Trace"
        value={baselineId}
        onChange={onBaselineChange}
        excludeId={candidateId || undefined}
      />
      <TraceSelector
        label="Candidate Trace"
        value={candidateId}
        onChange={onCandidateChange}
        excludeId={baselineId || undefined}
      />
    </div>
  )
}
