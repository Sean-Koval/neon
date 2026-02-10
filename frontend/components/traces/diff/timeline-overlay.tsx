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
      const duration = Number(span.duration_ms) || 0
      result.push({
        span,
        startOffset: startTime - baseTime,
        duration,
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
  const baselineRaw = flattenWithTiming(baseline, 0)
  const candidateRaw = flattenWithTiming(candidate, 0)
  const allRaw = [...baselineRaw, ...candidateRaw]
  if (allRaw.length === 0)
    return { totalDuration: 1000, baselineStart: 0, candidateStart: 0 }

  const baselineStart =
    baselineRaw.length > 0
      ? Math.min(...baselineRaw.map((s) => new Date(s.span.timestamp).getTime()))
      : 0
  const candidateStart =
    candidateRaw.length > 0
      ? Math.min(...candidateRaw.map((s) => new Date(s.span.timestamp).getTime()))
      : 0

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

function formatSignedDuration(ms: number): string {
  if (Math.abs(ms) < 1) return '0ms'
  const abs = formatDuration(Math.abs(ms))
  return `${ms > 0 ? '+' : '-'}${abs}`
}

function sumDuration(spans: Array<{ duration: number }>) {
  return spans.reduce((total, s) => total + s.duration, 0)
}

/**
 * Timeline bar for a single span
 */
function TimelineBar({
  span,
  offsetPercent,
  widthPercent,
  lane,
}: {
  span: Span
  offsetPercent: number
  widthPercent: number
  lane: 'baseline' | 'candidate'
}) {
  const typeConfig = getSpanTypeConfig(span.span_type)
  const isCandidate = lane === 'candidate'
  const duration = Number(span.duration_ms) || 0

  return (
    <div
      className={clsx(
        'absolute h-3 rounded-sm transition-opacity ring-1 ring-black/5 dark:ring-white/10',
        span.status === 'error' ? 'bg-rose-500' : typeConfig.barColor,
        isCandidate ? 'top-1.5' : 'bottom-1.5',
      )}
      style={{
        left: `${Math.min(offsetPercent, 99)}%`,
        width: `${Math.max(widthPercent, 0.3)}%`,
        minWidth: '3px',
        opacity: isCandidate ? 1 : 0.72,
      }}
      title={`${span.name}: ${formatDuration(duration)}`}
    />
  )
}

/**
 * Legend component
 */
function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-content-secondary">
      <div className="flex items-center gap-2">
        <div className="w-4 h-3 bg-violet-500/70 rounded-sm" />
        <span>Baseline lane</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-3 bg-emerald-500/80 rounded-sm" />
        <span>Candidate lane</span>
      </div>
      <div className="border-l border-border dark:border-slate-700/80 pl-4 flex items-center gap-3">
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

  const durationDelta = diff.candidate.duration_ms - diff.baseline.duration_ms
  const deltaTone =
    durationDelta > 100
      ? 'text-rose-600 dark:text-rose-400'
      : durationDelta < -100
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-content-secondary'

  return (
    <div className="bg-surface-card rounded-xl border border-border overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border dark:border-slate-700/80 bg-surface-raised/70 dark:bg-slate-900/85 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-content-primary">
            Timeline Overlay
          </h3>
          <p className="text-xs text-content-secondary">
            Shared time axis by depth. Top lane is candidate, bottom lane is baseline.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md border border-border dark:border-slate-700/80 bg-surface-card px-2 py-1 text-content-secondary">
            Baseline {formatDuration(diff.baseline.duration_ms)}
          </span>
          <span className="rounded-md border border-border dark:border-slate-700/80 bg-surface-card px-2 py-1 text-content-secondary">
            Candidate {formatDuration(diff.candidate.duration_ms)}
          </span>
          <span className={clsx('rounded-md border border-border dark:border-slate-700/80 bg-surface-card px-2 py-1 font-medium', deltaTone)}>
            {formatSignedDuration(durationDelta)}
          </span>
        </div>
      </div>

      {/* Timeline content */}
      <div className="p-4">
        {/* Time scale */}
        <div className="flex justify-between text-xs text-gray-400 dark:text-slate-400 mb-2 px-1">
          <span>0ms</span>
          <span>{formatDuration(metrics.totalDuration / 4)}</span>
          <span>{formatDuration(metrics.totalDuration / 2)}</span>
          <span>{formatDuration((metrics.totalDuration * 3) / 4)}</span>
          <span>{formatDuration(metrics.totalDuration)}</span>
        </div>

        {/* Timeline rows by depth */}
        <div className="space-y-2">
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

            const baselineAtDepthTotal = sumDuration(baselineAtDepth)
            const candidateAtDepthTotal = sumDuration(candidateAtDepth)
            const laneDelta = candidateAtDepthTotal - baselineAtDepthTotal

            return (
              <div key={depth} className="grid grid-cols-[72px_minmax(0,1fr)_96px] items-center gap-2">
                <div className="text-[11px] font-medium text-content-secondary">
                  Depth L{depth}
                </div>
                <div
                  className="relative h-10 rounded-md border border-border dark:border-slate-700/80 bg-surface-raised/70 dark:bg-slate-900/70"
                  style={{ marginLeft: `${depth * 10}px` }}
                >
                  {/* Vertical guide lines */}
                  <div className="absolute inset-y-0 left-1/4 w-px bg-border/80 dark:bg-slate-700/70" />
                  <div className="absolute inset-y-0 left-2/4 w-px bg-border/80 dark:bg-slate-700/70" />
                  <div className="absolute inset-y-0 left-3/4 w-px bg-border/80 dark:bg-slate-700/70" />
                  {/* Lane separator */}
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-border/70 dark:bg-slate-700/70" />

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
                        lane="baseline"
                      />
                    )
                  })}

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
                        lane="candidate"
                      />
                    )
                  })}
                </div>
                <div className="text-right text-[11px]">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-md px-2 py-0.5 border border-border dark:border-slate-700/80 bg-surface-card',
                      laneDelta > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : laneDelta < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-content-secondary',
                    )}
                  >
                    {formatSignedDuration(laneDelta)}
                  </span>
                </div>
                {depth === 0 && (
                  <div className="col-span-3 -mt-1 text-[10px] text-content-muted">
                    candidate (top) vs baseline (bottom)
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Duration comparison */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center justify-between px-3 py-2 bg-surface-raised/70 rounded">
            <span className="text-gray-500 dark:text-gray-400">Baseline</span>
            <span className="font-medium">
              {formatDuration(diff.baseline.duration_ms)}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-surface-raised/70 rounded">
            <span className="text-gray-500 dark:text-gray-400">Candidate</span>
            <span className="font-medium">
              {formatDuration(diff.candidate.duration_ms)}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-border">
          <TimelineLegend />
        </div>
      </div>
    </div>
  )
}
