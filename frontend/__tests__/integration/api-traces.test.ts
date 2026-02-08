/**
 * Integration Test: Traces API
 *
 * Tests GET /api/traces endpoint with mocked ClickHouse.
 * Verifies auth middleware, query filtering, and error handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USER = {
  id: 'user-traces-0000-0000-0000-000000000001',
  email: 'traces@example.com',
  name: 'Traces User',
}

const TEST_WORKSPACE_ID = 'ws-traces-0000-0000-0000-000000000001'

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
    (
      handler: (
        req: NextRequest,
        auth: AuthResult,
        ...args: unknown[]
      ) => Promise<NextResponse>,
      options?: { optional?: boolean },
    ) => {
      return async (
        request: NextRequest,
        ...args: unknown[]
      ): Promise<NextResponse> => {
        const auth = await mockAuthenticate()
        if (!options?.optional && !auth) {
          return NextResponse.json(
            {
              error: 'Unauthorized',
              message: 'Valid authentication required',
            },
            { status: 401 },
          )
        }
        return handler(request, auth as AuthResult, ...args)
      }
    },
  ),
}))

vi.mock('@/lib/middleware/rate-limit', () => ({
  withRateLimit: vi.fn(
    (handler: (...args: unknown[]) => Promise<NextResponse>) => handler,
  ),
}))

const mockListTraces = vi.fn()

vi.mock('@/lib/db/clickhouse', () => ({
  traces: {
    listTraces: (...args: unknown[]) =>
      mockListTraces(...args).then((data: unknown) => ({ data })),
  },
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

async function getTracesHandlers() {
  return await import('@/app/api/traces/route')
}

// =============================================================================
// Tests
// =============================================================================

describe('Traces API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticate.mockResolvedValue(AUTH_RESULT)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // GET /api/traces
  // ---------------------------------------------------------------------------

  describe('GET /api/traces', () => {
    it('returns traces for authenticated workspace', async () => {
      mockListTraces.mockResolvedValue([
        {
          trace_id: 'trace-001',
          name: 'agent-call',
          status: 'ok',
          duration_ms: 150,
          total_tokens: 500,
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          trace_id: 'trace-002',
          name: 'agent-call-2',
          status: 'error',
          duration_ms: 3000,
          total_tokens: 200,
          timestamp: '2025-01-01T01:00:00Z',
        },
      ])

      const { GET } = await getTracesHandlers()
      const res = await GET(createMockRequest('/api/traces'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.items).toHaveLength(2)
      expect(body.count).toBe(2)
      expect(body.items[0].trace_id).toBe('trace-001')
    })

    it('passes projectId from auth workspace', async () => {
      mockListTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      await GET(createMockRequest('/api/traces'))

      expect(mockListTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_WORKSPACE_ID,
        }),
      )
    })

    it('passes filter parameters to ClickHouse query', async () => {
      mockListTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      await GET(
        createMockRequest(
          '/api/traces?status=ok&start_date=2025-01-01&end_date=2025-01-31&limit=25&offset=10',
        ),
      )

      expect(mockListTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_WORKSPACE_ID,
          status: 'ok',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          limit: 25,
          offset: 10,
        }),
      )
    })

    it('caps limit at 100', async () => {
      mockListTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      await GET(createMockRequest('/api/traces?limit=500'))

      expect(mockListTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Capped
        }),
      )
    })

    it('defaults to limit=50 and offset=0', async () => {
      mockListTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      await GET(createMockRequest('/api/traces'))

      expect(mockListTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0,
        }),
      )
    })

    it('returns 401 when unauthenticated', async () => {
      mockAuthenticate.mockResolvedValue(null)

      const { GET } = await getTracesHandlers()
      const res = await GET(createMockRequest('/api/traces'))

      expect(res.status).toBe(401)
    })

    it('returns 400 when workspace context is missing', async () => {
      mockAuthenticate.mockResolvedValue({
        user: TEST_USER,
        workspaceId: undefined,
      } as unknown as AuthResult)

      const { GET } = await getTracesHandlers()
      const res = await GET(createMockRequest('/api/traces'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('Workspace context required')
    })

    it('handles ClickHouse errors gracefully', async () => {
      mockListTraces.mockRejectedValue(
        new Error('Connection refused: ClickHouse'),
      )

      const { GET } = await getTracesHandlers()
      const res = await GET(createMockRequest('/api/traces'))
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.error).toBe('Failed to query traces')
    })
  })

  // ---------------------------------------------------------------------------
  // Auth middleware behavior
  // ---------------------------------------------------------------------------

  describe('Auth middleware', () => {
    it('uses workspace ID from auth, not from headers', async () => {
      mockListTraces.mockResolvedValue([])

      const { GET } = await getTracesHandlers()
      await GET(
        createMockRequest('/api/traces', {
          headers: { 'x-workspace-id': 'attacker-workspace' },
        }),
      )

      // Should use workspace from auth result, not from header
      expect(mockListTraces).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_WORKSPACE_ID,
        }),
      )
    })

    it('isolates queries to authenticated workspace only', async () => {
      // Workspace A
      mockAuthenticate.mockResolvedValue({
        user: { ...TEST_USER, id: 'user-a' },
        workspaceId: 'ws-a',
      })

      mockListTraces.mockResolvedValue([
        { trace_id: 'trace-ws-a', name: 'ws-a-trace' },
      ])

      const { GET } = await getTracesHandlers()
      const resA = await GET(createMockRequest('/api/traces'))
      const bodyA = await resA.json()

      expect(mockListTraces).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'ws-a' }),
      )
      expect(bodyA.items[0].trace_id).toBe('trace-ws-a')

      // Workspace B
      mockAuthenticate.mockResolvedValue({
        user: { ...TEST_USER, id: 'user-b' },
        workspaceId: 'ws-b',
      })

      mockListTraces.mockResolvedValue([
        { trace_id: 'trace-ws-b', name: 'ws-b-trace' },
      ])

      const resB = await GET(createMockRequest('/api/traces'))
      const bodyB = await resB.json()

      expect(mockListTraces).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'ws-b' }),
      )
      expect(bodyB.items[0].trace_id).toBe('trace-ws-b')
    })
  })
})
