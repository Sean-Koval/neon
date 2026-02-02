import { describe, expect, it } from 'vitest'
import type { Span, TraceWithSpans } from '@/hooks/use-traces'
import { diffTraces, filterSpanDiffs, flattenSpanDiffs } from '../utils'

// Mock span factory
function createSpan(overrides: Partial<Span> = {}): Span {
  return {
    span_id: `span-${Math.random().toString(36).slice(2)}`,
    trace_id: 'trace-1',
    parent_span_id: null,
    name: 'Test Span',
    span_type: 'span',
    timestamp: new Date().toISOString(),
    end_time: null,
    duration_ms: 100,
    status: 'ok',
    children: [],
    ...overrides,
  }
}

// Mock trace factory
function createTrace(
  spans: Span[],
  overrides: Partial<TraceWithSpans['trace']> = {},
): TraceWithSpans {
  return {
    trace: {
      trace_id: 'trace-1',
      name: 'Test Trace',
      timestamp: new Date().toISOString(),
      end_time: null,
      duration_ms: 500,
      status: 'ok',
      metadata: {},
      ...overrides,
    },
    spans,
    scores: [],
  }
}

describe('diffTraces', () => {
  it('identifies unchanged spans', () => {
    const span = createSpan({ name: 'Same Span', span_type: 'tool' })
    const baseline = createTrace([span])
    const candidate = createTrace([
      { ...span, span_id: 'different-id' }, // Different ID but same content
    ])

    const result = diffTraces(baseline, candidate)

    expect(result.summary.unchanged).toBe(1)
    expect(result.summary.added).toBe(0)
    expect(result.summary.removed).toBe(0)
  })

  it('identifies added spans', () => {
    const baseline = createTrace([])
    const candidate = createTrace([createSpan({ name: 'New Span' })])

    const result = diffTraces(baseline, candidate)

    expect(result.summary.added).toBe(1)
    expect(result.spanDiffs[0].status).toBe('added')
    expect(result.spanDiffs[0].candidate?.name).toBe('New Span')
  })

  it('identifies removed spans', () => {
    const baseline = createTrace([createSpan({ name: 'Removed Span' })])
    const candidate = createTrace([])

    const result = diffTraces(baseline, candidate)

    expect(result.summary.removed).toBe(1)
    expect(result.spanDiffs[0].status).toBe('removed')
    expect(result.spanDiffs[0].baseline?.name).toBe('Removed Span')
  })

  it('identifies modified spans', () => {
    const baseline = createTrace([
      createSpan({ span_id: 's1', name: 'Span A', duration_ms: 100 }),
    ])
    const candidate = createTrace([
      createSpan({ span_id: 's1', name: 'Span A', duration_ms: 200 }),
    ])

    const result = diffTraces(baseline, candidate)

    expect(result.summary.modified).toBe(1)
    expect(result.spanDiffs[0].status).toBe('modified')
    expect(
      result.spanDiffs[0].fieldDiffs.find((f) => f.field === 'duration_ms')
        ?.changed,
    ).toBe(true)
  })

  it('calculates duration delta', () => {
    const baseline = createTrace([], { duration_ms: 100 })
    const candidate = createTrace([], { duration_ms: 150 })

    const result = diffTraces(baseline, candidate)

    expect(result.summary.durationDelta).toBe(50)
  })

  it('compares scores', () => {
    const baseline = createTrace([])
    baseline.scores = [
      { score_id: '1', name: 'accuracy', value: 0.8, source: 'test' },
    ]

    const candidate = createTrace([])
    candidate.scores = [
      { score_id: '2', name: 'accuracy', value: 0.9, source: 'test' },
    ]

    const result = diffTraces(baseline, candidate)

    expect(result.summary.scoreDiffs).toHaveLength(1)
    expect(result.summary.scoreDiffs[0].name).toBe('accuracy')
    expect(result.summary.scoreDiffs[0].delta).toBeCloseTo(0.1)
    expect(result.summary.scoreDiffs[0].status).toBe('improved')
  })
})

describe('flattenSpanDiffs', () => {
  it('flattens nested span diffs with depth', () => {
    const baseline = createTrace([
      createSpan({
        name: 'Parent',
        children: [createSpan({ name: 'Child' })],
      }),
    ])
    const candidate = createTrace([
      createSpan({
        name: 'Parent',
        children: [createSpan({ name: 'Child' })],
      }),
    ])

    const result = diffTraces(baseline, candidate)
    const flattened = flattenSpanDiffs(result.spanDiffs)

    expect(flattened).toHaveLength(2)
    expect(flattened[0].depth).toBe(0)
    expect(flattened[1].depth).toBe(1)
  })
})

describe('filterSpanDiffs', () => {
  it('filters by status', () => {
    const baseline = createTrace([
      createSpan({ name: 'Removed' }),
      createSpan({ name: 'Same', span_type: 'tool' }),
    ])
    const candidate = createTrace([
      createSpan({ name: 'Added' }),
      createSpan({ name: 'Same', span_type: 'tool' }),
    ])

    const result = diffTraces(baseline, candidate)
    const filtered = filterSpanDiffs(result.spanDiffs, ['added'])

    expect(filtered.length).toBe(1)
    expect(filtered[0].status).toBe('added')
  })
})
