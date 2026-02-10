'use client'

/**
 * Span Diff List Component
 *
 * Shows a side-by-side comparison of spans with diff highlighting.
 */

import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, Minus, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { getSpanTypeConfig } from '@/components/traces/span-type-badge'
import type { SpanDiff, SpanDiffStatus } from './types'
import { flattenSpanDiffs } from './utils'

interface SpanDiffListProps {
  diffs: SpanDiff[]
  onSpanSelect?: (diff: SpanDiff) => void
  selectedSpanId?: string
  filter?: SpanDiffStatus[]
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Get status styles
 */
function getStatusStyles(status: SpanDiffStatus) {
  switch (status) {
    case 'added':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
        border: 'border-l-emerald-500',
        text: 'text-emerald-700 dark:text-emerald-400',
        icon: Plus,
        label: 'Added',
      }
    case 'removed':
      return {
        bg: 'bg-rose-50 dark:bg-rose-500/10',
        border: 'border-l-rose-500',
        text: 'text-rose-700 dark:text-rose-400',
        icon: Minus,
        label: 'Removed',
      }
    case 'modified':
      return {
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        border: 'border-l-amber-500',
        text: 'text-amber-700 dark:text-amber-400',
        icon: RefreshCw,
        label: 'Modified',
      }
    default:
      return {
        bg: 'bg-white dark:bg-slate-900/55',
        border: 'border-l-gray-200 dark:border-l-slate-700/80',
        text: 'text-gray-500 dark:text-gray-400',
        icon: null,
        label: 'Unchanged',
      }
  }
}

/**
 * Get the span to display (prefer candidate, fallback to baseline)
 */
function getDisplaySpan(diff: SpanDiff) {
  return diff.candidate || diff.baseline
}

/**
 * Individual span diff row
 */
function SpanDiffRow({
  diff,
  isSelected,
  isExpanded,
  onToggle,
  onSelect,
}: {
  diff: SpanDiff & { depth: number }
  isSelected: boolean
  isExpanded: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const span = getDisplaySpan(diff)
  if (!span) return null

  const statusStyles = getStatusStyles(diff.status)
  const StatusIcon = statusStyles.icon
  const typeConfig = getSpanTypeConfig(span.span_type)
  const TypeIcon = typeConfig.icon
  const hasChildren = diff.children.length > 0

  // Calculate duration delta
  const durationDelta =
    diff.baseline && diff.candidate
      ? diff.candidate.duration_ms - diff.baseline.duration_ms
      : 0

  return (
    <div
      className={clsx(
        'flex items-stretch border-b border-border/70 dark:border-slate-700/75 cursor-pointer transition-colors duration-150',
        diff.status === 'unchanged'
          ? 'hover:bg-surface-raised/65 dark:hover:bg-slate-800/70'
          : 'hover:brightness-[0.99] dark:hover:brightness-110',
        statusStyles.bg,
        isSelected &&
          'ring-2 ring-inset ring-primary-500/45 bg-primary-500/5 dark:bg-primary-500/12',
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {/* Status indicator */}
      <div className={clsx('w-1 flex-shrink-0', statusStyles.border)} />

      {/* Span info */}
      <div
        className="flex items-center gap-2 py-2.5 px-3 min-w-[240px] max-w-[320px] flex-shrink-0"
        style={{ paddingLeft: `${diff.depth * 20 + 12}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-dark-700 rounded flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            )}
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Status icon */}
        {StatusIcon && (
          <StatusIcon
            className={clsx('w-4 h-4 flex-shrink-0', statusStyles.text)}
          />
        )}

        {/* Type icon */}
        <TypeIcon
          className={clsx('w-4 h-4 flex-shrink-0', typeConfig.textColor)}
        />

        {/* Span name */}
        <span
          className={clsx(
            'text-sm truncate text-content-primary',
            diff.status === 'removed' && 'line-through opacity-60',
          )}
          title={span.name}
        >
          {span.tool_name || span.model || span.name}
        </span>
      </div>

      {/* Baseline column */}
      <div className="flex-1 flex items-center justify-end gap-2 px-3 py-2.5 border-l border-border/70 min-w-[120px] dark:border-slate-700/80">
        {diff.baseline ? (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {formatDuration(diff.baseline.duration_ms)}
            </span>
            {diff.baseline.total_tokens && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {diff.baseline.total_tokens.toLocaleString()} tok
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500 italic">-</span>
        )}
      </div>

      {/* Candidate column */}
      <div className="flex-1 flex items-center justify-end gap-2 px-3 py-2.5 border-l border-border/70 min-w-[120px] dark:border-slate-700/80">
        {diff.candidate ? (
          <>
            <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
              {formatDuration(diff.candidate.duration_ms)}
            </span>
            {diff.candidate.total_tokens && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {diff.candidate.total_tokens.toLocaleString()} tok
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500 italic">-</span>
        )}
      </div>

      {/* Delta column */}
      <div className="w-24 flex items-center justify-end px-3 py-2.5 border-l border-border/70 dark:border-slate-700/80">
        {diff.status === 'modified' && durationDelta !== 0 ? (
          <span
            className={clsx(
              'text-sm font-medium',
              durationDelta > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {durationDelta > 0 ? '+' : ''}
            {formatDuration(durationDelta)}
          </span>
        ) : diff.status === 'added' ? (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase">
            New
          </span>
        ) : diff.status === 'removed' ? (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400 uppercase">
            Gone
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
        )}
      </div>
    </div>
  )
}

/**
 * Filter toggle button
 */
function FilterToggle({
  status,
  count,
  isActive,
  onClick,
}: {
  status: SpanDiffStatus
  count: number
  isActive: boolean
  onClick: () => void
}) {
  const styles = getStatusStyles(status)

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
        isActive
          ? `${styles.bg} ${styles.text} border-current`
          : 'bg-surface-card text-content-secondary border-border hover:bg-surface-raised',
      )}
    >
      {styles.icon && <styles.icon className="w-3.5 h-3.5" />}
      <span>{styles.label}</span>
      <span
        className={clsx(
          'px-1.5 py-0.5 rounded text-xs',
          isActive ? 'bg-white/50 dark:bg-black/20' : 'bg-surface-raised',
        )}
      >
        {count}
      </span>
    </button>
  )
}

export function SpanDiffList({
  diffs,
  onSpanSelect,
  selectedSpanId,
  filter: externalFilter,
}: SpanDiffListProps) {
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(() => {
    // Start with all spans expanded
    const allIds = new Set<string>()
    const collectIds = (spanDiffs: SpanDiff[]) => {
      for (const diff of spanDiffs) {
        const span = diff.baseline || diff.candidate
        if (span) allIds.add(span.span_id)
        collectIds(diff.children)
      }
    }
    collectIds(diffs)
    return allIds
  })

  const [activeFilters, setActiveFilters] = useState<Set<SpanDiffStatus>>(
    new Set(['added', 'removed', 'modified', 'unchanged']),
  )

  // Count spans by status
  const statusCounts = { added: 0, removed: 0, modified: 0, unchanged: 0 }
  const countStatus = (spanDiffs: SpanDiff[]) => {
    for (const diff of spanDiffs) {
      statusCounts[diff.status]++
      countStatus(diff.children)
    }
  }
  countStatus(diffs)

  // Flatten and filter
  const flatDiffs = flattenSpanDiffs(diffs)
  const effectiveFilters = externalFilter || [...activeFilters]
  const visibleDiffs = flatDiffs.filter((diff) => {
    // Check if status matches filter
    if (!effectiveFilters.includes(diff.status)) return false

    // Check if visible based on expanded state
    if (diff.depth === 0) return true

    // Check ancestors
    let parent = flatDiffs.find((d) => {
      const parentSpan = d.baseline || d.candidate
      const childSpan = diff.baseline || diff.candidate
      return (
        parentSpan?.span_id === childSpan?.parent_span_id ||
        d.children.some(
          (c) =>
            (c.baseline?.span_id || c.candidate?.span_id) ===
            childSpan?.span_id,
        )
      )
    })
    while (parent) {
      const parentSpan = parent.baseline || parent.candidate
      if (parentSpan && !expandedSpans.has(parentSpan.span_id)) return false
      const nextParent = flatDiffs.find((d) => {
        const pSpan = d.baseline || d.candidate
        return pSpan?.span_id === parentSpan?.parent_span_id
      })
      parent = nextParent
    }
    return true
  })

  const toggleExpand = (spanId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev)
      if (next.has(spanId)) {
        next.delete(spanId)
      } else {
        next.add(spanId)
      }
      return next
    })
  }

  const toggleFilter = (status: SpanDiffStatus) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  const expandAll = () => {
    const allIds = new Set<string>()
    const collectIds = (spanDiffs: SpanDiff[]) => {
      for (const diff of spanDiffs) {
        const span = diff.baseline || diff.candidate
        if (span) allIds.add(span.span_id)
        collectIds(diff.children)
      }
    }
    collectIds(diffs)
    setExpandedSpans(allIds)
  }

  const collapseAll = () => {
    setExpandedSpans(new Set())
  }

  return (
    <div className="space-y-4">
      {/* Filter toggles */}
      {!externalFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-card px-3 py-2 shadow-sm dark:bg-slate-900/70 dark:border-slate-700/80">
          <span className="text-sm text-content-secondary mr-2">Show:</span>
          <FilterToggle
            status="added"
            count={statusCounts.added}
            isActive={activeFilters.has('added')}
            onClick={() => toggleFilter('added')}
          />
          <FilterToggle
            status="removed"
            count={statusCounts.removed}
            isActive={activeFilters.has('removed')}
            onClick={() => toggleFilter('removed')}
          />
          <FilterToggle
            status="modified"
            count={statusCounts.modified}
            isActive={activeFilters.has('modified')}
            onClick={() => toggleFilter('modified')}
          />
          <FilterToggle
            status="unchanged"
            count={statusCounts.unchanged}
            isActive={activeFilters.has('unchanged')}
            onClick={() => toggleFilter('unchanged')}
          />
        </div>
      )}

      {/* Diff table */}
      <div className="border border-border rounded-xl overflow-hidden bg-surface-card shadow-sm dark:bg-slate-900/72 dark:border-slate-700/80">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center bg-surface-raised border-b border-border text-sm font-medium text-content-secondary backdrop-blur-sm dark:bg-slate-900/96 dark:border-slate-700/85 dark:text-slate-300">
          <div className="w-1 flex-shrink-0" />
          <div className="min-w-[240px] max-w-[320px] px-3 py-2.5 flex items-center justify-between flex-shrink-0">
            <span>Span</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={expandAll}
                className="rounded px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
                title="Expand all"
              >
                +
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
                title="Collapse all"
              >
                -
              </button>
            </div>
          </div>
          <div className="flex-1 px-3 py-2.5 text-right border-l border-border min-w-[120px] dark:border-slate-700/85">
            Baseline
          </div>
          <div className="flex-1 px-3 py-2.5 text-right border-l border-border min-w-[120px] dark:border-slate-700/85">
            Candidate
          </div>
          <div className="w-24 px-3 py-2.5 text-right border-l border-border dark:border-slate-700/85">
            Delta
          </div>
        </div>

        {/* Rows */}
        <div className="max-h-[600px] overflow-y-auto">
          {visibleDiffs.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              No spans match the current filters
            </div>
          ) : (
            visibleDiffs.map((diff) => {
              const span = diff.baseline || diff.candidate
              if (!span) return null
              return (
                <SpanDiffRow
                  key={span.span_id}
                  diff={diff}
                  isSelected={span.span_id === selectedSpanId}
                  isExpanded={expandedSpans.has(span.span_id)}
                  onToggle={() => toggleExpand(span.span_id)}
                  onSelect={() => onSpanSelect?.(diff)}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
