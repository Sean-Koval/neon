'use client'

/**
 * Timeline Overlay Component
 *
 * Shows two trace timelines overlaid for visual comparison.
 */

import { clsx } from 'clsx'
import { getSpanTypeConfig } from '@/components/traces/span-type-badge'
import type { Span } from '@/hooks/use-traces'
import type { TraceDiffResult } from './types'

interface TimelineOverlayProps {
  baseline: Span[]
  candidate: Span[]
  diff: TraceDiffResult
}

/**
 * Flatten spans into a list with timing info
 */
function flattenWithTiming(
  spans: Span[],
  baseTime: number,
): Array<{
  span: Span
  startOffset: number
  duration: number
  depth: number
}> {
  const result: Array<{
    span: Span
    startOffset: number
    duration: number
    depth: number
  }> = []

  function process(spanList: Span[], depth: number) {
    for (const span of spanList) {
      const startTime = new Date(span.timestamp).getTime()
      result.push({
        span,
        startOffset: startTime - baseTime,
        duration: span.duration_ms,
        depth,
      })
      if (span.children) {
        process(span.children, depth + 1)
      }
    }
  }

  process(spans, 0)
  return result
}

/**
 * Calculate timeline metrics from both traces
 */
function calculateMetrics(baseline: Span[], candidate: Span[]) {
  const allSpans = [
    ...flattenWithTiming(baseline, 0),
    ...flattenWithTiming(candidate, 0),
  ]
  if (allSpans.length === 0)
    return { totalDuration: 1000, baselineStart: 0, candidateStart: 0 }

  const baselineStart =
    baseline.length > 0 ? new Date(baseline[0].timestamp).getTime() : 0
  const candidateStart =
    candidate.length > 0 ? new Date(candidate[0].timestamp).getTime() : 0

  const baselineSpans = flattenWithTiming(baseline, baselineStart)
  const candidateSpans = flattenWithTiming(candidate, candidateStart)

  const baselineEnd = Math.max(
    ...baselineSpans.map((s) => s.startOffset + s.duration),
    0,
  )
  const candidateEnd = Math.max(
    ...candidateSpans.map((s) => s.startOffset + s.duration),
    0,
  )

  return {
    totalDuration: Math.max(baselineEnd, candidateEnd, 1),
    baselineStart,
    candidateStart,
  }
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
 * Timeline bar for a single span
 */
function TimelineBar({
  span,
  offsetPercent,
  widthPercent,
  opacity,
  isCandidate,
}: {
  span: Span
  offsetPercent: number
  widthPercent: number
  opacity: number
  isCandidate: boolean
}) {
  const typeConfig = getSpanTypeConfig(span.span_type)

  return (
    <div
      className={clsx(
        'absolute h-3 rounded-sm transition-opacity',
        span.status === 'error' ? 'bg-red-400' : typeConfig.barColor,
        isCandidate ? 'top-0' : 'bottom-0',
      )}
      style={{
        left: `${Math.min(offsetPercent, 99)}%`,
        width: `${Math.max(widthPercent, 0.3)}%`,
        minWidth: '3px',
        opacity,
      }}
      title={`${span.name}: ${formatDuration(span.duration_ms)}`}
    />
  )
}

/**
 * Legend component
 */
function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs">
      <div className="flex items-center gap-2">
        <div className="w-4 h-3 bg-gray-400 rounded-sm opacity-50" />
        <span className="text-gray-600">Baseline (bottom)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-3 bg-gray-600 rounded-sm" />
        <span className="text-gray-600">Candidate (top)</span>
      </div>
      <div className="border-l pl-4 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-purple-500 rounded-sm" />
          <span>LLM</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded-sm" />
          <span>Tool</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-500 rounded-sm" />
          <span>Agent</span>
        </div>
      </div>
    </div>
  )
}

export function TimelineOverlay({
  baseline,
  candidate,
  diff,
}: TimelineOverlayProps) {
  const metrics = calculateMetrics(baseline, candidate)

  const baselineSpans = flattenWithTiming(baseline, metrics.baselineStart)
  const candidateSpans = flattenWithTiming(candidate, metrics.candidateStart)

  // Group spans by depth for layering
  const maxDepth = Math.max(
    ...baselineSpans.map((s) => s.depth),
    ...candidateSpans.map((s) => s.depth),
    0,
  )

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Timeline Overlay
        </h3>
        <div className="text-sm text-gray-500">
          Total: {formatDuration(metrics.totalDuration)}
        </div>
      </div>

      {/* Timeline content */}
      <div className="p-4">
        {/* Time scale */}
        <div className="flex justify-between text-xs text-gray-400 mb-2 px-1">
          <span>0ms</span>
          <span>{formatDuration(metrics.totalDuration / 2)}</span>
          <span>{formatDuration(metrics.totalDuration)}</span>
        </div>

        {/* Timeline rows by depth */}
        <div className="space-y-1">
          {Array.from({ length: maxDepth + 1 }, (_, depth) => {
            const baselineAtDepth = baselineSpans.filter(
              (s) => s.depth === depth,
            )
            const candidateAtDepth = candidateSpans.filter(
              (s) => s.depth === depth,
            )

            if (baselineAtDepth.length === 0 && candidateAtDepth.length === 0) {
              return null
            }

            return (
              <div
                key={depth}
                className="relative h-8 bg-gray-50 rounded"
                style={{ marginLeft: `${depth * 16}px` }}
              >
                {/* Baseline spans (bottom half) */}
                {baselineAtDepth.map(({ span, startOffset, duration }) => {
                  const offsetPercent =
                    (startOffset / metrics.totalDuration) * 100
                  const widthPercent = (duration / metrics.totalDuration) * 100
                  return (
                    <TimelineBar
                      key={`baseline-${span.span_id}`}
                      span={span}
                      offsetPercent={offsetPercent}
                      widthPercent={widthPercent}
                      opacity={0.5}
                      isCandidate={false}
                    />
                  )
                })}

                {/* Candidate spans (top half) */}
                {candidateAtDepth.map(({ span, startOffset, duration }) => {
                  const offsetPercent =
                    (startOffset / metrics.totalDuration) * 100
                  const widthPercent = (duration / metrics.totalDuration) * 100
                  return (
                    <TimelineBar
                      key={`candidate-${span.span_id}`}
                      span={span}
                      offsetPercent={offsetPercent}
                      widthPercent={widthPercent}
                      opacity={1}
                      isCandidate={true}
                    />
                  )
                })}

                {/* Depth label */}
                {depth === 0 && (
                  <div className="absolute -left-4 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                    L{depth}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Duration comparison */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded">
            <span className="text-gray-500">Baseline</span>
            <span className="font-medium">
              {formatDuration(diff.baseline.duration_ms)}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded">
            <span className="text-gray-500">Candidate</span>
            <span className="font-medium">
              {formatDuration(diff.candidate.duration_ms)}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t">
          <TimelineLegend />
        </div>
      </div>
    </div>
  )
}
