/**
 * Integration Test: Eval Run Lifecycle
 *
 * Tests the full eval run flow:
 * Create suite -> Start eval run -> Check status -> Poll for completion -> Verify results
 *
 * Mocks Temporal workflows and PostgreSQL to test route handlers
 * end-to-end without infrastructure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USER = {
  id: 'user-run-00000-0000-0000-000000000001',
  email: 'runner@example.com',
  name: 'Runner User',
}

const TEST_WORKSPACE_ID = 'ws-run-00000-0000-0000-000000000001'

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

const mockPgQuery = vi.fn()

vi.mock('pg', () => ({
  Pool: class MockPool {
    query = (...args: unknown[]) => mockPgQuery(...args)
    on = vi.fn()
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

async function getRunsHandlers() {
  const mod = await import('@/app/api/runs/route')
  return { GET: mod.GET, POST: mod.POST }
}

async function getRunDetailHandlers() {
  const mod = await import('@/app/api/runs/[id]/route')
  return { GET: mod.GET, DELETE: mod.DELETE }
}

async function getRunStatusHandlers() {
  const mod = await import('@/app/api/runs/[id]/status/route')
  return { GET: mod.GET }
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticate.mockResolvedValue(AUTH_RESULT)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Eval Run Lifecycle Integration', () => {
  describe('Start Eval Run', () => {
    it('starts an eval run with valid parameters', async () => {
      mockStartEvalRunWorkflow.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
      })

      const { POST } = await getRunsHandlers()
      const req = createMockRequest('/api/runs', {
        method: 'POST',
        body: {
          agentId: 'agent-1',
          dataset: { items: [{ input: { query: 'test question' } }] },
          scorers: ['tool_selection'],
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toMatchObject({
        message: expect.stringContaining('started'),
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'RUNNING',
        dataset_size: 1,
        scorers: ['tool_selection'],
      })

      // Verify workflow started with correct workspace
      expect(mockStartEvalRunWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_WORKSPACE_ID,
          agentId: 'agent-1',
          dataset: { items: [{ input: { query: 'test question' } }] },
          scorers: ['tool_selection'],
        }),
      )
    })

    it('rejects missing agentId', async () => {
      const { POST } = await getRunsHandlers()
      const req = createMockRequest('/api/runs', {
        method: 'POST',
        body: {
          dataset: { items: [{ input: { query: 'test' } }] },
          scorers: ['tool_selection'],
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('agentId')
    })

    it('rejects empty dataset', async () => {
      const { POST } = await getRunsHandlers()
      const req = createMockRequest('/api/runs', {
        method: 'POST',
        body: {
          agentId: 'agent-1',
          dataset: { items: [] },
          scorers: ['tool_selection'],
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('dataset')
    })

    it('rejects missing scorers', async () => {
      const { POST } = await getRunsHandlers()
      const req = createMockRequest('/api/runs', {
        method: 'POST',
        body: {
          agentId: 'agent-1',
          dataset: { items: [{ input: { query: 'test' } }] },
          scorers: [],
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('scorers')
    })

    it('uses auth workspace even if projectId not provided', async () => {
      mockStartEvalRunWorkflow.mockResolvedValue({
        runId: 'run-002',
        workflowId: 'eval-run-run-002',
      })

      const { POST } = await getRunsHandlers()
      const req = createMockRequest('/api/runs', {
        method: 'POST',
        body: {
          agentId: 'agent-1',
          dataset: { items: [{ input: { query: 'test' } }] },
          scorers: ['tool_selection'],
        },
      })

      await POST(req)

      expect(mockStartEvalRunWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: TEST_WORKSPACE_ID }),
      )
    })
  })

  describe('Check Run Status', () => {
    it('returns run status for RUNNING workflow', async () => {
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'RUNNING',
        startTime: '2026-01-15T10:00:00Z',
        progress: { completed: 3, total: 10, passed: 2, failed: 1 },
      })

      const { GET } = await getRunDetailHandlers()
      const req = createMockRequest('/api/runs/run-001')
      const res = await GET(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('RUNNING')
      expect(body.progress).toMatchObject({
        completed: 3,
        total: 10,
        passed: 2,
        failed: 1,
      })
    })

    it('returns completed status with results', async () => {
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'COMPLETED',
        startTime: '2026-01-15T10:00:00Z',
        closeTime: '2026-01-15T10:05:00Z',
        result: {
          summary: { total: 10, passed: 8, failed: 2, avgScore: 0.85 },
        },
      })

      const { GET } = await getRunDetailHandlers()
      const req = createMockRequest('/api/runs/run-001')
      const res = await GET(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('COMPLETED')
      expect(body.result).toMatchObject({
        summary: { total: 10, passed: 8, failed: 2, avgScore: 0.85 },
      })
    })

    it('returns 404 for nonexistent run', async () => {
      mockGetWorkflowStatus.mockRejectedValue(new Error('Workflow not found'))

      const { GET } = await getRunDetailHandlers()
      const req = createMockRequest('/api/runs/run-999')
      const res = await GET(req, { params: Promise.resolve({ id: 'run-999' }) })

      expect(res.status).toBe(404)
    })
  })

  describe('Lightweight Status Polling', () => {
    it('returns compact status for polling', async () => {
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'RUNNING',
        progress: { completed: 5, total: 10, passed: 4, failed: 1 },
      })

      const { GET } = await getRunStatusHandlers()
      const req = createMockRequest('/api/runs/run-001/status')
      const res = await GET(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.isRunning).toBe(true)
      expect(body.isComplete).toBe(false)
      expect(body.isFailed).toBe(false)
      expect(body.progress).toMatchObject({
        completed: 5,
        total: 10,
        percentComplete: 50,
      })
    })

    it('returns completed status with summary', async () => {
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'COMPLETED',
        result: {
          summary: { total: 10, passed: 9, failed: 1, avgScore: 0.92 },
        },
      })

      const { GET } = await getRunStatusHandlers()
      const req = createMockRequest('/api/runs/run-001/status')
      const res = await GET(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.isComplete).toBe(true)
      expect(body.isRunning).toBe(false)
      expect(body.summary).toMatchObject({
        total: 10,
        passed: 9,
        failed: 1,
        avgScore: 0.92,
      })
    })

    it('returns failed status with error', async () => {
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'FAILED',
        error: 'Agent crashed during evaluation',
      })

      const { GET } = await getRunStatusHandlers()
      const req = createMockRequest('/api/runs/run-001/status')
      const res = await GET(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.isFailed).toBe(true)
      expect(body.error).toBe('Agent crashed during evaluation')
    })
  })

  describe('Cancel Eval Run', () => {
    it('cancels a running eval run', async () => {
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'RUNNING',
      })
      mockCancelWorkflow.mockResolvedValue(undefined)

      const { DELETE } = await getRunDetailHandlers()
      const req = createMockRequest('/api/runs/run-001', { method: 'DELETE' })
      const res = await DELETE(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.newStatus).toBe('CANCELLED')
      expect(mockCancelWorkflow).toHaveBeenCalledWith('eval-run-run-001')
    })

    it('rejects cancellation of completed run', async () => {
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-001',
        workflowId: 'eval-run-run-001',
        status: 'COMPLETED',
      })

      const { DELETE } = await getRunDetailHandlers()
      const req = createMockRequest('/api/runs/run-001', { method: 'DELETE' })
      const res = await DELETE(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Cannot cancel')
    })
  })

  describe('List Runs', () => {
    it('lists recent eval runs', async () => {
      mockListEvalRuns.mockResolvedValue({
        items: [
          { runId: 'run-001', status: 'COMPLETED' },
          { runId: 'run-002', status: 'RUNNING' },
        ],
        hasMore: false,
      })

      const { GET } = await getRunsHandlers()
      const req = createMockRequest('/api/runs')
      const res = await GET(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toHaveLength(2)
      expect(body.count).toBe(2)
    })

    it('returns empty list when Temporal is unavailable', async () => {
      mockListEvalRuns.mockRejectedValue(new Error('UNAVAILABLE: Temporal is down'))

      const { GET } = await getRunsHandlers()
      const req = createMockRequest('/api/runs')
      const res = await GET(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toEqual([])
      expect(body.warning).toBeDefined()
    })
  })

  describe('Full Run Lifecycle', () => {
    it('start -> poll status (running) -> poll status (completed) -> get details', async () => {
      const { POST, GET: LIST } = await getRunsHandlers()
      const { GET } = await getRunDetailHandlers()
      const { GET: STATUS } = await getRunStatusHandlers()

      // Step 1: Start a run
      mockStartEvalRunWorkflow.mockResolvedValue({
        runId: 'run-lifecycle',
        workflowId: 'eval-run-run-lifecycle',
      })

      const startRes = await POST(createMockRequest('/api/runs', {
        method: 'POST',
        body: {
          agentId: 'agent-1',
          dataset: {
            items: [
              { input: { query: 'What is 2+2?' } },
              { input: { query: 'What is the capital of France?' } },
            ],
          },
          scorers: ['tool_selection', 'reasoning'],
        },
      }))
      expect(startRes.status).toBe(200)
      const started = await startRes.json()
      expect(started.runId).toBe('run-lifecycle')
      expect(started.dataset_size).toBe(2)

      // Step 2: Poll status - running with progress
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-lifecycle',
        workflowId: 'eval-run-run-lifecycle',
        status: 'RUNNING',
        progress: { completed: 1, total: 2, passed: 1, failed: 0 },
      })

      const statusRunningRes = await STATUS(
        createMockRequest('/api/runs/run-lifecycle/status'),
        { params: Promise.resolve({ id: 'run-lifecycle' }) },
      )
      expect(statusRunningRes.status).toBe(200)
      const statusRunning = await statusRunningRes.json()
      expect(statusRunning.isRunning).toBe(true)
      expect(statusRunning.progress.percentComplete).toBe(50)

      // Step 3: Poll status - completed
      mockGetWorkflowStatus.mockResolvedValue({
        runId: 'run-lifecycle',
        workflowId: 'eval-run-run-lifecycle',
        status: 'COMPLETED',
        startTime: '2026-01-15T10:00:00Z',
        closeTime: '2026-01-15T10:02:00Z',
        result: {
          summary: { total: 2, passed: 2, failed: 0, avgScore: 0.95 },
        },
      })

      const statusCompleteRes = await STATUS(
        createMockRequest('/api/runs/run-lifecycle/status'),
        { params: Promise.resolve({ id: 'run-lifecycle' }) },
      )
      expect(statusCompleteRes.status).toBe(200)
      const statusComplete = await statusCompleteRes.json()
      expect(statusComplete.isComplete).toBe(true)
      expect(statusComplete.summary.avgScore).toBe(0.95)

      // Step 4: Get full run details
      const detailRes = await GET(
        createMockRequest('/api/runs/run-lifecycle'),
        { params: Promise.resolve({ id: 'run-lifecycle' }) },
      )
      expect(detailRes.status).toBe(200)
      const detail = await detailRes.json()
      expect(detail.status).toBe('COMPLETED')
      expect(detail.result.summary.total).toBe(2)
    })
  })

  describe('Error Handling', () => {
    it('returns 503 when Temporal is unavailable for starting runs', async () => {
      mockStartEvalRunWorkflow.mockRejectedValue(new Error('UNAVAILABLE: Connection refused'))

      const { POST } = await getRunsHandlers()
      const req = createMockRequest('/api/runs', {
        method: 'POST',
        body: {
          agentId: 'agent-1',
          dataset: { items: [{ input: { query: 'test' } }] },
          scorers: ['tool_selection'],
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toContain('Temporal')
    })

    it('returns 503 when Temporal is unavailable for status checks', async () => {
      mockGetWorkflowStatus.mockRejectedValue(new Error('UNAVAILABLE: no connection'))

      const { GET } = await getRunStatusHandlers()
      const req = createMockRequest('/api/runs/run-001/status')
      const res = await GET(req, { params: Promise.resolve({ id: 'run-001' }) })

      expect(res.status).toBe(503)
    })
  })
})
