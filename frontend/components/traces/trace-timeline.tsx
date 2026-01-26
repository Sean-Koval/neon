'use client'

/**
 * Trace Timeline Component
 *
 * Waterfall visualization of spans in a trace.
 */

import {
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  MessageSquare,
  Wrench,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Span type for the timeline
 */
interface TimelineSpan {
  span_id: string
  parent_span_id: string | null
  name: string
  span_type: 'span' | 'generation' | 'tool' | 'retrieval' | 'event'
  timestamp: string
  duration_ms: number
  status: 'unset' | 'ok' | 'error'
  children?: TimelineSpan[]
}

interface TraceTimelineProps {
  spans: TimelineSpan[]
  onSpanSelect?: (span: TimelineSpan) => void
  selectedSpanId?: string
}

/**
 * Get color for span type
 */
function getSpanColor(type: TimelineSpan['span_type']): string {
  switch (type) {
    case 'generation':
      return 'bg-purple-500'
    case 'tool':
      return 'bg-blue-500'
    case 'retrieval':
      return 'bg-green-500'
    case 'event':
      return 'bg-yellow-500'
    default:
      return 'bg-gray-500'
  }
}

/**
 * Get icon for span type
 */
function getSpanIcon(type: TimelineSpan['span_type']) {
  switch (type) {
    case 'generation':
      return MessageSquare
    case 'tool':
      return Wrench
    case 'retrieval':
      return Database
    case 'event':
      return Zap
    default:
      return Clock
  }
}

/**
 * Calculate timeline metrics
 */
function calculateMetrics(spans: TimelineSpan[]) {
  if (spans.length === 0) return { startTime: 0, endTime: 0, totalDuration: 0 }

  const timestamps = spans.map((s) => new Date(s.timestamp).getTime())
  const startTime = Math.min(...timestamps)
  const endTimes = spans.map(
    (s) => new Date(s.timestamp).getTime() + s.duration_ms,
  )
  const endTime = Math.max(...endTimes)

  return {
    startTime,
    endTime,
    totalDuration: endTime - startTime,
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
  const Icon = getSpanIcon(span.span_type)
  const hasChildren = span.children && span.children.length > 0

  // Calculate position in timeline
  const spanStart = new Date(span.timestamp).getTime()
  const offsetPercent =
    ((spanStart - metrics.startTime) / metrics.totalDuration) * 100
  const widthPercent = (span.duration_ms / metrics.totalDuration) * 100

  return (
    <div
      className={cn(
        'flex items-center border-b border-gray-100 hover:bg-gray-50 cursor-pointer',
        isSelected && 'bg-blue-50',
      )}
      onClick={onSelect}
    >
      {/* Span info */}
      <div
        className="flex items-center gap-2 py-2 px-3 min-w-[300px] max-w-[300px] border-r border-gray-100"
        style={{ paddingLeft: `${span.depth * 20 + 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}

        <div
          className={cn(
            'w-2 h-2 rounded-full',
            span.status === 'error'
              ? 'bg-red-500'
              : getSpanColor(span.span_type),
          )}
        />

        <Icon className="w-4 h-4 text-gray-500" />

        <span className="text-sm truncate" title={span.name}>
          {span.name}
        </span>
      </div>

      {/* Timeline bar */}
      <div className="flex-1 relative h-10 bg-gray-50">
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 h-4 rounded',
            span.status === 'error'
              ? 'bg-red-400'
              : getSpanColor(span.span_type),
            'opacity-80',
          )}
          style={{
            left: `${offsetPercent}%`,
            width: `${Math.max(widthPercent, 0.5)}%`,
          }}
        />
      </div>

      {/* Duration */}
      <div className="w-20 text-right pr-3 text-sm text-gray-500">
        {formatDuration(span.duration_ms)}
      </div>
    </div>
  )
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
 * Trace Timeline Component
 */
export function TraceTimeline({
  spans,
  onSpanSelect,
  selectedSpanId,
}: TraceTimelineProps) {
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(
    new Set(spans.map((s) => s.span_id)), // Start expanded
  )

  const metrics = calculateMetrics(flattenSpans(spans))
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
      current = flatSpans.find(
        (s) => s.span_id === current.parent_span_id,
      ) as typeof span
      if (!current) break
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

  if (spans.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500">
        No spans in this trace
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center bg-gray-100 border-b text-sm font-medium text-gray-600">
        <div className="min-w-[300px] max-w-[300px] px-3 py-2 border-r">
          Span
        </div>
        <div className="flex-1 px-3 py-2">Timeline</div>
        <div className="w-20 text-right pr-3 py-2">Duration</div>
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
    </div>
  )
}

export default TraceTimeline
