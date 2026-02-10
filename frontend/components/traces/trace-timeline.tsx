'use client'

/**
 * Trace Timeline Component
 *
 * Waterfall visualization of spans in a trace with color coding
 * by span type and mobile-responsive layout.
 */

import { clsx } from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  plotMode?: PlotMode
  onPlotModeChange?: (mode: PlotMode) => void
}

export type PlotMode = 'waterfall' | 'duration'

function parseDurationMs(value: number | string | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseTimestampMs(value: string): number {
  const fromDateCtor = new Date(value).getTime()
  if (Number.isFinite(fromDateCtor)) return fromDateCtor

  // Normalize common DB datetime format: "YYYY-MM-DD HH:mm:ss.SSS"
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const withTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`
  const parsed = Date.parse(withTimezone)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Calculate timeline metrics
 */
function calculateMetrics(spans: TimelineSpan[]) {
  if (spans.length === 0) {
    return {
      startTime: 0,
      endTime: 0,
      totalDuration: 1,
      usingActiveWindow: false,
    }
  }

  const allSpans = flattenSpans(spans)
  const withTimes = allSpans.map((span) => {
    const start = parseTimestampMs(span.timestamp)
    const duration = parseDurationMs(span.duration_ms)
    const end = start + duration
    return { ...span, start, end }
  })

  const timestamps = withTimes.map((s) => s.start)
  const endTimes = withTimes.map((s) => s.end)
  const absoluteStart = Math.min(...timestamps)
  const absoluteEnd = Math.max(...endTimes)
  const absoluteDuration = Math.max(absoluteEnd - absoluteStart, 1)

  // Detect a dominant envelope span (often a root span) that causes all
  // child spans to appear compressed at the left edge.
  const envelopeCandidates = withTimes.filter(
    (span) =>
      span.start === absoluteStart &&
      span.end === absoluteEnd &&
      (span.children?.length ?? 0) > 0,
  )
  const dominantEnvelope = envelopeCandidates.sort(
    (a, b) => b.duration_ms - a.duration_ms,
  )[0]

  const nonEnvelopeSpans = dominantEnvelope
    ? withTimes.filter((span) => span.span_id !== dominantEnvelope.span_id)
    : withTimes

  if (nonEnvelopeSpans.length >= 2) {
    const activeStart = Math.min(...nonEnvelopeSpans.map((span) => span.start))
    const activeEnd = Math.max(...nonEnvelopeSpans.map((span) => span.end))
    const activeDuration = Math.max(activeEnd - activeStart, 1)
    const activeShare = activeDuration / absoluteDuration

    // If the active spans are packed into a small fraction of total trace time,
    // zoom into the active window with light padding.
    if (activeShare < 0.7) {
      const padding = activeDuration * 0.06
      const paddedStart = Math.max(absoluteStart, activeStart - padding)
      const paddedEnd = Math.min(absoluteEnd, activeEnd + padding)
      return {
        startTime: paddedStart,
        endTime: paddedEnd,
        totalDuration: Math.max(paddedEnd - paddedStart, 1),
        usingActiveWindow: true,
      }
    }
  }

  return {
    startTime: absoluteStart,
    endTime: absoluteEnd,
    totalDuration: absoluteDuration,
    usingActiveWindow: false,
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

function getPointMarkerColor(span: TimelineSpan): string {
  if (span.status === 'error') return 'bg-red-500'
  if (span.span_type === 'tool') return 'bg-blue-500'
  if (span.span_type === 'generation') return 'bg-violet-500'
  if (span.span_type === 'agent') return 'bg-orange-500'
  return 'bg-content-primary/85'
}

/**
 * Single span row in the timeline
 */
function SpanRow({
  span,
  metrics,
  plotMode,
  durationScaleMs,
  isSelected,
  isExpanded,
  onToggle,
  onSelect,
}: {
  span: TimelineSpan & { depth: number }
  metrics: { startTime: number; totalDuration: number }
  plotMode: PlotMode
  durationScaleMs: number
  isSelected: boolean
  isExpanded: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const typeConfig = getSpanTypeConfig(span.span_type)
  const Icon = typeConfig.icon
  const hasChildren = span.children && span.children.length > 0

  // Calculate position in timeline
  const spanStart = parseTimestampMs(span.timestamp)
  const durationMs = parseDurationMs(span.duration_ms)
  const spanEnd = spanStart + durationMs
  const timelineStartPercent =
    ((spanStart - metrics.startTime) / metrics.totalDuration) * 100
  const timelineEndPercent =
    ((spanEnd - metrics.startTime) / metrics.totalDuration) * 100
  const clampedTimelineStart = Math.max(0, Math.min(timelineStartPercent, 100))
  const clampedTimelineEnd = Math.max(0, Math.min(timelineEndPercent, 100))

  const offsetPercent = plotMode === 'waterfall' ? clampedTimelineStart : 0

  const rawWidthPercent =
    plotMode === 'waterfall'
      ? Math.max(clampedTimelineEnd - clampedTimelineStart, 0)
      : Math.max((durationMs / durationScaleMs) * 100, 0)
  const isPointLike = rawWidthPercent < 0.25
  const widthPercent = rawWidthPercent
  const pointMarkerColor = getPointMarkerColor(span)

  return (
    // biome-ignore lint/a11y/useSemanticElements: Timeline rows need a non-button container because they include nested interactive controls.
    <div
      className={clsx(
        'flex items-center border-b border-border hover:bg-surface-raised cursor-pointer transition-colors',
        isSelected &&
          'bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20',
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
        className="flex items-center gap-1.5 sm:gap-2 py-2 px-2 sm:px-3 min-w-[180px] sm:min-w-[280px] max-w-[180px] sm:max-w-[280px] border-r border-border"
        style={{ paddingLeft: `${span.depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="p-0.5 hover:bg-surface-overlay rounded flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-content-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-content-muted" />
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
      <div className="hidden sm:block flex-1 relative h-10 bg-surface-base/60">
        {!isPointLike && (
          <div
            className={clsx(
              'absolute top-1/2 -translate-y-1/2 h-4 rounded transition-all ring-1 ring-black/5 dark:ring-white/10',
              span.status === 'error' ? 'bg-red-400' : typeConfig.barColor,
              isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-95',
            )}
            style={{
              left: `${Math.min(offsetPercent, 99)}%`,
              width: `${widthPercent}%`,
            }}
            title={`${getSpanLabel(span)} • ${formatDuration(durationMs)}`}
          />
        )}
        {isPointLike && (
          <>
            <div
              className={clsx(
                'absolute top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-full shadow-[0_0_0_1px_rgba(15,23,42,0.12)] dark:shadow-[0_0_0_1px_rgba(148,163,184,0.28)]',
                pointMarkerColor,
              )}
              style={{ left: `${Math.min(offsetPercent, 99.5)}%` }}
              title={`${getSpanLabel(span)} • ${formatDuration(durationMs)}`}
            />
            <div
              className={clsx(
                'absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full',
                pointMarkerColor,
              )}
              style={{ left: `calc(${Math.min(offsetPercent, 99.5)}% - 3px)` }}
            />
          </>
        )}
      </div>

      {/* Duration */}
      <div className="w-16 sm:w-20 text-right pr-2 sm:pr-3 text-xs sm:text-sm text-content-muted font-medium">
        {formatDuration(durationMs)}
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
    <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-border bg-surface-raised text-xs">
      {types.map(({ type, label }) => {
        const config = getSpanTypeConfig(type)
        return (
          <div key={type} className="flex items-center gap-1.5">
            <div className={clsx('w-2.5 h-2.5 rounded-sm', config.barColor)} />
            <span className="text-content-secondary">{label}</span>
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
  plotMode,
  onPlotModeChange,
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
  const [internalPlotMode, setInternalPlotMode] = useState<PlotMode>(
    plotMode ?? 'waterfall',
  )

  useEffect(() => {
    if (plotMode) {
      setInternalPlotMode(plotMode)
    }
  }, [plotMode])

  const activePlotMode = plotMode ?? internalPlotMode

  const setPlotMode = (mode: PlotMode) => {
    if (!plotMode) {
      setInternalPlotMode(mode)
    }
    onPlotModeChange?.(mode)
  }

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

  const durationScaleMs = Math.max(
    ...visibleSpans.map((span) => parseDurationMs(span.duration_ms)),
    1,
  )

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
      <div className="flex items-center justify-center h-40 text-content-muted border border-border rounded-lg bg-surface-card">
        No spans in this trace
      </div>
    )
  }

  return (
    <div className="border border-border bg-surface-card rounded-lg overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center bg-surface-raised border-b border-border text-sm font-medium text-content-secondary">
        <div className="min-w-[180px] sm:min-w-[280px] max-w-[180px] sm:max-w-[280px] px-2 sm:px-3 py-2 border-r border-border flex items-center justify-between">
          <span>Span</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={expandAll}
              className="text-xs text-content-muted hover:text-content-primary px-1"
              title="Expand all"
            >
              +
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="text-xs text-content-muted hover:text-content-primary px-1"
              title="Collapse all"
            >
              −
            </button>
          </div>
        </div>
        <div className="hidden sm:flex flex-1 items-center justify-between gap-3 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-content-muted">
              {activePlotMode === 'waterfall' ? 'Timeline' : 'Duration Plot'}
            </span>
            {activePlotMode === 'waterfall' &&
              (metrics.usingActiveWindow ? (
                <span className="hidden lg:inline text-[10px] text-content-muted/80">
                  active window view
                </span>
              ) : (
                <span className="hidden lg:inline text-[10px] text-content-muted/80">
                  full trace view
                </span>
              ))}
            {activePlotMode === 'duration' && (
              <span className="hidden xl:inline text-[10px] text-content-muted/80">
                bars start at zero; widths show relative duration
              </span>
            )}
          </div>
          <div className="inline-flex items-center rounded-md border border-border bg-surface-card p-0.5 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setPlotMode('waterfall')}
              className={clsx(
                'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                activePlotMode === 'waterfall'
                  ? 'bg-surface-overlay text-content-primary'
                  : 'text-content-muted hover:text-content-primary',
              )}
            >
              <span className="hidden lg:inline">Absolute Timeline</span>
              <span className="lg:hidden">Absolute</span>
            </button>
            <button
              type="button"
              onClick={() => setPlotMode('duration')}
              className={clsx(
                'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                activePlotMode === 'duration'
                  ? 'bg-surface-overlay text-content-primary'
                  : 'text-content-muted hover:text-content-primary',
              )}
            >
              <span className="hidden lg:inline">Duration Compare</span>
              <span className="lg:hidden">Compare</span>
            </button>
          </div>
        </div>
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
            plotMode={activePlotMode}
            durationScaleMs={durationScaleMs}
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
