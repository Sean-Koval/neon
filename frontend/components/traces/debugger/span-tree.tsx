'use client'

/**
 * Span Tree Component
 *
 * Recursive tree view of span hierarchy with expand/collapse,
 * color-coding by span type, and inline duration/status display.
 */

import { clsx } from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { SpanSummary } from '@/components/traces/span-detail'
import {
  getSpanTypeConfig,
  SpanTypeBadge,
} from '@/components/traces/span-type-badge'

interface SpanTreeProps {
  spans: SpanSummary[]
  selectedSpanId: string | null
  onSpanSelect: (span: SpanSummary) => void
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function getSpanLabel(span: SpanSummary): string {
  if (span.span_type === 'tool' && span.tool_name) return span.tool_name
  if (span.span_type === 'generation' && span.model) return span.model
  return span.name
}

function collectAllIds(spans: SpanSummary[]): Set<string> {
  const ids = new Set<string>()
  function walk(list: SpanSummary[]) {
    for (const s of list) {
      ids.add(s.span_id)
      if (s.children) walk(s.children)
    }
  }
  walk(spans)
  return ids
}

function SpanNode({
  span,
  depth,
  selectedSpanId,
  onSpanSelect,
  expandedIds,
  onToggle,
}: {
  span: SpanSummary
  depth: number
  selectedSpanId: string | null
  onSpanSelect: (span: SpanSummary) => void
  expandedIds: Set<string>
  onToggle: (id: string) => void
}) {
  const hasChildren = span.children && span.children.length > 0
  const isExpanded = expandedIds.has(span.span_id)
  const isSelected = span.span_id === selectedSpanId
  const typeConfig = getSpanTypeConfig(span.span_type)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSpanSelect(span)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSpanSelect(span)
          }
        }}
        className={clsx(
          'flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors group',
          isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50',
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(span.span_id)
            }}
            className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>
        ) : (
          <div className="w-4.5 flex-shrink-0" />
        )}

        {/* Status dot */}
        <div
          className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            span.status === 'error' ? 'bg-red-500' : typeConfig.barColor,
          )}
        />

        {/* Span type badge */}
        <SpanTypeBadge type={span.span_type} size="sm" showLabel={false} />

        {/* Span name */}
        <span
          className={clsx(
            'text-sm truncate flex-1',
            isSelected ? 'font-medium text-blue-900' : 'text-gray-900',
          )}
          title={span.name}
        >
          {getSpanLabel(span)}
        </span>

        {/* Duration */}
        <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
          {formatDuration(span.duration_ms)}
        </span>

        {/* Status indicator for errors */}
        {span.status === 'error' && (
          <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded flex-shrink-0">
            error
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {(span.children ?? []).map((child) => (
            <SpanNode
              key={child.span_id}
              span={child}
              depth={depth + 1}
              selectedSpanId={selectedSpanId}
              onSpanSelect={onSpanSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function SpanTree({
  spans,
  selectedSpanId,
  onSpanSelect,
}: SpanTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    collectAllIds(spans),
  )

  const onToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedIds(collectAllIds(spans))
  }, [spans])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  if (spans.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
        No spans in this trace
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
        <span className="text-xs font-medium text-gray-600">
          Span Hierarchy
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-0.5 hover:bg-gray-200 rounded"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-0.5 hover:bg-gray-200 rounded"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div className="max-h-[500px] overflow-y-auto p-1">
        {spans.map((span) => (
          <SpanNode
            key={span.span_id}
            span={span}
            depth={0}
            selectedSpanId={selectedSpanId}
            onSpanSelect={onSpanSelect}
            expandedIds={expandedIds}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

export default SpanTree
