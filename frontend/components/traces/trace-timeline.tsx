'use client'

/**
 * Trace Timeline Component
 *
 * Waterfall visualization of spans in a trace with color coding
 * by span type and mobile-responsive layout.
 */

import { clsx } from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { getSpanTypeConfig, type SpanType } from './span-type-badge'

/**
 * Span type for the timeline
 */
export interface TimelineSpan {
  span_id: string
  parent_span_id: string | null
  name: string
  span_type: SpanType | string
  timestamp: string
  duration_ms: number
  status: 'unset' | 'ok' | 'error'
  model?: string
  tool_name?: string
  total_tokens?: number
  children?: TimelineSpan[]
}

interface TraceTimelineProps {
  spans: TimelineSpan[]
  onSpanSelect?: (span: TimelineSpan) => void
  selectedSpanId?: string
}

/**
 * Calculate timeline metrics
 */
function calculateMetrics(spans: TimelineSpan[]) {
  if (spans.length === 0) return { startTime: 0, endTime: 0, totalDuration: 1 }

  const allSpans = flattenSpans(spans)
  const timestamps = allSpans.map((s) => new Date(s.timestamp).getTime())
  const startTime = Math.min(...timestamps)
  const endTimes = allSpans.map(
    (s) => new Date(s.timestamp).getTime() + s.duration_ms,
  )
  const endTime = Math.max(...endTimes)

  return {
    startTime,
    endTime,
    totalDuration: Math.max(endTime - startTime, 1),
  }
}

/**
 * Flatten spans into a list with depth info
 */
function flattenSpans(
  spans: TimelineSpan[],
  depth = 0,
): Array<TimelineSpan & { depth: number }> {
  const result: Array<TimelineSpan & { depth: number }> = []

  for (const span of spans) {
    result.push({ ...span, depth })
    if (span.children && span.children.length > 0) {
      result.push(...flattenSpans(span.children, depth + 1))
    }
  }

  return result
}

/**
 * Format duration in a human-readable way
 */
function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Get display label for span (name or tool/model info)
 */
function getSpanLabel(span: TimelineSpan): string {
  if (span.span_type === 'tool' && span.tool_name) {
    return span.tool_name
  }
  if (span.span_type === 'generation' && span.model) {
    return span.model
  }
  return span.name
}

/**
 * Single span row in the timeline
 */
function SpanRow({
  span,
  metrics,
  isSelected,
  isExpanded,
  onToggle,
  onSelect,
}: {
  span: TimelineSpan & { depth: number }
  metrics: { startTime: number; totalDuration: number }
  isSelected: boolean
  isExpanded: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const typeConfig = getSpanTypeConfig(span.span_type)
  const Icon = typeConfig.icon
  const hasChildren = span.children && span.children.length > 0

  // Calculate position in timeline
  const spanStart = new Date(span.timestamp).getTime()
  const offsetPercent =
    ((spanStart - metrics.startTime) / metrics.totalDuration) * 100
  const widthPercent = (span.duration_ms / metrics.totalDuration) * 100

  return (
    <div
      className={clsx(
        'flex items-center border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors',
        isSelected && 'bg-blue-50 hover:bg-blue-100',
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
      {/* Span info - responsive width */}
      <div
        className="flex items-center gap-1.5 sm:gap-2 py-2 px-2 sm:px-3 min-w-[180px] sm:min-w-[280px] max-w-[180px] sm:max-w-[280px] border-r border-gray-100"
        style={{ paddingLeft: `${span.depth * 16 + 8}px` }}
      >
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

        {/* Status indicator dot */}
        <div
          className={clsx(
            'w-2 h-2 rounded-full flex-shrink-0',
            span.status === 'error' ? 'bg-red-500' : typeConfig.barColor,
          )}
        />

        {/* Type icon */}
        <Icon className={clsx('w-4 h-4 flex-shrink-0', typeConfig.textColor)} />

        {/* Span name */}
        <span
          className="text-sm truncate"
          title={`${span.name}${span.tool_name ? ` (${span.tool_name})` : ''}`}
        >
          {getSpanLabel(span)}
        </span>
      </div>

      {/* Timeline bar - hidden on very small screens */}
      <div className="hidden sm:block flex-1 relative h-10 bg-gray-50/50">
        <div
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 h-4 rounded transition-all',
            span.status === 'error' ? 'bg-red-400' : typeConfig.barColor,
            isSelected ? 'opacity-100' : 'opacity-75 hover:opacity-90',
          )}
          style={{
            left: `${Math.min(offsetPercent, 99)}%`,
            width: `${Math.max(widthPercent, 0.5)}%`,
            minWidth: '4px',
          }}
        />
      </div>

      {/* Duration */}
      <div className="w-16 sm:w-20 text-right pr-2 sm:pr-3 text-xs sm:text-sm text-gray-500 font-medium">
        {formatDuration(span.duration_ms)}
      </div>
    </div>
  )
}

/**
 * Legend component showing span type colors
 */
function TimelineLegend() {
  const types: Array<{ type: SpanType; label: string }> = [
    { type: 'generation', label: 'LLM' },
    { type: 'tool', label: 'Tool' },
    { type: 'agent', label: 'Agent' },
    { type: 'retrieval', label: 'Retrieval' },
    { type: 'span', label: 'Other' },
  ]

  return (
    <div className="flex flex-wrap gap-3 px-3 py-2 border-t bg-gray-50 text-xs">
      {types.map(({ type, label }) => {
        const config = getSpanTypeConfig(type)
        return (
          <div key={type} className="flex items-center gap-1.5">
            <div className={clsx('w-2.5 h-2.5 rounded-sm', config.barColor)} />
            <span className="text-gray-600">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Trace Timeline Component
 */
export function TraceTimeline({
  spans,
  onSpanSelect,
  selectedSpanId,
}: TraceTimelineProps) {
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(() => {
    // Start with all spans expanded
    const allSpanIds = new Set<string>()
    const collectIds = (spanList: TimelineSpan[]) => {
      for (const span of spanList) {
        allSpanIds.add(span.span_id)
        if (span.children) collectIds(span.children)
      }
    }
    collectIds(spans)
    return allSpanIds
  })

  const metrics = calculateMetrics(spans)
  const flatSpans = flattenSpans(spans)

  // Filter to visible spans (based on expanded state)
  const visibleSpans = flatSpans.filter((span) => {
    if (span.depth === 0) return true

    // Check if all ancestors are expanded
    let current = span
    while (current.parent_span_id) {
      if (!expandedSpans.has(current.parent_span_id)) {
        return false
      }
      const parent = flatSpans.find((s) => s.span_id === current.parent_span_id)
      if (!parent) break
      current = parent
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

  const expandAll = () => {
    const allIds = flatSpans.map((s) => s.span_id)
    setExpandedSpans(new Set(allIds))
  }

  const collapseAll = () => {
    setExpandedSpans(new Set())
  }

  if (spans.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 border rounded-lg">
        No spans in this trace
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center bg-gray-100 border-b text-sm font-medium text-gray-600">
        <div className="min-w-[180px] sm:min-w-[280px] max-w-[180px] sm:max-w-[280px] px-2 sm:px-3 py-2 border-r flex items-center justify-between">
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
              −
            </button>
          </div>
        </div>
        <div className="hidden sm:block flex-1 px-3 py-2">Timeline</div>
        <div className="w-16 sm:w-20 text-right pr-2 sm:pr-3 py-2">
          Duration
        </div>
      </div>

      {/* Span rows */}
      <div className="max-h-[500px] overflow-y-auto">
        {visibleSpans.map((span) => (
          <SpanRow
            key={span.span_id}
            span={span}
            metrics={metrics}
            isSelected={span.span_id === selectedSpanId}
            isExpanded={expandedSpans.has(span.span_id)}
            onToggle={() => toggleExpand(span.span_id)}
            onSelect={() => onSpanSelect?.(span)}
          />
        ))}
      </div>

      {/* Legend */}
      <TimelineLegend />
    </div>
  )
}

export default TraceTimeline
