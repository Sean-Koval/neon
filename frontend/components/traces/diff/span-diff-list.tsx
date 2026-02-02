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
        bg: 'bg-green-50',
        border: 'border-l-green-500',
        text: 'text-green-700',
        icon: Plus,
        label: 'Added',
      }
    case 'removed':
      return {
        bg: 'bg-red-50',
        border: 'border-l-red-500',
        text: 'text-red-700',
        icon: Minus,
        label: 'Removed',
      }
    case 'modified':
      return {
        bg: 'bg-amber-50',
        border: 'border-l-amber-500',
        text: 'text-amber-700',
        icon: RefreshCw,
        label: 'Modified',
      }
    default:
      return {
        bg: 'bg-white',
        border: 'border-l-gray-200',
        text: 'text-gray-500',
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
        'flex items-stretch border-b border-gray-100 cursor-pointer transition-colors',
        statusStyles.bg,
        isSelected && 'ring-2 ring-inset ring-blue-500',
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
            className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
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
            'text-sm truncate',
            diff.status === 'removed' && 'line-through opacity-60',
          )}
          title={span.name}
        >
          {span.tool_name || span.model || span.name}
        </span>
      </div>

      {/* Baseline column */}
      <div className="flex-1 flex items-center justify-end gap-2 px-3 py-2.5 border-l border-gray-100 min-w-[120px]">
        {diff.baseline ? (
          <>
            <span className="text-sm text-gray-600">
              {formatDuration(diff.baseline.duration_ms)}
            </span>
            {diff.baseline.total_tokens && (
              <span className="text-xs text-gray-400">
                {diff.baseline.total_tokens.toLocaleString()} tok
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-gray-400 italic">-</span>
        )}
      </div>

      {/* Candidate column */}
      <div className="flex-1 flex items-center justify-end gap-2 px-3 py-2.5 border-l border-gray-100 min-w-[120px]">
        {diff.candidate ? (
          <>
            <span className="text-sm text-gray-900 font-medium">
              {formatDuration(diff.candidate.duration_ms)}
            </span>
            {diff.candidate.total_tokens && (
              <span className="text-xs text-gray-500">
                {diff.candidate.total_tokens.toLocaleString()} tok
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-gray-400 italic">-</span>
        )}
      </div>

      {/* Delta column */}
      <div className="w-24 flex items-center justify-end px-3 py-2.5 border-l border-gray-100">
        {diff.status === 'modified' && durationDelta !== 0 ? (
          <span
            className={clsx(
              'text-sm font-medium',
              durationDelta > 0 ? 'text-red-600' : 'text-green-600',
            )}
          >
            {durationDelta > 0 ? '+' : ''}
            {formatDuration(durationDelta)}
          </span>
        ) : diff.status === 'added' ? (
          <span className="text-xs font-medium text-green-600 uppercase">
            New
          </span>
        ) : diff.status === 'removed' ? (
          <span className="text-xs font-medium text-red-600 uppercase">
            Gone
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
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
          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50',
      )}
    >
      {styles.icon && <styles.icon className="w-3.5 h-3.5" />}
      <span>{styles.label}</span>
      <span
        className={clsx(
          'px-1.5 py-0.5 rounded text-xs',
          isActive ? 'bg-white/50' : 'bg-gray-100',
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 mr-2">Show:</span>
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
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center bg-gray-100 border-b text-sm font-medium text-gray-600">
          <div className="w-1 flex-shrink-0" />
          <div className="min-w-[240px] max-w-[320px] px-3 py-2.5 flex items-center justify-between flex-shrink-0">
            <span>Span</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs text-gray-500 hover:text-gray-700 px-1"
                title="Expand all"
              >
                +
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs text-gray-500 hover:text-gray-700 px-1"
                title="Collapse all"
              >
                -
              </button>
            </div>
          </div>
          <div className="flex-1 px-3 py-2.5 text-right border-l border-gray-200 min-w-[120px]">
            Baseline
          </div>
          <div className="flex-1 px-3 py-2.5 text-right border-l border-gray-200 min-w-[120px]">
            Candidate
          </div>
          <div className="w-24 px-3 py-2.5 text-right border-l border-gray-200">
            Delta
          </div>
        </div>

        {/* Rows */}
        <div className="max-h-[600px] overflow-y-auto">
          {visibleDiffs.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
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
