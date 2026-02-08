/**
 * Integration Test: Scores API
 *
 * Tests POST/GET /api/scores endpoints with mocked ClickHouse.
 * Verifies score creation, batch insertion, and trace score queries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'

// =============================================================================
// Mocks
// =============================================================================

const mockBatchInsertScores = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/clickhouse-batch', () => ({
  batchInsertScores: (...args: unknown[]) => mockBatchInsertScores(...args),
}))

const mockGetTraceScores = vi.fn()

vi.mock('@/lib/db/clickhouse', () => ({
  traces: {
    getTraceScores: (...args: unknown[]) =>
      mockGetTraceScores(...args).then((data: unknown) => ({ data })),
  },
}))

vi.mock('@/lib/clickhouse', () => ({
  getScoresForTrace: (...args: unknown[]) => mockGetTraceScores(...args),
}))

vi.mock('@/lib/middleware/rate-limit', () => ({
  withRateLimit: vi.fn(
    (handler: (...args: unknown[]) => Promise<NextResponse>) => handler,
  ),
}))

vi.mock('@/lib/rate-limit', () => ({
  READ_LIMIT: { windowMs: 60000, maxRequests: 100 },
  WRITE_LIMIT: { windowMs: 60000, maxRequests: 50 },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    query: { apiKeys: { findFirst: vi.fn() } },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ catch: vi.fn() })) })),
    })),
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
  options: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
  } = {},
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
  return await import('@/app/api/scores/route')
}

// =============================================================================
// Tests
// =============================================================================

describe('Scores API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // POST /api/scores
  // ---------------------------------------------------------------------------

  describe('POST /api/scores', () => {
    it('creates a score and inserts via batch buffer', async () => {
      const { POST } = await getScoresHandlers()
      const res = await POST(
        createMockRequest('/api/scores', {
          method: 'POST',
          headers: { 'x-project-id': 'proj-001' },
          body: {
            trace_id: 'trace-001',
            name: 'accuracy',
            value: 0.95,
            score_type: 'numeric',
            source: 'eval',
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.message).toBe('Score created successfully')
      expect(body.score_id).toBeDefined()
      expect(mockBatchInsertScores).toHaveBeenCalledTimes(1)

      // Verify the score record passed to batch insert
      const insertedScores = mockBatchInsertScores.mock.calls[0][0]
      expect(insertedScores).toHaveLength(1)
      expect(insertedScores[0].project_id).toBe('proj-001')
      expect(insertedScores[0].trace_id).toBe('trace-001')
      expect(insertedScores[0].name).toBe('accuracy')
      expect(insertedScores[0].value).toBe(0.95)
    })

    it('generates a score_id when not provided', async () => {
      const { POST } = await getScoresHandlers()
      const res = await POST(
        createMockRequest('/api/scores', {
          method: 'POST',
          body: {
            trace_id: 'trace-002',
            name: 'relevance',
            value: 0.8,
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.score_id).toBeDefined()
      expect(body.score_id).toMatch(/^[0-9a-f-]+$/) // UUID format
    })

    it('uses provided score_id', async () => {
      const { POST } = await getScoresHandlers()
      const res = await POST(
        createMockRequest('/api/scores', {
          method: 'POST',
          body: {
            trace_id: 'trace-003',
            score_id: 'custom-score-id',
            name: 'safety',
            value: 1.0,
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.score_id).toBe('custom-score-id')
    })

    it('defaults project_id to fallback when not in header', async () => {
      const { POST } = await getScoresHandlers()
      await POST(
        createMockRequest('/api/scores', {
          method: 'POST',
          body: {
            trace_id: 'trace-004',
            name: 'test',
            value: 0.5,
          },
        }),
      )

      const insertedScores = mockBatchInsertScores.mock.calls[0][0]
      // Should use default project ID
      expect(insertedScores[0].project_id).toBeDefined()
    })

    it('handles batch insert failures gracefully', async () => {
      mockBatchInsertScores.mockRejectedValue(new Error('ClickHouse unavailable'))

      const { POST } = await getScoresHandlers()
      const res = await POST(
        createMockRequest('/api/scores', {
          method: 'POST',
          body: {
            trace_id: 'trace-005',
            name: 'test',
            value: 0.5,
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.error).toBe('Failed to create score')
    })
  })

  // ---------------------------------------------------------------------------
  // GET /api/scores
  // ---------------------------------------------------------------------------

  describe('GET /api/scores', () => {
    it('returns scores for a trace', async () => {
      mockGetTraceScores.mockResolvedValue([
        {
          score_id: 'score-1',
          name: 'accuracy',
          value: 0.95,
          trace_id: 'trace-001',
        },
        {
          score_id: 'score-2',
          name: 'safety',
          value: 1.0,
          trace_id: 'trace-001',
        },
      ])

      const { GET } = await getScoresHandlers()
      const res = await GET(
        createMockRequest('/api/scores?trace_id=trace-001', {
          headers: { 'x-project-id': 'proj-001' },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.items).toHaveLength(2)
      expect(body.count).toBe(2)
    })

    it('returns 400 when trace_id is missing', async () => {
      const { GET } = await getScoresHandlers()
      const res = await GET(createMockRequest('/api/scores'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('trace_id is required')
    })

    it('handles ClickHouse errors gracefully', async () => {
      mockGetTraceScores.mockRejectedValue(new Error('Connection refused'))

      const { GET } = await getScoresHandlers()
      const res = await GET(
        createMockRequest('/api/scores?trace_id=trace-001'),
      )
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.error).toBe('Failed to fetch scores')
    })
  })

  // ---------------------------------------------------------------------------
  // Full Flow: Create Score -> Query Score
  // ---------------------------------------------------------------------------

  describe('Full flow', () => {
    it('creates a score and retrieves it', async () => {
      mockBatchInsertScores.mockResolvedValue(undefined)
      const { POST, GET } = await getScoresHandlers()

      // Create a score
      const createRes = await POST(
        createMockRequest('/api/scores', {
          method: 'POST',
          headers: { 'x-project-id': 'proj-flow' },
          body: {
            trace_id: 'trace-flow',
            name: 'completeness',
            value: 0.88,
            score_type: 'numeric',
            source: 'eval',
          },
        }),
      )
      const created = await createRes.json()
      expect(createRes.status).toBe(200)

      // Mock the query to return the score we just created
      mockGetTraceScores.mockResolvedValue([
        {
          score_id: created.score_id,
          name: 'completeness',
          value: 0.88,
          trace_id: 'trace-flow',
        },
      ])

      // Query scores for the trace
      const getRes = await GET(
        createMockRequest('/api/scores?trace_id=trace-flow', {
          headers: { 'x-project-id': 'proj-flow' },
        }),
      )
      const queried = await getRes.json()

      expect(getRes.status).toBe(200)
      expect(queried.items).toHaveLength(1)
      expect(queried.items[0].name).toBe('completeness')
      expect(queried.items[0].value).toBe(0.88)
    })
  })
})
