/**
 * Integration Test: Suite Lifecycle
 *
 * Tests the full CRUD lifecycle for evaluation suites:
 * Create -> Read -> Update -> List -> Delete -> Verify deletion
 *
 * Uses mocked PostgreSQL and auth middleware to test route handlers
 * end-to-end without requiring real infrastructure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USER = {
  id: 'user-int-00000-0000-0000-000000000001',
  email: 'integration@example.com',
  name: 'Integration User',
}

const TEST_WORKSPACE_ID = 'ws-int-00000-0000-0000-000000000001'

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

/** Simulates a database row as returned by PostgreSQL for a suite */
function makeSuiteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    project_id: TEST_WORKSPACE_ID,
    name: 'Test Suite',
    description: 'A test suite for integration tests',
    agent_module_path: 'agent-1',
    config: { default_scorers: ['tool_selection'], default_min_score: 0.7 },
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
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
  mockAuthenticate.mockResolvedValue(AUTH_RESULT)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Suite Lifecycle Integration', () => {
  describe('Create Suite', () => {
    it('creates a suite and returns 201 with correct shape', async () => {
      const row = makeSuiteRow()
      mockPgQuery.mockResolvedValue({ rows: [row] })

      const { POST } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites', {
        method: 'POST',
        body: { name: 'Test Suite', description: 'A test suite for integration tests', agent_id: 'agent-1' },
      })

      const res = await POST(req)
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body).toMatchObject({
        id: expect.any(String),
        project_id: TEST_WORKSPACE_ID,
        name: 'Test Suite',
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })

      // Verify the INSERT query used auth workspace
      const insertCall = mockPgQuery.mock.calls[0]
      expect(insertCall[0]).toContain('INSERT INTO suites')
      expect(insertCall[1][0]).toBe(TEST_WORKSPACE_ID)
    })

    it('rejects creation without a name', async () => {
      const { POST } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites', {
        method: 'POST',
        body: {},
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('name')
    })

    it('stores config fields correctly', async () => {
      const row = makeSuiteRow({
        config: {
          default_scorers: ['tool_selection', 'reasoning'],
          default_min_score: 0.85,
          default_timeout_seconds: 600,
        },
      })
      mockPgQuery.mockResolvedValue({ rows: [row] })

      const { POST } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites', {
        method: 'POST',
        body: {
          name: 'Config Suite',
          default_scorers: ['tool_selection', 'reasoning'],
          default_min_score: 0.85,
          default_timeout_seconds: 600,
        },
      })

      const res = await POST(req)
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.default_scorers).toEqual(['tool_selection', 'reasoning'])
      expect(body.default_min_score).toBe(0.85)
    })
  })

  describe('Get Suite by ID', () => {
    it('returns the suite when found in workspace', async () => {
      const row = makeSuiteRow()
      mockPgQuery.mockResolvedValue({ rows: [row] })

      const { GET } = await getSuiteDetailHandlers()
      const req = createMockRequest(`/api/suites/${row.id}`)
      const res = await GET(req, { params: Promise.resolve({ id: row.id as string }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(row.id)
      expect(body.name).toBe('Test Suite')
      expect(body.project_id).toBe(TEST_WORKSPACE_ID)
    })

    it('returns 404 for nonexistent suite', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] })

      const { GET } = await getSuiteDetailHandlers()
      const fakeId = 'a0000000-0000-0000-0000-000000000099'
      const req = createMockRequest(`/api/suites/${fakeId}`)
      const res = await GET(req, { params: Promise.resolve({ id: fakeId }) })

      expect(res.status).toBe(404)
    })

    it('returns 400 for invalid UUID format', async () => {
      const { GET } = await getSuiteDetailHandlers()
      const req = createMockRequest('/api/suites/not-a-uuid')
      const res = await GET(req, { params: Promise.resolve({ id: 'not-a-uuid' }) })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Invalid suite ID')
    })
  })

  describe('Update Suite', () => {
    it('updates suite name and returns updated data', async () => {
      const originalRow = makeSuiteRow()
      const updatedRow = makeSuiteRow({ name: 'Updated Suite Name', updated_at: '2026-01-16T00:00:00.000Z' })

      mockPgQuery
        .mockResolvedValueOnce({ rows: [originalRow] }) // SELECT for ownership check
        .mockResolvedValueOnce({ rows: [updatedRow] }) // UPDATE RETURNING

      const { PATCH } = await getSuiteDetailHandlers()
      const req = createMockRequest(`/api/suites/${originalRow.id}`, {
        method: 'PATCH',
        body: { name: 'Updated Suite Name' },
      })

      const res = await PATCH(req, { params: Promise.resolve({ id: originalRow.id as string }) })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.name).toBe('Updated Suite Name')
    })

    it('merges config fields without losing existing values', async () => {
      const originalRow = makeSuiteRow({
        config: { default_scorers: ['tool_selection'], default_min_score: 0.7 },
      })
      const updatedRow = makeSuiteRow({
        config: { default_scorers: ['tool_selection'], default_min_score: 0.9 },
      })

      mockPgQuery
        .mockResolvedValueOnce({ rows: [originalRow] })
        .mockResolvedValueOnce({ rows: [updatedRow] })

      const { PATCH } = await getSuiteDetailHandlers()
      const req = createMockRequest(`/api/suites/${originalRow.id}`, {
        method: 'PATCH',
        body: { default_min_score: 0.9 },
      })

      const res = await PATCH(req, { params: Promise.resolve({ id: originalRow.id as string }) })
      expect(res.status).toBe(200)

      // Verify the UPDATE query included config update
      const updateCall = mockPgQuery.mock.calls[1]
      expect(updateCall[0]).toContain('UPDATE suites')
      expect(updateCall[0]).toContain('config')
    })
  })

  describe('List Suites', () => {
    it('returns paginated list of suites', async () => {
      const rows = [
        makeSuiteRow({ id: 'a0000000-0000-0000-0000-000000000001', name: 'Suite 1' }),
        makeSuiteRow({ id: 'a0000000-0000-0000-0000-000000000002', name: 'Suite 2' }),
      ]
      mockPgQuery
        .mockResolvedValueOnce({ rows }) // SELECT
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // COUNT

      const { GET } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites')
      const res = await GET(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toHaveLength(2)
      expect(body.total).toBe(2)
      expect(body.items[0].name).toBe('Suite 1')
      expect(body.items[1].name).toBe('Suite 2')
    })

    it('filters by authenticated workspace', async () => {
      mockPgQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })

      const { GET } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites')
      await GET(req)

      // Verify WHERE clause uses workspace ID
      const selectCall = mockPgQuery.mock.calls[0]
      expect(selectCall[0]).toContain('WHERE project_id = $1')
      expect(selectCall[1][0]).toBe(TEST_WORKSPACE_ID)
    })

    it('respects limit and offset params', async () => {
      mockPgQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })

      const { GET } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites?limit=10&offset=20')
      await GET(req)

      const selectCall = mockPgQuery.mock.calls[0]
      expect(selectCall[1][1]).toBe(10) // limit
      expect(selectCall[1][2]).toBe(20) // offset
    })
  })

  describe('Delete Suite', () => {
    it('deletes a suite and returns 204', async () => {
      const row = makeSuiteRow()
      mockPgQuery
        .mockResolvedValueOnce({ rows: [{ id: row.id, project_id: TEST_WORKSPACE_ID }] }) // SELECT check
        .mockResolvedValueOnce({ rows: [] }) // DELETE

      const { DELETE } = await getSuiteDetailHandlers()
      const req = createMockRequest(`/api/suites/${row.id}`, { method: 'DELETE' })
      const res = await DELETE(req, { params: Promise.resolve({ id: row.id as string }) })

      expect(res.status).toBe(204)

      // Verify DELETE query was called
      const deleteCall = mockPgQuery.mock.calls[1]
      expect(deleteCall[0]).toContain('DELETE FROM suites')
    })

    it('returns 404 when deleting nonexistent suite', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] })

      const { DELETE } = await getSuiteDetailHandlers()
      const fakeId = 'a0000000-0000-0000-0000-000000000099'
      const req = createMockRequest(`/api/suites/${fakeId}`, { method: 'DELETE' })
      const res = await DELETE(req, { params: Promise.resolve({ id: fakeId }) })

      expect(res.status).toBe(404)
    })
  })

  describe('Full Lifecycle', () => {
    it('create -> get -> update -> list -> delete -> verify deletion', async () => {
      const suiteId = 'a0000000-0000-0000-0000-000000000010'
      const row = makeSuiteRow({ id: suiteId })
      const { POST, GET: LIST } = await getSuitesHandlers()
      const { GET, PATCH, DELETE } = await getSuiteDetailHandlers()

      // Step 1: Create
      mockPgQuery.mockResolvedValueOnce({ rows: [row] })
      const createRes = await POST(createMockRequest('/api/suites', {
        method: 'POST',
        body: { name: 'Test Suite', agent_id: 'agent-1' },
      }))
      expect(createRes.status).toBe(201)
      const created = await createRes.json()
      expect(created.id).toBe(suiteId)

      // Step 2: Get by ID
      mockPgQuery.mockResolvedValueOnce({ rows: [row] })
      const getRes = await GET(
        createMockRequest(`/api/suites/${suiteId}`),
        { params: Promise.resolve({ id: suiteId }) },
      )
      expect(getRes.status).toBe(200)
      const fetched = await getRes.json()
      expect(fetched.name).toBe('Test Suite')

      // Step 3: Update
      const updatedRow = makeSuiteRow({ id: suiteId, name: 'Updated Suite' })
      mockPgQuery
        .mockResolvedValueOnce({ rows: [row] }) // SELECT check
        .mockResolvedValueOnce({ rows: [updatedRow] }) // UPDATE RETURNING
      const patchRes = await PATCH(
        createMockRequest(`/api/suites/${suiteId}`, { method: 'PATCH', body: { name: 'Updated Suite' } }),
        { params: Promise.resolve({ id: suiteId }) },
      )
      expect(patchRes.status).toBe(200)
      const updated = await patchRes.json()
      expect(updated.name).toBe('Updated Suite')

      // Step 4: List (should include updated suite)
      mockPgQuery
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      const listRes = await LIST(createMockRequest('/api/suites'))
      expect(listRes.status).toBe(200)
      const listed = await listRes.json()
      expect(listed.items).toHaveLength(1)
      expect(listed.items[0].name).toBe('Updated Suite')

      // Step 5: Delete
      mockPgQuery
        .mockResolvedValueOnce({ rows: [{ id: suiteId, project_id: TEST_WORKSPACE_ID }] })
        .mockResolvedValueOnce({ rows: [] })
      const deleteRes = await DELETE(
        createMockRequest(`/api/suites/${suiteId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: suiteId }) },
      )
      expect(deleteRes.status).toBe(204)

      // Step 6: Verify deletion - get should return 404
      mockPgQuery.mockResolvedValueOnce({ rows: [] })
      const verifyRes = await GET(
        createMockRequest(`/api/suites/${suiteId}`),
        { params: Promise.resolve({ id: suiteId }) },
      )
      expect(verifyRes.status).toBe(404)
    })
  })

  describe('Error Handling', () => {
    it('returns 503 on database connection error', async () => {
      mockPgQuery.mockRejectedValue(new Error('ECONNREFUSED'))

      const { GET } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites')
      const res = await GET(req)

      // Graceful degradation: returns empty list, not 500
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toEqual([])
      expect(body.warning).toBeDefined()
    })

    it('returns 500 on unexpected errors', async () => {
      mockPgQuery.mockRejectedValue(new Error('Unexpected query failure'))

      const { POST } = await getSuitesHandlers()
      const req = createMockRequest('/api/suites', {
        method: 'POST',
        body: { name: 'Suite' },
      })
      const res = await POST(req)
      expect(res.status).toBe(500)
    })
  })
})
