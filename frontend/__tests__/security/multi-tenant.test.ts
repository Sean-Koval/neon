/**
 * Multi-Tenant Security Tests
 *
 * Tests workspace isolation and access control for all major API endpoints.
 * Ensures User A cannot access User B's data (traces, runs, suites).
 *
 * These tests import the actual route handlers which are wrapped with withAuth.
 * The auth middleware is mocked to simulate authenticated/unauthenticated requests
 * while preserving the real gating behavior (401 on missing auth, workspace filtering).
 *
 * @module __tests__/security/multi-tenant.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USERS = {
  userA: {
    id: 'user-a-00000-0000-0000-000000000001',
    email: 'user-a@example.com',
    name: 'User A',
  },
  userB: {
    id: 'user-b-00000-0000-0000-000000000002',
    email: 'user-b@example.com',
    name: 'User B',
  },
} as const

const TEST_WORKSPACES = {
  workspaceA: {
    id: 'ws-a-00000-0000-0000-000000000001',
    name: 'Workspace A',
  },
  workspaceB: {
    id: 'ws-b-00000-0000-0000-000000000002',
    name: 'Workspace B',
  },
} as const

const AUTH_RESULT_A: AuthResult = {
  user: TEST_USERS.userA,
  workspaceId: TEST_WORKSPACES.workspaceA.id,
}

const AUTH_RESULT_B: AuthResult = {
  user: TEST_USERS.userB,
  workspaceId: TEST_WORKSPACES.workspaceB.id,
}

const TEST_RESOURCES = {
  suiteA: {
    id: 'a0000000-0000-0000-0000-000000000001',
    project_id: TEST_WORKSPACES.workspaceA.id,
    name: 'Suite A',
    description: null,
    agent_module_path: null,
    config: '{}',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  suiteB: {
    id: 'b0000000-0000-0000-0000-000000000002',
    project_id: TEST_WORKSPACES.workspaceB.id,
    name: 'Suite B',
    description: null,
    agent_module_path: null,
    config: '{}',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
} as const

// =============================================================================
// Mock: Auth middleware with realistic withAuth gating
// =============================================================================

/**
 * The mock authenticate function. Tests set its return value to simulate
 * different auth states (null = unauthenticated, AuthResult = authenticated).
 */
const mockAuthenticate = vi.fn<() => Promise<AuthResult | null>>()

vi.mock('@/lib/middleware/auth', () => ({
  authenticate: (...args: unknown[]) => mockAuthenticate(...(args as [])),
  withAuth: vi.fn(
    (handler: (req: NextRequest, auth: AuthResult, ...args: unknown[]) => Promise<NextResponse>, options?: { optional?: boolean }) => {
      return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
        const auth = await mockAuthenticate()

        if (!options?.optional && !auth) {
          return NextResponse.json(
            {
              error: 'Unauthorized',
              message: 'Valid authentication required',
              hint: 'Provide a valid Bearer token or X-API-Key header',
            },
            { status: 401 },
          )
        }

        return handler(request, auth as AuthResult, ...args)
      }
    },
  ),
}))

// =============================================================================
// Mock: ClickHouse
// =============================================================================

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

// =============================================================================
// Mock: Temporal
// =============================================================================

const mockListEvalRuns = vi.fn()
const mockStartEvalRunWorkflow = vi.fn()
const mockGetWorkflowStatus = vi.fn()
const mockCancelWorkflow = vi.fn()
const mockPauseEvalRun = vi.fn()
const mockResumeEvalRun = vi.fn()

vi.mock('@/lib/temporal', () => ({
  listEvalRuns: (...args: unknown[]) => mockListEvalRuns(...args),
  startEvalRunWorkflow: (...args: unknown[]) => mockStartEvalRunWorkflow(...args),
  getWorkflowStatus: (...args: unknown[]) => mockGetWorkflowStatus(...args),
  cancelWorkflow: (...args: unknown[]) => mockCancelWorkflow(...args),
  pauseEvalRun: (...args: unknown[]) => mockPauseEvalRun(...args),
  resumeEvalRun: (...args: unknown[]) => mockResumeEvalRun(...args),
}))

// =============================================================================
// Mock: PostgreSQL (pg)
// =============================================================================

const mockPgQuery = vi.fn()

vi.mock('pg', () => {
  return {
    Pool: class MockPool {
      query = (...args: unknown[]) => mockPgQuery(...args)
      on = vi.fn()
    },
  }
})

// =============================================================================
// Mock: Database (drizzle) - needed for auth module imports
// =============================================================================

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
// Mock Helpers
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

// =============================================================================
// Import Route Handlers (after mocks are set up)
// =============================================================================

// These dynamic imports ensure mocks are in place before module evaluation.
// We import inside each describe block or use top-level await.

async function getTracesHandlers() {
  const mod = await import('@/app/api/traces/route')
  return { GET: mod.GET }
}

async function getTraceDetailHandlers() {
  const mod = await import('@/app/api/traces/[id]/route')
  return { GET: mod.GET }
}

async function getV1TracesHandlers() {
  const mod = await import('@/app/api/v1/traces/route')
  return { POST: mod.POST }
}

async function getRunsHandlers() {
  const mod = await import('@/app/api/runs/route')
  return { GET: mod.GET, POST: mod.POST }
}

async function getRunDetailHandlers() {
  const mod = await import('@/app/api/runs/[id]/route')
  return { GET: mod.GET, DELETE: mod.DELETE }
}

async function getSuitesHandlers() {
  const mod = await import('@/app/api/suites/route')
  return { GET: mod.GET, POST: mod.POST }
}

async function getSuiteDetailHandlers() {
  const mod = await import('@/app/api/suites/[id]/route')
  return { GET: mod.GET, PATCH: mod.PATCH, DELETE: mod.DELETE }
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticate.mockResolvedValue(null) // Default: unauthenticated
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =============================================================================
// Authentication: All endpoints reject unauthenticated requests
// =============================================================================

describe('Authentication Requirements', () => {
  it('GET /api/traces returns 401 without auth', async () => {
    const { GET } = await getTracesHandlers()
    const req = createMockRequest('/api/traces')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('GET /api/traces/:id returns 401 without auth', async () => {
    const { GET } = await getTraceDetailHandlers()
    const req = createMockRequest('/api/traces/some-id')
    const res = await GET(req, { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(401)
  })

  it('POST /api/v1/traces returns 401 without auth', async () => {
    const { POST } = await getV1TracesHandlers()
    const req = createMockRequest('/api/v1/traces', {
      method: 'POST',
      body: { resourceSpans: [] },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('GET /api/runs returns 401 without auth', async () => {
    const { GET } = await getRunsHandlers()
    const req = createMockRequest('/api/runs')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('POST /api/runs returns 401 without auth', async () => {
    const { POST } = await getRunsHandlers()
    const req = createMockRequest('/api/runs', { method: 'POST', body: {} })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('GET /api/runs/:id returns 401 without auth', async () => {
    const { GET } = await getRunDetailHandlers()
    const req = createMockRequest('/api/runs/some-id')
    const res = await GET(req, { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(401)
  })

  it('DELETE /api/runs/:id returns 401 without auth', async () => {
    const { DELETE } = await getRunDetailHandlers()
    const req = createMockRequest('/api/runs/some-id', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(401)
  })

  it('GET /api/suites returns 401 without auth', async () => {
    const { GET } = await getSuitesHandlers()
    const req = createMockRequest('/api/suites')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('POST /api/suites returns 401 without auth', async () => {
    const { POST } = await getSuitesHandlers()
    const req = createMockRequest('/api/suites', { method: 'POST', body: {} })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('GET /api/suites/:id returns 401 without auth', async () => {
    const { GET } = await getSuiteDetailHandlers()
    const req = createMockRequest('/api/suites/a0000000-0000-0000-0000-000000000001')
    const res = await GET(req, {
      params: Promise.resolve({ id: 'a0000000-0000-0000-0000-000000000001' }),
    })
    expect(res.status).toBe(401)
  })

  it('PATCH /api/suites/:id returns 401 without auth', async () => {
    const { PATCH } = await getSuiteDetailHandlers()
    const req = createMockRequest('/api/suites/a0000000-0000-0000-0000-000000000001', {
      method: 'PATCH',
      body: { name: 'hacked' },
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: 'a0000000-0000-0000-0000-000000000001' }),
    })
    expect(res.status).toBe(401)
  })

  it('DELETE /api/suites/:id returns 401 without auth', async () => {
    const { DELETE } = await getSuiteDetailHandlers()
    const req = createMockRequest('/api/suites/a0000000-0000-0000-0000-000000000001', {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'a0000000-0000-0000-0000-000000000001' }),
    })
    expect(res.status).toBe(401)
  })
})

// =============================================================================
// Workspace Isolation: Traces
// =============================================================================

describe('Workspace Isolation - Traces', () => {
  it('GET /api/traces uses auth.workspaceId, not x-project-id header', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockQueryTraces.mockResolvedValue([])

    const { GET } = await getTracesHandlers()
    const req = createMockRequest('/api/traces', {
      headers: { 'x-project-id': TEST_WORKSPACES.workspaceB.id },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    // Verify queryTraces was called with workspace A, NOT workspace B from header
    expect(mockQueryTraces).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: TEST_WORKSPACES.workspaceA.id }),
    )
  })

  it('GET /api/traces ignores project_id query param, uses auth workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockQueryTraces.mockResolvedValue([])

    const { GET } = await getTracesHandlers()
    const req = createMockRequest(`/api/traces?project_id=${TEST_WORKSPACES.workspaceB.id}`)
    const res = await GET(req)
    expect(res.status).toBe(200)

    expect(mockQueryTraces).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: TEST_WORKSPACES.workspaceA.id }),
    )
  })

  it('GET /api/traces/:id uses auth workspace for data lookup', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockGetTraceWithSpanSummaries.mockResolvedValue({
      trace: { trace_id: 'trace-1' },
      spans: [],
    })
    mockGetScoresForTrace.mockResolvedValue([])

    const { GET } = await getTraceDetailHandlers()
    const req = createMockRequest('/api/traces/trace-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'trace-1' }) })
    expect(res.status).toBe(200)

    // ClickHouse query should use workspace A
    expect(mockGetTraceWithSpanSummaries).toHaveBeenCalledWith(
      TEST_WORKSPACES.workspaceA.id,
      'trace-1',
    )
  })

  it('POST /api/v1/traces uses auth workspace for ingestion', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockInsertTraces.mockResolvedValue(undefined)
    mockInsertSpans.mockResolvedValue(undefined)

    const { POST } = await getV1TracesHandlers()
    const req = createMockRequest('/api/v1/traces', {
      method: 'POST',
      body: {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 'span1',
                    name: 'test-span',
                    startTimeUnixNano: '1000000000000000',
                    endTimeUnixNano: '2000000000000000',
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // All inserted spans should use workspace A as project_id
    expect(mockInsertSpans).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ project_id: TEST_WORKSPACES.workspaceA.id }),
      ]),
    )
  })

  it('no default project_id fallback exists in traces', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockQueryTraces.mockResolvedValue([])

    const { GET } = await getTracesHandlers()
    const req = createMockRequest('/api/traces')
    await GET(req)

    // Should NEVER use the old hardcoded default UUID
    const calledProjectId = mockQueryTraces.mock.calls[0]?.[0]?.projectId
    expect(calledProjectId).not.toBe('00000000-0000-0000-0000-000000000001')
    expect(calledProjectId).toBe(TEST_WORKSPACES.workspaceA.id)
  })
})

// =============================================================================
// Workspace Isolation: Runs
// =============================================================================

describe('Workspace Isolation - Runs', () => {
  it('GET /api/runs requires workspace context', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockListEvalRuns.mockResolvedValue([])

    const { GET } = await getRunsHandlers()
    const req = createMockRequest('/api/runs')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('POST /api/runs rejects mismatched projectId', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)

    const { POST } = await getRunsHandlers()
    const req = createMockRequest('/api/runs', {
      method: 'POST',
      body: {
        projectId: TEST_WORKSPACES.workspaceB.id, // Wrong workspace!
        agentId: 'agent-1',
        dataset: { items: [{ input: 'test' }] },
        scorers: ['tool_selection'],
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/does not match/)
  })

  it('POST /api/runs uses auth workspace as projectId', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockStartEvalRunWorkflow.mockResolvedValue({
      runId: 'run-1',
      workflowId: 'eval-run-run-1',
    })

    const { POST } = await getRunsHandlers()
    const req = createMockRequest('/api/runs', {
      method: 'POST',
      body: {
        agentId: 'agent-1',
        dataset: { items: [{ input: 'test' }] },
        scorers: ['tool_selection'],
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Workflow should be started with workspace A's project ID
    expect(mockStartEvalRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: TEST_WORKSPACES.workspaceA.id }),
    )
  })

  it('GET /api/runs/:id requires auth', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockGetWorkflowStatus.mockResolvedValue({
      runId: 'run-1',
      workflowId: 'eval-run-run-1',
      status: 'COMPLETED',
    })

    const { GET } = await getRunDetailHandlers()
    const req = createMockRequest('/api/runs/run-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'run-1' }) })
    expect(res.status).toBe(200)
  })

  it('DELETE /api/runs/:id requires auth', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockGetWorkflowStatus.mockResolvedValue({
      runId: 'run-1',
      workflowId: 'eval-run-run-1',
      status: 'RUNNING',
    })
    mockCancelWorkflow.mockResolvedValue(undefined)

    const { DELETE } = await getRunDetailHandlers()
    const req = createMockRequest('/api/runs/run-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'run-1' }) })
    expect(res.status).toBe(200)
  })
})

// =============================================================================
// Workspace Isolation: Suites
// =============================================================================

describe('Workspace Isolation - Suites', () => {
  it('GET /api/suites filters by auth workspace, ignoring query param', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockPgQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT suites
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT

    const { GET } = await getSuitesHandlers()
    const req = createMockRequest(`/api/suites?project_id=${TEST_WORKSPACES.workspaceB.id}`)
    const res = await GET(req)
    expect(res.status).toBe(200)

    // The SQL query should filter by workspace A, not B from query param
    const selectCall = mockPgQuery.mock.calls[0]
    expect(selectCall[0]).toContain('WHERE project_id = $1')
    expect(selectCall[1][0]).toBe(TEST_WORKSPACES.workspaceA.id)
  })

  it('POST /api/suites auto-sets project_id from auth workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockPgQuery.mockResolvedValue({
      rows: [{ ...TEST_RESOURCES.suiteA, project_id: TEST_WORKSPACES.workspaceA.id }],
    })

    const { POST } = await getSuitesHandlers()
    const req = createMockRequest('/api/suites', {
      method: 'POST',
      body: { name: 'New Suite' },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    // INSERT should use workspace A as project_id
    const insertCall = mockPgQuery.mock.calls[0]
    expect(insertCall[1][0]).toBe(TEST_WORKSPACES.workspaceA.id) // $1 = project_id
  })

  it('POST /api/suites rejects mismatched project_id in body', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)

    const { POST } = await getSuitesHandlers()
    const req = createMockRequest('/api/suites', {
      method: 'POST',
      body: {
        name: 'Malicious Suite',
        project_id: TEST_WORKSPACES.workspaceB.id, // Wrong workspace!
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/does not match/)
  })

  it('GET /api/suites/:id returns 404 for suite belonging to different workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    // Suite B exists but belongs to workspace B
    mockPgQuery.mockResolvedValue({ rows: [TEST_RESOURCES.suiteB] })

    const { GET } = await getSuiteDetailHandlers()
    const req = createMockRequest(`/api/suites/${TEST_RESOURCES.suiteB.id}`)
    const res = await GET(req, {
      params: Promise.resolve({ id: TEST_RESOURCES.suiteB.id }),
    })

    // Should return 404 (not 403) to prevent enumeration
    expect(res.status).toBe(404)
  })

  it('GET /api/suites/:id succeeds for suite in own workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockPgQuery.mockResolvedValue({ rows: [TEST_RESOURCES.suiteA] })

    const { GET } = await getSuiteDetailHandlers()
    const req = createMockRequest(`/api/suites/${TEST_RESOURCES.suiteA.id}`)
    const res = await GET(req, {
      params: Promise.resolve({ id: TEST_RESOURCES.suiteA.id }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project_id).toBe(TEST_WORKSPACES.workspaceA.id)
  })

  it('PATCH /api/suites/:id returns 404 for suite in different workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    // First query: fetch existing suite (belongs to workspace B)
    mockPgQuery.mockResolvedValue({ rows: [TEST_RESOURCES.suiteB] })

    const { PATCH } = await getSuiteDetailHandlers()
    const req = createMockRequest(`/api/suites/${TEST_RESOURCES.suiteB.id}`, {
      method: 'PATCH',
      body: { name: 'Hacked Name' },
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: TEST_RESOURCES.suiteB.id }),
    })

    expect(res.status).toBe(404)
  })

  it('DELETE /api/suites/:id returns 404 for suite in different workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockPgQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCES.suiteB.id, project_id: TEST_WORKSPACES.workspaceB.id }],
    })

    const { DELETE } = await getSuiteDetailHandlers()
    const req = createMockRequest(`/api/suites/${TEST_RESOURCES.suiteB.id}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: TEST_RESOURCES.suiteB.id }),
    })

    expect(res.status).toBe(404)
  })

  it('DELETE /api/suites/:id succeeds for suite in own workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockPgQuery
      .mockResolvedValueOnce({
        rows: [{ id: TEST_RESOURCES.suiteA.id, project_id: TEST_WORKSPACES.workspaceA.id }],
      }) // SELECT check
      .mockResolvedValueOnce({ rows: [] }) // DELETE

    const { DELETE } = await getSuiteDetailHandlers()
    const req = createMockRequest(`/api/suites/${TEST_RESOURCES.suiteA.id}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: TEST_RESOURCES.suiteA.id }),
    })

    expect(res.status).toBe(204)
  })
})

// =============================================================================
// Header Injection Prevention
// =============================================================================

describe('Header Injection Prevention', () => {
  it('x-project-id header does not override auth workspace for traces', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockQueryTraces.mockResolvedValue([])

    const { GET } = await getTracesHandlers()
    const req = createMockRequest('/api/traces', {
      headers: { 'x-project-id': TEST_WORKSPACES.workspaceB.id },
    })
    await GET(req)

    // Should use workspace A from auth, NOT workspace B from header
    expect(mockQueryTraces).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: TEST_WORKSPACES.workspaceA.id }),
    )
    expect(mockQueryTraces).not.toHaveBeenCalledWith(
      expect.objectContaining({ projectId: TEST_WORKSPACES.workspaceB.id }),
    )
  })

  it('x-project-id header does not override auth workspace for trace detail', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockGetTraceWithSpanSummaries.mockResolvedValue({
      trace: { trace_id: 'trace-1' },
      spans: [],
    })
    mockGetScoresForTrace.mockResolvedValue([])

    const { GET } = await getTraceDetailHandlers()
    const req = createMockRequest('/api/traces/trace-1', {
      headers: { 'x-project-id': TEST_WORKSPACES.workspaceB.id },
    })
    await GET(req, { params: Promise.resolve({ id: 'trace-1' }) })

    expect(mockGetTraceWithSpanSummaries).toHaveBeenCalledWith(
      TEST_WORKSPACES.workspaceA.id,
      'trace-1',
    )
  })

  it('x-project-id header does not override auth workspace for trace ingestion', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockInsertTraces.mockResolvedValue(undefined)
    mockInsertSpans.mockResolvedValue(undefined)

    const { POST } = await getV1TracesHandlers()
    const req = createMockRequest('/api/v1/traces', {
      method: 'POST',
      headers: { 'x-project-id': TEST_WORKSPACES.workspaceB.id },
      body: {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 'span1',
                    name: 'test',
                    startTimeUnixNano: '1000000000000000',
                  },
                ],
              },
            ],
          },
        ],
      },
    })
    await POST(req)

    // Inserted spans should use workspace A, not B from header
    expect(mockInsertSpans).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ project_id: TEST_WORKSPACES.workspaceA.id }),
      ]),
    )
  })
})

// =============================================================================
// Anti-Enumeration: Consistent 404 responses
// =============================================================================

describe('Anti-Enumeration Protection', () => {
  it('returns 404 (not 403) when accessing suite in another workspace', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)
    mockPgQuery.mockResolvedValue({ rows: [TEST_RESOURCES.suiteB] })

    const { GET } = await getSuiteDetailHandlers()
    const res = await GET(
      createMockRequest(`/api/suites/${TEST_RESOURCES.suiteB.id}`),
      { params: Promise.resolve({ id: TEST_RESOURCES.suiteB.id }) },
    )

    // Must be 404, not 403 - prevents attackers from confirming resource exists
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Suite not found')
  })

  it('returns same 404 for nonexistent suite and unauthorized suite', async () => {
    mockAuthenticate.mockResolvedValue(AUTH_RESULT_A)

    const { GET } = await getSuiteDetailHandlers()

    // Nonexistent suite
    mockPgQuery.mockResolvedValueOnce({ rows: [] })
    const res1 = await GET(
      createMockRequest('/api/suites/a0000000-0000-0000-0000-000000000099'),
      { params: Promise.resolve({ id: 'a0000000-0000-0000-0000-000000000099' }) },
    )

    // Suite exists but belongs to workspace B
    mockPgQuery.mockResolvedValueOnce({ rows: [TEST_RESOURCES.suiteB] })
    const res2 = await GET(
      createMockRequest(`/api/suites/${TEST_RESOURCES.suiteB.id}`),
      { params: Promise.resolve({ id: TEST_RESOURCES.suiteB.id }) },
    )

    // Both should return identical 404 responses
    expect(res1.status).toBe(404)
    expect(res2.status).toBe(404)
    const body1 = await res1.json()
    const body2 = await res2.json()
    expect(body1.error).toBe(body2.error)
  })
})
