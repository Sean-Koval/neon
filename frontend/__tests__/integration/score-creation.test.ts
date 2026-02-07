/**
 * Integration Test: Score Creation
 *
 * Tests the scoring API:
 * Create scores -> Query scores for trace -> Batch score creation
 *
 * Mocks ClickHouse batch buffer to test without infrastructure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'

// =============================================================================
// Mocks
// =============================================================================

const mockBatchInsertScores = vi.fn().mockResolvedValue(undefined)
const mockGetScoresForTrace = vi.fn()

vi.mock('@/lib/clickhouse-batch', () => ({
  batchInsertScores: (...args: unknown[]) => mockBatchInsertScores(...args),
}))

vi.mock('@/lib/clickhouse', () => ({
  getScoresForTrace: (...args: unknown[]) => mockGetScoresForTrace(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    query: { apiKeys: { findFirst: vi.fn() } },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ catch: vi.fn() })) })) })),
  },
  apiKeys: {},
}))

vi.mock('@/lib/db/permissions', () => ({
  hasWorkspacePermission: vi.fn(),
}))

// =============================================================================
// Helpers
// =============================================================================

function createMockRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): NextRequest {
  const { method = 'GET', headers = {}, body } = options
  const requestHeaders = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value)
  }
  return {
    method,
    headers: requestHeaders,
    nextUrl: new URL(url, 'http://localhost:3000'),
    url: new URL(url, 'http://localhost:3000').toString(),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest
}

async function getScoresHandlers() {
  const mod = await import('@/app/api/scores/route')
  return { POST: mod.POST, GET: mod.GET }
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  mockBatchInsertScores.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Score Creation Integration', () => {
  describe('Create Score', () => {
    it('creates a score with all required fields', async () => {
      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        headers: { 'x-project-id': 'project-001' },
        body: {
          trace_id: 'trace-001',
          name: 'accuracy',
          value: 0.95,
          score_type: 'numeric',
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.message).toContain('created')
      expect(body.score_id).toBeDefined()
    })

    it('passes score to batch insert with correct shape', async () => {
      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        headers: { 'x-project-id': 'project-001' },
        body: {
          trace_id: 'trace-001',
          name: 'tool_selection',
          value: 0.8,
          score_type: 'numeric',
          comment: 'Good tool usage',
          source: 'evaluator',
        },
      })

      await POST(req)

      expect(mockBatchInsertScores).toHaveBeenCalledTimes(1)
      const insertedScores = mockBatchInsertScores.mock.calls[0][0]
      expect(insertedScores).toHaveLength(1)
      expect(insertedScores[0]).toMatchObject({
        project_id: 'project-001',
        trace_id: 'trace-001',
        name: 'tool_selection',
        value: 0.8,
        score_type: 'numeric',
        comment: 'Good tool usage',
        source: 'evaluator',
      })
    })

    it('generates a score_id if not provided', async () => {
      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          trace_id: 'trace-001',
          name: 'accuracy',
          value: 0.9,
        },
      })

      await POST(req)

      const insertedScores = mockBatchInsertScores.mock.calls[0][0]
      expect(insertedScores[0].score_id).toBeDefined()
      expect(insertedScores[0].score_id).not.toBe('')
    })

    it('uses provided score_id if given', async () => {
      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          score_id: 'custom-score-id-001',
          trace_id: 'trace-001',
          name: 'accuracy',
          value: 0.9,
        },
      })

      await POST(req)

      const insertedScores = mockBatchInsertScores.mock.calls[0][0]
      expect(insertedScores[0].score_id).toBe('custom-score-id-001')
    })

    it('sets optional fields to defaults when not provided', async () => {
      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          trace_id: 'trace-001',
          name: 'accuracy',
          value: 0.9,
        },
      })

      await POST(req)

      const score = mockBatchInsertScores.mock.calls[0][0][0]
      expect(score.span_id).toBeNull()
      expect(score.run_id).toBeNull()
      expect(score.case_id).toBeNull()
      expect(score.score_type).toBe('numeric')
      expect(score.source).toBe('api')
      expect(score.comment).toBe('')
    })

    it('associates score with run and case when provided', async () => {
      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          trace_id: 'trace-001',
          span_id: 'span-001',
          run_id: 'run-001',
          case_id: 'case-001',
          name: 'tool_selection',
          value: 1.0,
        },
      })

      await POST(req)

      const score = mockBatchInsertScores.mock.calls[0][0][0]
      expect(score.span_id).toBe('span-001')
      expect(score.run_id).toBe('run-001')
      expect(score.case_id).toBe('case-001')
    })

    it('sets timestamp on score creation', async () => {
      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          trace_id: 'trace-001',
          name: 'accuracy',
          value: 0.9,
        },
      })

      await POST(req)

      const score = mockBatchInsertScores.mock.calls[0][0][0]
      expect(score.timestamp).toBeDefined()
      // Timestamp should be a valid ISO string
      expect(new Date(score.timestamp).getTime()).not.toBeNaN()
    })
  })

  describe('Query Scores', () => {
    it('returns scores for a trace', async () => {
      mockGetScoresForTrace.mockResolvedValue([
        { score_id: 'score-1', name: 'accuracy', value: 0.95, trace_id: 'trace-001' },
        { score_id: 'score-2', name: 'tool_selection', value: 0.8, trace_id: 'trace-001' },
      ])

      const { GET } = await getScoresHandlers()
      const req = createMockRequest('/api/scores?trace_id=trace-001', {
        headers: { 'x-project-id': 'project-001' },
      })

      const res = await GET(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.items).toHaveLength(2)
      expect(body.count).toBe(2)
      expect(body.items[0].name).toBe('accuracy')
      expect(body.items[1].name).toBe('tool_selection')
    })

    it('requires trace_id parameter', async () => {
      const { GET } = await getScoresHandlers()
      const req = createMockRequest('/api/scores')
      const res = await GET(req)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('trace_id')
    })

    it('returns empty array when no scores exist', async () => {
      mockGetScoresForTrace.mockResolvedValue([])

      const { GET } = await getScoresHandlers()
      const req = createMockRequest('/api/scores?trace_id=trace-no-scores', {
        headers: { 'x-project-id': 'project-001' },
      })

      const res = await GET(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.items).toHaveLength(0)
      expect(body.count).toBe(0)
    })
  })

  describe('Batch Score Creation', () => {
    it('creates multiple scores sequentially', async () => {
      const { POST } = await getScoresHandlers()

      const scores = [
        { trace_id: 'trace-001', name: 'accuracy', value: 0.95 },
        { trace_id: 'trace-001', name: 'tool_selection', value: 0.8 },
        { trace_id: 'trace-001', name: 'reasoning', value: 0.9 },
      ]

      for (const score of scores) {
        const req = createMockRequest('/api/scores', {
          method: 'POST',
          headers: { 'x-project-id': 'project-001' },
          body: score,
        })
        const res = await POST(req)
        expect(res.status).toBe(200)
      }

      // Each score is batch-inserted individually
      expect(mockBatchInsertScores).toHaveBeenCalledTimes(3)
    })

    it('different score types can be mixed', async () => {
      const { POST } = await getScoresHandlers()

      // Numeric score
      const numReq = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          trace_id: 'trace-001',
          name: 'accuracy',
          value: 0.95,
          score_type: 'numeric',
        },
      })
      await POST(numReq)

      // String/categorical score
      const strReq = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          trace_id: 'trace-001',
          name: 'quality',
          value: 1,
          score_type: 'categorical',
          string_value: 'excellent',
        },
      })
      await POST(strReq)

      expect(mockBatchInsertScores).toHaveBeenCalledTimes(2)
      const numericScore = mockBatchInsertScores.mock.calls[0][0][0]
      const categoricalScore = mockBatchInsertScores.mock.calls[1][0][0]
      expect(numericScore.score_type).toBe('numeric')
      expect(categoricalScore.score_type).toBe('categorical')
      expect(categoricalScore.string_value).toBe('excellent')
    })
  })

  describe('Full Score Flow', () => {
    it('create scores -> query -> verify all present', async () => {
      const { POST, GET } = await getScoresHandlers()

      // Step 1: Create multiple scores for a trace
      const scoreData = [
        { trace_id: 'trace-flow', name: 'accuracy', value: 0.95, source: 'evaluator' },
        { trace_id: 'trace-flow', name: 'tool_selection', value: 0.8, source: 'evaluator' },
        { trace_id: 'trace-flow', name: 'reasoning', value: 0.85, source: 'evaluator' },
      ]

      const scoreIds: string[] = []
      for (const data of scoreData) {
        const req = createMockRequest('/api/scores', {
          method: 'POST',
          headers: { 'x-project-id': 'project-001' },
          body: data,
        })
        const res = await POST(req)
        const body = await res.json()
        scoreIds.push(body.score_id)
      }

      expect(scoreIds).toHaveLength(3)
      // Each score should have a unique ID
      const uniqueIds = new Set(scoreIds)
      expect(uniqueIds.size).toBe(3)

      // Step 2: Query scores (mock the ClickHouse return)
      mockGetScoresForTrace.mockResolvedValue(
        scoreData.map((s, i) => ({
          score_id: scoreIds[i],
          ...s,
        })),
      )

      const getReq = createMockRequest('/api/scores?trace_id=trace-flow', {
        headers: { 'x-project-id': 'project-001' },
      })
      const getRes = await GET(getReq)
      expect(getRes.status).toBe(200)

      const result = await getRes.json()
      expect(result.items).toHaveLength(3)
      expect(result.count).toBe(3)

      // Verify all score names are present
      const names = result.items.map((s: { name: string }) => s.name)
      expect(names).toContain('accuracy')
      expect(names).toContain('tool_selection')
      expect(names).toContain('reasoning')
    })
  })

  describe('Error Handling', () => {
    it('returns 500 when batch insert fails', async () => {
      mockBatchInsertScores.mockRejectedValue(new Error('ClickHouse connection refused'))

      const { POST } = await getScoresHandlers()
      const req = createMockRequest('/api/scores', {
        method: 'POST',
        body: {
          trace_id: 'trace-001',
          name: 'accuracy',
          value: 0.9,
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toContain('Failed to create score')
    })

    it('returns 500 when score query fails', async () => {
      mockGetScoresForTrace.mockRejectedValue(new Error('Query timeout'))

      const { GET } = await getScoresHandlers()
      const req = createMockRequest('/api/scores?trace_id=trace-001')
      const res = await GET(req)

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toContain('Failed to fetch scores')
    })
  })
})
