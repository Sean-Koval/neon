/**
 * Alert Rules API Tests
 *
 * Tests the /api/alerts/rules endpoint:
 * - GET: list rules
 * - POST: create/update rules
 * - DELETE: remove rules
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest } from 'next/server'

// =============================================================================
// Mocks
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
// Helpers
// =============================================================================

function createMockRequest(
  url: string,
  options: { method?: string; body?: unknown } = {},
): NextRequest {
  const { method = 'GET', body } = options
  return {
    method,
    headers: new Headers(),
    nextUrl: new URL(url, 'http://localhost:3000'),
    url: new URL(url, 'http://localhost:3000').toString(),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest
}

// =============================================================================
// Tests
// =============================================================================

describe('Alert Rules API', () => {
  // Use dynamic imports to get fresh module for each test
  // Note: since the route uses a module-level singleton, rules persist across tests
  // within the same module import. This is intentional for testing lifecycle.

  let GET: (req: NextRequest) => Promise<Response>
  let POST: (req: NextRequest) => Promise<Response>
  let DELETE: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    const mod = await import('@/app/api/alerts/rules/route')
    GET = mod.GET
    POST = mod.POST
    DELETE = mod.DELETE
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/alerts/rules', () => {
    it('returns default alert rules', async () => {
      const res = await GET(createMockRequest('/api/alerts/rules'))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.items.length).toBeGreaterThanOrEqual(5) // 5 default rules
      expect(body.count).toBeGreaterThanOrEqual(5)

      // Check rule shape
      const rule = body.items[0]
      expect(rule).toHaveProperty('id')
      expect(rule).toHaveProperty('name')
      expect(rule).toHaveProperty('metric')
      expect(rule).toHaveProperty('threshold')
      expect(rule).toHaveProperty('state')
    })

    it('filters by severity', async () => {
      const res = await GET(createMockRequest('/api/alerts/rules?severity=critical'))
      const body = await res.json()

      for (const rule of body.items) {
        expect(rule.severity).toBe('critical')
      }
    })

    it('filters by enabled state', async () => {
      const res = await GET(createMockRequest('/api/alerts/rules?enabled=true'))
      const body = await res.json()

      for (const rule of body.items) {
        expect(rule.enabled).toBe(true)
      }
    })

    it('includes firing count', async () => {
      const res = await GET(createMockRequest('/api/alerts/rules'))
      const body = await res.json()
      expect(body).toHaveProperty('firing')
      expect(typeof body.firing).toBe('number')
    })
  })

  describe('POST /api/alerts/rules', () => {
    it('creates a new alert rule', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: {
          name: 'Custom Rule',
          metric: 'custom.metric',
          operator: 'gt',
          threshold: 42,
          severity: 'info',
        },
      }))

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('Custom Rule')
      expect(body.metric).toBe('custom.metric')
      expect(body.threshold).toBe(42)
      expect(body.id).toBeDefined()
      expect(body.state).toBeDefined()
    })

    it('updates an existing rule when id matches', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: {
          id: 'api-error-rate', // existing default rule
          name: 'Updated Error Rate',
          metric: 'api.error_rate',
          operator: 'gt',
          threshold: 0.1, // changed from 0.05
        },
      }))

      expect(res.status).toBe(200) // 200 for update, not 201
      const body = await res.json()
      expect(body.threshold).toBe(0.1)
      expect(body.name).toBe('Updated Error Rate')
    })

    it('rejects missing name', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: { metric: 'test', operator: 'gt', threshold: 1 },
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('name')
    })

    it('rejects missing metric', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: { name: 'Test', operator: 'gt', threshold: 1 },
      }))
      expect(res.status).toBe(400)
    })

    it('rejects missing threshold', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: { name: 'Test', metric: 'test', operator: 'gt' },
      }))
      expect(res.status).toBe(400)
    })

    it('rejects invalid operator', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: { name: 'Test', metric: 'test', operator: 'invalid', threshold: 1 },
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('operator')
    })

    it('rejects invalid severity', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: { name: 'Test', metric: 'test', operator: 'gt', threshold: 1, severity: 'extreme' },
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('severity')
    })

    it('uses defaults for optional fields', async () => {
      const res = await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: {
          name: 'Minimal Rule',
          metric: 'minimal.metric',
          operator: 'gt',
          threshold: 50,
        },
      }))

      const body = await res.json()
      expect(body.severity).toBe('warning')
      expect(body.enabled).toBe(true)
      expect(body.windowSeconds).toBe(300)
      expect(body.consecutiveBreaches).toBe(1)
    })
  })

  describe('DELETE /api/alerts/rules', () => {
    it('deletes an existing rule', async () => {
      // First create a rule to delete
      await POST(createMockRequest('/api/alerts/rules', {
        method: 'POST',
        body: {
          id: 'to-delete',
          name: 'Delete Me',
          metric: 'delete.metric',
          operator: 'gt',
          threshold: 1,
        },
      }))

      const res = await DELETE(createMockRequest('/api/alerts/rules?id=to-delete', { method: 'DELETE' }))
      expect(res.status).toBe(204)

      // Verify it's gone from the list
      const listRes = await GET(createMockRequest('/api/alerts/rules'))
      const body = await listRes.json()
      const ids = body.items.map((r: { id: string }) => r.id)
      expect(ids).not.toContain('to-delete')
    })

    it('returns 404 for nonexistent rule', async () => {
      const res = await DELETE(createMockRequest('/api/alerts/rules?id=nonexistent', { method: 'DELETE' }))
      expect(res.status).toBe(404)
    })

    it('returns 400 when id is missing', async () => {
      const res = await DELETE(createMockRequest('/api/alerts/rules', { method: 'DELETE' }))
      expect(res.status).toBe(400)
    })
  })
})
