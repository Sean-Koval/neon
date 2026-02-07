'use client'

/**
 * Span Timeline Component
 *
 * Horizontal waterfall timeline visualization showing span timing
 * with color-coded bars by span type, hover tooltips, and click selection.
 */

import { clsx } from 'clsx'
import { useState } from 'react'
import type { SpanSummary } from '@/components/traces/span-detail'
import {
  getSpanTypeConfig,
  type SpanType,
} from '@/components/traces/span-type-badge'

interface SpanTimelineProps {
  spans: SpanSummary[]
  selectedSpanId: string | null
  onSpanSelect: (span: SpanSummary) => void
}

interface FlatSpan extends SpanSummary {
  depth: number
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function flattenSpans(spans: SpanSummary[], depth = 0): FlatSpan[] {
  const result: FlatSpan[] = []
  for (const span of spans) {
    result.push({ ...span, depth })
    if (span.children && span.children.length > 0) {
      result.push(...flattenSpans(span.children, depth + 1))
    }
  }
  return result
}

function calculateMetrics(flatSpans: FlatSpan[]) {
  if (flatSpans.length === 0)
    return { startTime: 0, endTime: 0, totalDuration: 1 }
  const timestamps = flatSpans.map((s) => new Date(s.timestamp).getTime())
  const startTime = Math.min(...timestamps)
  const endTimes = flatSpans.map(
    (s) => new Date(s.timestamp).getTime() + s.duration_ms,
  )
  const endTime = Math.max(...endTimes)
  return {
    startTime,
    endTime,
    totalDuration: Math.max(endTime - startTime, 1),
  }
}

function getSpanLabel(span: SpanSummary): string {
  if (span.span_type === 'tool' && span.tool_name) return span.tool_name
  if (span.span_type === 'generation' && span.model) return span.model
  return span.name
}

function TimelineBar({
  span,
  metrics,
  isSelected,
  onSelect,
  hoveredId,
  onHover,
}: {
  span: FlatSpan
  metrics: { startTime: number; totalDuration: number }
  isSelected: boolean
  onSelect: () => void
  hoveredId: string | null
  onHover: (id: string | null) => void
}) {
  const typeConfig = getSpanTypeConfig(span.span_type)
  const spanStart = new Date(span.timestamp).getTime()
  const offsetPercent =
    ((spanStart - metrics.startTime) / metrics.totalDuration) * 100
  const widthPercent = (span.duration_ms / metrics.totalDuration) * 100
  const isHovered = hoveredId === span.span_id

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(
        'flex items-center h-7 cursor-pointer transition-colors',
        isSelected ? 'bg-blue-50' : isHovered ? 'bg-gray-50' : '',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onMouseEnter={() => onHover(span.span_id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Label area */}
      <div
        className="flex items-center gap-1.5 min-w-[140px] max-w-[140px] sm:min-w-[200px] sm:max-w-[200px] px-2 border-r border-gray-100 overflow-hidden"
        style={{ paddingLeft: `${span.depth * 12 + 8}px` }}
      >
        <div
          className={clsx(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            span.status === 'error' ? 'bg-red-500' : typeConfig.barColor,
          )}
        />
        <span className="text-xs truncate text-gray-700" title={span.name}>
          {getSpanLabel(span)}
        </span>
      </div>

      {/* Timeline bar area */}
      <div className="flex-1 relative h-full px-1">
        <div
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 h-4 rounded-sm transition-all',
            span.status === 'error' ? 'bg-red-400' : typeConfig.barColor,
            isSelected
              ? 'opacity-100 ring-1 ring-blue-400'
              : isHovered
                ? 'opacity-90'
                : 'opacity-70',
          )}
          style={{
            left: `${Math.min(offsetPercent, 99)}%`,
            width: `${Math.max(widthPercent, 0.4)}%`,
            minWidth: '3px',
          }}
        />

        {/* Tooltip on hover */}
        {isHovered && (
          <div
            className="absolute z-20 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap pointer-events-none"
            style={{
              left: `${Math.min(offsetPercent, 80)}%`,
            }}
          >
            <div className="font-medium">{span.name}</div>
            <div className="text-gray-300">
              {span.span_type} &middot; {formatDuration(span.duration_ms)}
              {span.status === 'error' && ' \u00b7 ERROR'}
            </div>
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="w-14 text-right pr-2 text-xs text-gray-500 tabular-nums flex-shrink-0">
        {formatDuration(span.duration_ms)}
      </div>
    </div>
  )
}

function TimelineLegend() {
  const types: Array<{ type: SpanType; label: string }> = [
    { type: 'generation', label: 'LLM' },
    { type: 'tool', label: 'Tool' },
    { type: 'retrieval', label: 'Retrieval' },
    { type: 'span', label: 'Other' },
  ]

  return (
    <div className="flex flex-wrap gap-3 px-3 py-1.5 border-t bg-gray-50 text-xs">
      {types.map(({ type, label }) => {
        const config = getSpanTypeConfig(type)
        return (
          <div key={type} className="flex items-center gap-1.5">
            <div className={clsx('w-2.5 h-2.5 rounded-sm', config.barColor)} />
            <span className="text-gray-600">{label}</span>
          </div>
        )
      })}
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
        <span className="text-gray-600">Error</span>
      </div>
    </div>
  )
}

export function SpanTimeline({
  spans,
  selectedSpanId,
  onSpanSelect,
}: SpanTimelineProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const flatSpans = flattenSpans(spans)
  const metrics = calculateMetrics(flatSpans)

  if (flatSpans.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm border rounded-lg">
        No spans to display
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center bg-gray-100 border-b text-xs font-medium text-gray-600">
        <div className="min-w-[140px] max-w-[140px] sm:min-w-[200px] sm:max-w-[200px] px-2 py-1.5 border-r border-gray-200">
          Span
        </div>
        <div className="flex-1 px-2 py-1.5">
          Timeline ({formatDuration(metrics.totalDuration)})
        </div>
        <div className="w-14 text-right pr-2 py-1.5">Duration</div>
      </div>

      {/* Rows */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
        {flatSpans.map((span) => (
          <TimelineBar
            key={span.span_id}
            span={span}
            metrics={metrics}
            isSelected={span.span_id === selectedSpanId}
            onSelect={() => onSpanSelect(span)}
            hoveredId={hoveredId}
            onHover={setHoveredId}
          />
        ))}
      </div>

      {/* Legend */}
      <TimelineLegend />
    </div>
  )
}

export default SpanTimeline
