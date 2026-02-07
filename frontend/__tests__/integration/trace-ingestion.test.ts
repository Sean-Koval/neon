/**
 * Integration Test: Trace Ingestion
 *
 * Tests the trace API end-to-end:
 * Ingest OTLP traces -> Query traces -> Get trace detail with spans
 *
 * Mocks ClickHouse to test route handlers without infrastructure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USER = {
  id: 'user-trace-0000-0000-0000-000000000001',
  email: 'trace@example.com',
  name: 'Trace User',
}

const TEST_WORKSPACE_ID = 'ws-trace-0000-0000-0000-000000000001'

const AUTH_RESULT: AuthResult = {
  user: TEST_USER,
  workspaceId: TEST_WORKSPACE_ID,
}

// =============================================================================
// Mocks
// =============================================================================

const mockAuthenticate = vi.fn<() => Promise<AuthResult | null>>()

vi.mock('@/lib/middleware/auth', () => ({
  authenticate: (...args: unknown[]) => mockAuthenticate(...(args as [])),
  withAuth: vi.fn(
    (handler: (req: NextRequest, auth: AuthResult, ...args: unknown[]) => Promise<NextResponse>, options?: { optional?: boolean }) => {
      return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
        const auth = await mockAuthenticate()
        if (!options?.optional && !auth) {
          return NextResponse.json(
            { error: 'Unauthorized', message: 'Valid authentication required', hint: 'Provide a valid Bearer token or X-API-Key header' },
            { status: 401 },
          )
        }
        return handler(request, auth as AuthResult, ...args)
      }
    },
  ),
}))

const mockQueryTraces = vi.fn()
const mockGetTraceWithSpans = vi.fn()
const mockGetTraceWithSpanSummaries = vi.fn()
const mockGetScoresForTrace = vi.fn()
const mockInsertTraces = vi.fn()
const mockInsertSpans = vi.fn()

vi.mock('@/lib/clickhouse', () => ({
  queryTraces: (...args: unknown[]) => mockQueryTraces(...args),
  getTraceWithSpans: (...args: unknown[]) => mockGetTraceWithSpans(...args),
  getTraceWithSpanSummaries: (...args: unknown[]) => mockGetTraceWithSpanSummaries(...args),
  getScoresForTrace: (...args: unknown[]) => mockGetScoresForTrace(...args),
  insertTraces: (...args: unknown[]) => mockInsertTraces(...args),
  insertSpans: (...args: unknown[]) => mockInsertSpans(...args),
}))

vi.mock('@/lib/db/clickhouse', () => ({
  traces: {
    listTraces: (...args: unknown[]) => mockQueryTraces(...args).then((data: unknown) => ({ data })),
    getTrace: (...args: unknown[]) => mockGetTraceWithSpans(...args).then((data: unknown) => ({ data })),
    getTraceSummary: (...args: unknown[]) => mockGetTraceWithSpanSummaries(...args).then((data: unknown) => ({ data })),
    getTraceScores: (...args: unknown[]) => mockGetScoresForTrace(...args).then((data: unknown) => ({ data })),
  },
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

/** Standard OTLP payload with multiple spans in one trace */
function makeOTLPPayload(traceId = 'abc123def456', spanCount = 2) {
  const spans = Array.from({ length: spanCount }, (_, i) => ({
    traceId,
    spanId: `span-${i + 1}`,
    parentSpanId: i === 0 ? undefined : 'span-1',
    name: i === 0 ? 'root-operation' : `child-operation-${i}`,
    kind: i === 0 ? 1 : 0,
    startTimeUnixNano: `${1000000000000000 + i * 100000000}`,
    endTimeUnixNano: `${1000000000000000 + (i + 1) * 100000000}`,
    attributes: i === 0
      ? [{ key: 'gen_ai.request.model', value: { stringValue: 'gpt-4' } }]
      : [{ key: 'tool.name', value: { stringValue: 'search' } }],
    status: { code: 1 },
  }))

  return {
    resourceSpans: [{
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: 'test-agent' } }],
      },
      scopeSpans: [{
        scope: { name: 'test-scope', version: '1.0' },
        spans,
      }],
    }],
  }
}

async function getV1TracesHandlers() {
  const mod = await import('@/app/api/v1/traces/route')
  return { POST: mod.POST }
}

async function getTracesHandlers() {
  const mod = await import('@/app/api/traces/route')
  return { GET: mod.GET }
}

async function getTraceDetailHandlers() {
  const mod = await import('@/app/api/traces/[id]/route')
  return { GET: mod.GET }
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticate.mockResolvedValue(AUTH_RESULT)
  mockInsertTraces.mockResolvedValue(undefined)
  mockInsertSpans.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Trace Ingestion Integration', () => {
  describe('Ingest OTLP Traces', () => {
    it('ingests a valid OTLP payload and returns success', async () => {
      const { POST } = await getV1TracesHandlers()
      const payload = makeOTLPPayload('trace-001', 3)

      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: payload,
      })

      const res = await POST(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.message).toContain('ingested')
      expect(body.traces).toBe(1) // 1 trace
      expect(body.spans).toBe(3) // 3 spans
    })

    it('transforms spans with correct project_id from auth', async () => {
      const { POST } = await getV1TracesHandlers()
      const payload = makeOTLPPayload('trace-002')

      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: payload,
      })

      await POST(req)

      // Verify insertSpans was called with spans having correct project_id
      expect(mockInsertSpans).toHaveBeenCalledTimes(1)
      const insertedSpans = mockInsertSpans.mock.calls[0][0]
      for (const span of insertedSpans) {
        expect(span.project_id).toBe(TEST_WORKSPACE_ID)
      }

      // Verify insertTraces was called with trace having correct project_id
      expect(mockInsertTraces).toHaveBeenCalledTimes(1)
      const insertedTraces = mockInsertTraces.mock.calls[0][0]
      for (const trace of insertedTraces) {
        expect(trace.project_id).toBe(TEST_WORKSPACE_ID)
      }
    })

    it('correctly detects span types from attributes', async () => {
      const { POST } = await getV1TracesHandlers()
      const payload = makeOTLPPayload('trace-003')

      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: payload,
      })

      await POST(req)

      const insertedSpans = mockInsertSpans.mock.calls[0][0]
      // First span has gen_ai.request.model -> generation
      expect(insertedSpans[0].span_type).toBe('generation')
      // Second span has tool.name -> tool
      expect(insertedSpans[1].span_type).toBe('tool')
    })

    it('preserves parent-child span relationships', async () => {
      const { POST } = await getV1TracesHandlers()
      const payload = makeOTLPPayload('trace-004', 3)

      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: payload,
      })

      await POST(req)

      const insertedSpans = mockInsertSpans.mock.calls[0][0]
      // Root span has no parent
      expect(insertedSpans[0].parent_span_id).toBeNull()
      // Child spans reference parent
      expect(insertedSpans[1].parent_span_id).toBe('span-1')
      expect(insertedSpans[2].parent_span_id).toBe('span-1')
    })

    it('calculates duration from timestamps', async () => {
      const { POST } = await getV1TracesHandlers()
      const payload = makeOTLPPayload('trace-005', 1)

      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: payload,
      })

      await POST(req)

      const insertedSpans = mockInsertSpans.mock.calls[0][0]
      expect(insertedSpans[0].duration_ms).toBeGreaterThan(0)
    })

    it('rejects empty resourceSpans', async () => {
      const { POST } = await getV1TracesHandlers()
      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: { resourceSpans: [] },
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('resourceSpans')
    })

    it('handles multiple traces in one payload', async () => {
      const { POST } = await getV1TracesHandlers()
      const payload = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [
              {
                traceId: 'trace-a',
                spanId: 'span-a1',
                name: 'op-a',
                startTimeUnixNano: '1000000000000000',
                endTimeUnixNano: '2000000000000000',
              },
              {
                traceId: 'trace-b',
                spanId: 'span-b1',
                name: 'op-b',
                startTimeUnixNano: '1000000000000000',
                endTimeUnixNano: '2000000000000000',
              },
            ],
          }],
        }],
      }

      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: payload,
      })

      const res = await POST(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.traces).toBe(2) // 2 distinct traces
      expect(body.spans).toBe(2) // 2 spans total
    })
  })

  describe('Query Traces', () => {
    it('lists traces for authenticated workspace', async () => {
      mockQueryTraces.mockResolvedValue([
        {
          trace_id: 'trace-001',
          name: 'test-trace',
          timestamp: '2026-01-15 10:00:00.000',
          duration_ms: 1500,
          status: 'ok',
          total_tokens: 500,
        },
      ])

      const { GET } = await getTracesHandlers()
      const req = createMockRequest('/api/traces')
      const res = await GET(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].trace_id).toBe('trace-001')

      // Verify workspace ID was used
      expect(mockQueryTraces).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: TEST_WORKSPACE_ID }),
      )
    })

    it('applies status filter', async () => {
      mockQueryTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      const req = createMockRequest('/api/traces?status=error')
      await GET(req)

      expect(mockQueryTraces).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      )
    })

    it('applies date range filters', async () => {
      mockQueryTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      const req = createMockRequest('/api/traces?start_date=2026-01-01&end_date=2026-01-31')
      await GET(req)

      expect(mockQueryTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        }),
      )
    })

    it('caps limit at 100', async () => {
      mockQueryTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      const req = createMockRequest('/api/traces?limit=500')
      await GET(req)

      expect(mockQueryTraces).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      )
    })
  })

  describe('Get Trace Detail', () => {
    it('returns trace with span tree (default: summaries)', async () => {
      mockGetTraceWithSpanSummaries.mockResolvedValue({
        trace: {
          trace_id: 'trace-001',
          name: 'root',
          project_id: TEST_WORKSPACE_ID,
          duration_ms: 1500,
          status: 'ok',
        },
        spans: [
          { span_id: 'span-1', parent_span_id: null, name: 'root-span', duration_ms: 1500, span_type: 'generation' },
          { span_id: 'span-2', parent_span_id: 'span-1', name: 'child-span', duration_ms: 500, span_type: 'tool' },
        ],
      })
      mockGetScoresForTrace.mockResolvedValue([
        { name: 'accuracy', value: 0.95 },
      ])

      const { GET } = await getTraceDetailHandlers()
      const req = createMockRequest('/api/traces/trace-001')
      const res = await GET(req, { params: Promise.resolve({ id: 'trace-001' }) })

      expect(res.status).toBe(200)
      const body = await res.json()

      // Verify trace data
      expect(body.trace.trace_id).toBe('trace-001')

      // Verify span tree structure (root has children)
      expect(body.spans).toHaveLength(1) // Only root in tree
      expect(body.spans[0].span_id).toBe('span-1')
      expect(body.spans[0].children).toHaveLength(1)
      expect(body.spans[0].children[0].span_id).toBe('span-2')

      // Verify flat spans array preserved
      expect(body.flatSpans).toHaveLength(2)

      // Verify scores
      expect(body.scores).toHaveLength(1)
      expect(body.scores[0].name).toBe('accuracy')
    })

    it('returns full span data when ?full=true', async () => {
      mockGetTraceWithSpans.mockResolvedValue({
        trace: { trace_id: 'trace-001', name: 'root' },
        spans: [
          { span_id: 'span-1', parent_span_id: null, name: 'root-span', input: 'test input', output: 'test output' },
        ],
      })
      mockGetScoresForTrace.mockResolvedValue([])

      const { GET } = await getTraceDetailHandlers()
      const req = createMockRequest('/api/traces/trace-001?full=true')
      const res = await GET(req, { params: Promise.resolve({ id: 'trace-001' }) })

      expect(res.status).toBe(200)
      // Should call getTraceWithSpans (full), not getTraceWithSpanSummaries
      expect(mockGetTraceWithSpans).toHaveBeenCalledWith(TEST_WORKSPACE_ID, 'trace-001')
      expect(mockGetTraceWithSpanSummaries).not.toHaveBeenCalled()
    })

    it('returns 404 for nonexistent trace', async () => {
      mockGetTraceWithSpanSummaries.mockResolvedValue(null)

      const { GET } = await getTraceDetailHandlers()
      const req = createMockRequest('/api/traces/trace-nonexistent')
      const res = await GET(req, { params: Promise.resolve({ id: 'trace-nonexistent' }) })

      expect(res.status).toBe(404)
    })
  })

  describe('Full Trace Flow', () => {
    it('ingest -> query list -> get detail', async () => {
      const { POST } = await getV1TracesHandlers()
      const { GET: LIST } = await getTracesHandlers()
      const { GET: DETAIL } = await getTraceDetailHandlers()

      // Step 1: Ingest trace
      const payload = makeOTLPPayload('trace-flow-001', 3)
      const ingestRes = await POST(createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: payload,
      }))
      expect(ingestRes.status).toBe(200)
      const ingested = await ingestRes.json()
      expect(ingested.spans).toBe(3)

      // Verify the spans were inserted with correct data
      const insertedSpans = mockInsertSpans.mock.calls[0][0]
      expect(insertedSpans).toHaveLength(3)
      expect(insertedSpans[0].trace_id).toBe('trace-flow-001')

      // Step 2: Query traces (simulate ClickHouse returning the ingested trace)
      mockQueryTraces.mockResolvedValue([{
        trace_id: 'trace-flow-001',
        name: 'root-operation',
        duration_ms: 300,
        status: 'ok',
        total_tokens: 0,
      }])

      const listRes = await LIST(createMockRequest('/api/traces'))
      expect(listRes.status).toBe(200)
      const listed = await listRes.json()
      expect(listed.items).toHaveLength(1)
      expect(listed.items[0].trace_id).toBe('trace-flow-001')

      // Step 3: Get trace detail
      mockGetTraceWithSpanSummaries.mockResolvedValue({
        trace: { trace_id: 'trace-flow-001', name: 'root-operation', status: 'ok' },
        spans: [
          { span_id: 'span-1', parent_span_id: null, name: 'root-operation', span_type: 'generation' },
          { span_id: 'span-2', parent_span_id: 'span-1', name: 'child-operation-1', span_type: 'tool' },
          { span_id: 'span-3', parent_span_id: 'span-1', name: 'child-operation-2', span_type: 'tool' },
        ],
      })
      mockGetScoresForTrace.mockResolvedValue([])

      const detailRes = await DETAIL(
        createMockRequest('/api/traces/trace-flow-001'),
        { params: Promise.resolve({ id: 'trace-flow-001' }) },
      )
      expect(detailRes.status).toBe(200)
      const detail = await detailRes.json()

      // Verify tree structure: root with 2 children
      expect(detail.spans).toHaveLength(1)
      expect(detail.spans[0].children).toHaveLength(2)
      expect(detail.flatSpans).toHaveLength(3)
    })
  })

  describe('Error Handling', () => {
    it('returns 500 on ClickHouse insert failure', async () => {
      mockInsertSpans.mockRejectedValue(new Error('ClickHouse connection failed'))

      const { POST } = await getV1TracesHandlers()
      const req = createMockRequest('/api/v1/traces', {
        method: 'POST',
        body: makeOTLPPayload('trace-err'),
      })

      const res = await POST(req)
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toContain('Failed to ingest')
    })

    it('returns 500 on query failure', async () => {
      mockQueryTraces.mockRejectedValue(new Error('ClickHouse query timeout'))

      const { GET } = await getTracesHandlers()
      const req = createMockRequest('/api/traces')
      const res = await GET(req)

      expect(res.status).toBe(500)
    })
  })
})
