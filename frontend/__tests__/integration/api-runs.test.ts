/**
 * Integration Test: Runs API
 *
 * Tests POST/GET /api/runs endpoints with mocked Temporal client.
 * Verifies auth, validation, error handling, and graceful degradation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USER = {
  id: 'user-runs-0000-0000-0000-000000000001',
  email: 'runs@example.com',
  name: 'Runs User',
}

const TEST_WORKSPACE_ID = 'ws-runs-0000-0000-0000-000000000001'

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

const mockStartEvalRunWorkflow = vi.fn()
const mockListEvalRuns = vi.fn()

vi.mock('@/lib/temporal', () => ({
  startEvalRunWorkflow: (...args: unknown[]) =>
    mockStartEvalRunWorkflow(...args),
  listEvalRuns: (...args: unknown[]) => mockListEvalRuns(...args),
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

async function getRunsHandlers() {
  return await import('@/app/api/runs/route')
}

// =============================================================================
// Tests
// =============================================================================

describe('Runs API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticate.mockResolvedValue(AUTH_RESULT)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // POST /api/runs
  // ---------------------------------------------------------------------------

  describe('POST /api/runs', () => {
    it('starts an eval run via Temporal', async () => {
      mockStartEvalRunWorkflow.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'wf-001',
      })

      const { POST } = await getRunsHandlers()
      const res = await POST(
        createMockRequest('/api/runs', {
          method: 'POST',
          body: {
            agentId: 'agent-1',
            agentVersion: 'v1',
            dataset: { items: [{ input: { query: 'hello' } }] },
            scorers: ['tool_selection'],
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.runId).toBe('run-001')
      expect(body.workflowId).toBe('wf-001')
      expect(body.status).toBe('RUNNING')
      expect(body.dataset_size).toBe(1)
    })

    it('returns 401 when unauthenticated', async () => {
      mockAuthenticate.mockResolvedValue(null)

      const { POST } = await getRunsHandlers()
      const res = await POST(
        createMockRequest('/api/runs', {
          method: 'POST',
          body: {
            agentId: 'agent-1',
            dataset: { items: [{ input: { query: 'hello' } }] },
            scorers: ['tool_selection'],
          },
        }),
      )

      expect(res.status).toBe(401)
    })

    it('returns 400 when workspace context is missing', async () => {
      mockAuthenticate.mockResolvedValue({
        user: TEST_USER,
        workspaceId: undefined,
      } as unknown as AuthResult)

      const { POST } = await getRunsHandlers()
      const res = await POST(
        createMockRequest('/api/runs', {
          method: 'POST',
          body: {
            agentId: 'agent-1',
            dataset: { items: [{ input: { query: 'hello' } }] },
            scorers: ['tool_selection'],
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('Workspace context required')
    })

    it('rejects mismatched projectId', async () => {
      const { POST } = await getRunsHandlers()
      const res = await POST(
        createMockRequest('/api/runs', {
          method: 'POST',
          body: {
            agentId: 'agent-1',
            projectId: 'different-workspace',
            dataset: { items: [{ input: { query: 'hello' } }] },
            scorers: ['tool_selection'],
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toContain('does not match')
    })

    it('returns 503 when Temporal is unavailable', async () => {
      mockStartEvalRunWorkflow.mockRejectedValue(
        new Error('14 UNAVAILABLE: Connection dropped'),
      )

      const { POST } = await getRunsHandlers()
      const res = await POST(
        createMockRequest('/api/runs', {
          method: 'POST',
          body: {
            agentId: 'agent-1',
            dataset: { items: [{ input: { query: 'hello' } }] },
            scorers: ['tool_selection'],
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(503)
      expect(body.error).toBe('Temporal service unavailable')
    })
  })

  // ---------------------------------------------------------------------------
  // GET /api/runs
  // ---------------------------------------------------------------------------

  describe('GET /api/runs', () => {
    it('lists eval runs', async () => {
      mockListEvalRuns.mockResolvedValue({
        items: [
          {
            id: 'run-1',
            status: 'COMPLETED',
            started_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'run-2',
            status: 'RUNNING',
            started_at: '2025-01-02T00:00:00Z',
          },
        ],
        hasMore: false,
      })

      const { GET } = await getRunsHandlers()
      const res = await GET(createMockRequest('/api/runs'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.items).toHaveLength(2)
      expect(body.count).toBe(2)
    })

    it('passes query params to listEvalRuns', async () => {
      mockListEvalRuns.mockResolvedValue({ items: [], hasMore: false })

      const { GET } = await getRunsHandlers()
      await GET(createMockRequest('/api/runs?limit=10&offset=5&status=COMPLETED'))

      expect(mockListEvalRuns).toHaveBeenCalledWith({
        limit: 10,
        offset: 5,
        status: 'COMPLETED',
      })
    })

    it('returns 401 when unauthenticated', async () => {
      mockAuthenticate.mockResolvedValue(null)

      const { GET } = await getRunsHandlers()
      const res = await GET(createMockRequest('/api/runs'))

      expect(res.status).toBe(401)
    })

    it('gracefully handles Temporal unavailability', async () => {
      mockListEvalRuns.mockRejectedValue(
        new Error('14 UNAVAILABLE: No connection'),
      )

      const { GET } = await getRunsHandlers()
      const res = await GET(createMockRequest('/api/runs'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.items).toEqual([])
      expect(body.warning).toContain('Temporal')
    })
  })
})
