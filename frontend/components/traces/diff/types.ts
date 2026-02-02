/**
 * Types for Trace Diff UI
 *
 * Defines the data structures for comparing two traces.
 */

import type { Span } from '@/hooks/use-traces'

/**
 * Diff status for a span
 */
export type SpanDiffStatus = 'added' | 'removed' | 'modified' | 'unchanged'

/**
 * Field-level diff for a span
 */
export interface FieldDiff {
  field: string
  baselineValue: string | number | null | undefined
  candidateValue: string | number | null | undefined
  changed: boolean
}

/**
 * Span with diff information
 */
export interface SpanDiff {
  /** Baseline span (null if added) */
  baseline: Span | null
  /** Candidate span (null if removed) */
  candidate: Span | null
  /** Diff status */
  status: SpanDiffStatus
  /** Field-level differences */
  fieldDiffs: FieldDiff[]
  /** Children span diffs */
  children: SpanDiff[]
  /** Match score (0-1) for modified spans */
  matchScore?: number
}

/**
 * Score comparison between traces
 */
export interface ScoreDiff {
  name: string
  baselineValue: number | null
  candidateValue: number | null
  delta: number
  status: 'improved' | 'regressed' | 'unchanged' | 'added' | 'removed'
}

/**
 * Summary of trace comparison
 */
export interface TraceDiffSummary {
  /** Number of spans added in candidate */
  added: number
  /** Number of spans removed from baseline */
  removed: number
  /** Number of spans modified */
  modified: number
  /** Number of unchanged spans */
  unchanged: number
  /** Total duration difference in ms */
  durationDelta: number
  /** Total token difference */
  tokenDelta: number
  /** Score changes */
  scoreDiffs: ScoreDiff[]
}

/**
 * Full trace diff result
 */
export interface TraceDiffResult {
  /** Baseline trace info */
  baseline: {
    traceId: string
    name: string
    timestamp: string
    duration_ms: number
    status: string
  }
  /** Candidate trace info */
  candidate: {
    traceId: string
    name: string
    timestamp: string
    duration_ms: number
    status: string
  }
  /** Summary statistics */
  summary: TraceDiffSummary
  /** Hierarchical span diffs */
  spanDiffs: SpanDiff[]
}
