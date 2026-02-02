/**
 * Trace Diff Utilities
 *
 * Functions for computing differences between two traces.
 */

import type { Span, TraceWithSpans } from '@/hooks/use-traces'
import type {
  FieldDiff,
  ScoreDiff,
  SpanDiff,
  SpanDiffStatus,
  TraceDiffResult,
  TraceDiffSummary,
} from './types'

/**
 * Fields to compare for span diffs
 */
const COMPARABLE_FIELDS = [
  'name',
  'span_type',
  'duration_ms',
  'status',
  'model',
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'cost_usd',
  'tool_name',
] as const

/**
 * Calculate similarity between two span names
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  if (name1 === name2) return 1

  // Simple Jaccard similarity on words
  const words1 = new Set(name1.toLowerCase().split(/\W+/))
  const words2 = new Set(name2.toLowerCase().split(/\W+/))

  const intersection = new Set([...words1].filter((x) => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Calculate overall match score between two spans
 */
function calculateMatchScore(baseline: Span, candidate: Span): number {
  let score = 0
  let weights = 0

  // Name similarity (weight: 3)
  score += calculateNameSimilarity(baseline.name, candidate.name) * 3
  weights += 3

  // Type match (weight: 2)
  score += baseline.span_type === candidate.span_type ? 2 : 0
  weights += 2

  // Tool name match (weight: 2)
  if (baseline.tool_name || candidate.tool_name) {
    score += baseline.tool_name === candidate.tool_name ? 2 : 0
    weights += 2
  }

  // Model match (weight: 1)
  if (baseline.model || candidate.model) {
    score += baseline.model === candidate.model ? 1 : 0
    weights += 1
  }

  return weights > 0 ? score / weights : 0
}

/**
 * Find the best matching span in a list
 */
function findBestMatch(
  span: Span,
  candidates: Span[],
  usedIndices: Set<number>,
): { index: number; score: number } | null {
  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < candidates.length; i++) {
    if (usedIndices.has(i)) continue

    const score = calculateMatchScore(span, candidates[i])
    if (score > bestScore && score > 0.5) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex >= 0 ? { index: bestIndex, score: bestScore } : null
}

/**
 * Compare field values between two spans
 */
function compareFields(
  baseline: Span | null,
  candidate: Span | null,
): FieldDiff[] {
  const diffs: FieldDiff[] = []

  for (const field of COMPARABLE_FIELDS) {
    const baselineValue = baseline?.[field as keyof Span] as
      | string
      | number
      | null
      | undefined
    const candidateValue = candidate?.[field as keyof Span] as
      | string
      | number
      | null
      | undefined

    // Skip if both are undefined/null
    if (baselineValue == null && candidateValue == null) continue

    const changed = baselineValue !== candidateValue

    diffs.push({
      field,
      baselineValue,
      candidateValue,
      changed,
    })
  }

  return diffs
}

/**
 * Determine span diff status
 */
function getSpanDiffStatus(
  baseline: Span | null,
  candidate: Span | null,
  fieldDiffs: FieldDiff[],
): SpanDiffStatus {
  if (!baseline && candidate) return 'added'
  if (baseline && !candidate) return 'removed'
  if (fieldDiffs.some((d) => d.changed)) return 'modified'
  return 'unchanged'
}

/**
 * Diff two span trees recursively
 */
function diffSpanTrees(
  baselineSpans: Span[],
  candidateSpans: Span[],
): SpanDiff[] {
  const result: SpanDiff[] = []
  const usedCandidateIndices = new Set<number>()

  // Match baseline spans to candidate spans
  for (const baseline of baselineSpans) {
    const match = findBestMatch(baseline, candidateSpans, usedCandidateIndices)

    if (match) {
      usedCandidateIndices.add(match.index)
      const candidate = candidateSpans[match.index]
      const fieldDiffs = compareFields(baseline, candidate)
      const status = getSpanDiffStatus(baseline, candidate, fieldDiffs)

      // Recursively diff children
      const childDiffs = diffSpanTrees(
        baseline.children || [],
        candidate.children || [],
      )

      result.push({
        baseline,
        candidate,
        status,
        fieldDiffs,
        children: childDiffs,
        matchScore: match.score,
      })
    } else {
      // No match found - span was removed
      const fieldDiffs = compareFields(baseline, null)
      const childDiffs = diffSpanTrees(baseline.children || [], [])

      result.push({
        baseline,
        candidate: null,
        status: 'removed',
        fieldDiffs,
        children: childDiffs,
      })
    }
  }

  // Add unmatched candidate spans (new spans)
  for (let i = 0; i < candidateSpans.length; i++) {
    if (!usedCandidateIndices.has(i)) {
      const candidate = candidateSpans[i]
      const fieldDiffs = compareFields(null, candidate)
      const childDiffs = diffSpanTrees([], candidate.children || [])

      result.push({
        baseline: null,
        candidate,
        status: 'added',
        fieldDiffs,
        children: childDiffs,
      })
    }
  }

  return result
}

/**
 * Count spans by diff status
 */
function countByStatus(diffs: SpanDiff[]): {
  added: number
  removed: number
  modified: number
  unchanged: number
} {
  let added = 0
  let removed = 0
  let modified = 0
  let unchanged = 0

  function count(spanDiffs: SpanDiff[]) {
    for (const diff of spanDiffs) {
      switch (diff.status) {
        case 'added':
          added++
          break
        case 'removed':
          removed++
          break
        case 'modified':
          modified++
          break
        case 'unchanged':
          unchanged++
          break
      }
      count(diff.children)
    }
  }

  count(diffs)
  return { added, removed, modified, unchanged }
}

/**
 * Calculate total tokens in spans
 */
function calculateTotalTokens(spans: Span[]): number {
  let total = 0

  function sum(spanList: Span[]) {
    for (const span of spanList) {
      total += span.total_tokens || 0
      if (span.children) sum(span.children)
    }
  }

  sum(spans)
  return total
}

/**
 * Compare scores between two traces
 */
function diffScores(
  baselineScores: TraceWithSpans['scores'],
  candidateScores: TraceWithSpans['scores'],
): ScoreDiff[] {
  const result: ScoreDiff[] = []
  const seenNames = new Set<string>()

  // Compare baseline scores to candidate
  for (const baseline of baselineScores) {
    seenNames.add(baseline.name)
    const candidate = candidateScores.find((s) => s.name === baseline.name)

    if (candidate) {
      const delta = candidate.value - baseline.value
      let status: ScoreDiff['status'] = 'unchanged'
      if (Math.abs(delta) > 0.01) {
        status = delta > 0 ? 'improved' : 'regressed'
      }

      result.push({
        name: baseline.name,
        baselineValue: baseline.value,
        candidateValue: candidate.value,
        delta,
        status,
      })
    } else {
      result.push({
        name: baseline.name,
        baselineValue: baseline.value,
        candidateValue: null,
        delta: -baseline.value,
        status: 'removed',
      })
    }
  }

  // Find new scores in candidate
  for (const candidate of candidateScores) {
    if (!seenNames.has(candidate.name)) {
      result.push({
        name: candidate.name,
        baselineValue: null,
        candidateValue: candidate.value,
        delta: candidate.value,
        status: 'added',
      })
    }
  }

  // Sort by absolute delta (biggest changes first)
  result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return result
}

/**
 * Compare two traces and return diff result
 */
export function diffTraces(
  baseline: TraceWithSpans,
  candidate: TraceWithSpans,
): TraceDiffResult {
  // Diff the span trees
  const spanDiffs = diffSpanTrees(baseline.spans, candidate.spans)

  // Count changes
  const counts = countByStatus(spanDiffs)

  // Calculate token delta
  const baselineTokens = calculateTotalTokens(baseline.spans)
  const candidateTokens = calculateTotalTokens(candidate.spans)

  // Compare scores
  const scoreDiffs = diffScores(baseline.scores || [], candidate.scores || [])

  const summary: TraceDiffSummary = {
    ...counts,
    durationDelta: candidate.trace.duration_ms - baseline.trace.duration_ms,
    tokenDelta: candidateTokens - baselineTokens,
    scoreDiffs,
  }

  return {
    baseline: {
      traceId: baseline.trace.trace_id,
      name: baseline.trace.name,
      timestamp: baseline.trace.timestamp,
      duration_ms: baseline.trace.duration_ms,
      status: baseline.trace.status,
    },
    candidate: {
      traceId: candidate.trace.trace_id,
      name: candidate.trace.name,
      timestamp: candidate.trace.timestamp,
      duration_ms: candidate.trace.duration_ms,
      status: candidate.trace.status,
    },
    summary,
    spanDiffs,
  }
}

/**
 * Flatten span diffs to a list with depth info
 */
export function flattenSpanDiffs(
  diffs: SpanDiff[],
  depth = 0,
): Array<SpanDiff & { depth: number }> {
  const result: Array<SpanDiff & { depth: number }> = []

  for (const diff of diffs) {
    result.push({ ...diff, depth })
    result.push(...flattenSpanDiffs(diff.children, depth + 1))
  }

  return result
}

/**
 * Filter span diffs by status
 */
export function filterSpanDiffs(
  diffs: SpanDiff[],
  statuses: SpanDiffStatus[],
): SpanDiff[] {
  const result: SpanDiff[] = []

  for (const diff of diffs) {
    const filteredChildren = filterSpanDiffs(diff.children, statuses)

    if (statuses.includes(diff.status) || filteredChildren.length > 0) {
      result.push({
        ...diff,
        children: filteredChildren,
      })
    }
  }

  return result
}
