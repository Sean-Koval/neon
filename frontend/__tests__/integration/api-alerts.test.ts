/**
 * Integration Test: Alerts API
 *
 * Tests the alerts API end-to-end:
 * GET /api/alerts - Regression detection from runs
 * POST /api/alerts - Save thresholds
 * GET /api/alerts/rules - List alert rules
 * POST /api/alerts/rules - Create/update alert rules
 * DELETE /api/alerts/rules - Remove alert rules
 *
 * Mocks PostgreSQL and auth to test route handlers without infrastructure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USER = {
  id: 'user-alert-0000-0000-0000-000000000001',
  email: 'alert@example.com',
  name: 'Alert User',
}

const TEST_WORKSPACE_ID = 'ws-alert-0000-0000-0000-000000000001'

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

const mockPoolQuery = vi.fn()

vi.mock('pg', () => {
  return {
    Pool: class MockPool {
      query = (...args: unknown[]) => mockPoolQuery(...args)
      on = vi.fn()
      end = vi.fn()
    },
  }
})

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

function makeCompletedRun(
  id: string,
  suiteId: string,
  suiteName: string,
  avgScore: number,
  createdAt = new Date().toISOString(),
) {
  return {
    id,
    suite_id: suiteId,
    suite_name: suiteName,
    project_id: TEST_WORKSPACE_ID,
    agent_version: 'v1',
    status: 'completed',
    config: {},
    started_at: createdAt,
    completed_at: createdAt,
    created_at: createdAt,
  }
}

// Dynamic import helpers to get fresh route handlers
async function getAlertsHandlers() {
  return await import('@/app/api/alerts/route')
}

async function getAlertRulesHandlers() {
  return await import('@/app/api/alerts/rules/route')
}

// =============================================================================
// Tests
// =============================================================================

describe('Alerts API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticate.mockResolvedValue(AUTH_RESULT)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // GET /api/alerts
  // ---------------------------------------------------------------------------

  describe('GET /api/alerts', () => {
    it('returns alerts and thresholds for authenticated user', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [
          makeCompletedRun('run-1', 'suite-1', 'Test Suite', 0.85),
          makeCompletedRun('run-2', 'suite-1', 'Test Suite', 0.90),
        ],
      })

      const { GET } = await getAlertsHandlers()
      const res = await GET(createMockRequest('/api/alerts'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toHaveProperty('alerts')
      expect(body).toHaveProperty('thresholds')
      expect(Array.isArray(body.alerts)).toBe(true)
      expect(Array.isArray(body.thresholds)).toBe(true)
    })

    it('returns 401 when unauthenticated', async () => {
      mockAuthenticate.mockResolvedValue(null)

      const { GET } = await getAlertsHandlers()
      const res = await GET(createMockRequest('/api/alerts'))

      expect(res.status).toBe(401)
    })

    it('returns 400 when workspace context is missing', async () => {
      mockAuthenticate.mockResolvedValue({
        user: TEST_USER,
        workspaceId: undefined,
      } as unknown as AuthResult)

      const { GET } = await getAlertsHandlers()
      const res = await GET(createMockRequest('/api/alerts'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('Workspace context required')
    })

    it('returns empty alerts when no regressions detected', async () => {
      // All runs have good scores - no regression
      mockPoolQuery.mockResolvedValue({
        rows: [
          makeCompletedRun('run-1', 'suite-1', 'Test Suite', 0.95),
          makeCompletedRun('run-2', 'suite-1', 'Test Suite', 0.92),
          makeCompletedRun('run-3', 'suite-1', 'Test Suite', 0.90),
        ],
      })

      const { GET } = await getAlertsHandlers()
      const res = await GET(createMockRequest('/api/alerts'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.alerts).toHaveLength(0)
    })

    it('gracefully handles database connection errors', async () => {
      mockPoolQuery.mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:5432'),
      )

      const { GET } = await getAlertsHandlers()
      const res = await GET(createMockRequest('/api/alerts'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.alerts).toEqual([])
      expect(body.thresholds).toEqual([])
      expect(body.warning).toBe('Database not available')
    })

    it('returns default thresholds when none are configured', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [makeCompletedRun('run-1', 'suite-1', 'Test Suite', 0.85)],
      })

      const { GET } = await getAlertsHandlers()
      const res = await GET(createMockRequest('/api/alerts'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.thresholds.length).toBeGreaterThan(0)
      expect(body.thresholds[0]).toHaveProperty('suiteId', 'suite-1')
    })

    it('includes ruleAlerts from alert rule evaluation', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [makeCompletedRun('run-1', 'suite-1', 'Test Suite', 0.85)],
      })

      const { GET } = await getAlertsHandlers()
      const res = await GET(createMockRequest('/api/alerts'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toHaveProperty('ruleAlerts')
      expect(body.ruleAlerts).toHaveProperty('firing')
      expect(body.ruleAlerts).toHaveProperty('notifications')
    })
  })

  // ---------------------------------------------------------------------------
  // POST /api/alerts
  // ---------------------------------------------------------------------------

  describe('POST /api/alerts', () => {
    it('saves threshold for a suite', async () => {
      const { POST } = await getAlertsHandlers()
      const res = await POST(
        createMockRequest('/api/alerts', {
          method: 'POST',
          body: {
            suiteId: 'suite-1',
            absoluteMin: 0.6,
            dropPercent: 0.15,
            windowSize: 10,
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.threshold).toBeDefined()
      expect(body.threshold.suiteId).toBe('suite-1')
      expect(body.threshold.absoluteMin).toBe(0.6)
      expect(body.threshold.dropPercent).toBe(0.15)
      expect(body.threshold.windowSize).toBe(10)
    })

    it('returns 400 when suiteId is missing', async () => {
      const { POST } = await getAlertsHandlers()
      const res = await POST(
        createMockRequest('/api/alerts', {
          method: 'POST',
          body: { absoluteMin: 0.5 },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('suiteId is required')
    })

    it('clamps threshold values to valid ranges', async () => {
      const { POST } = await getAlertsHandlers()
      const res = await POST(
        createMockRequest('/api/alerts', {
          method: 'POST',
          body: {
            suiteId: 'suite-clamp',
            absoluteMin: 5, // should be clamped to 1
            dropPercent: -1, // should be clamped to 0
            windowSize: 100, // should be clamped to 50
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.threshold.absoluteMin).toBe(1)
      expect(body.threshold.dropPercent).toBe(0)
      expect(body.threshold.windowSize).toBe(50)
    })

    it('returns 401 when unauthenticated', async () => {
      mockAuthenticate.mockResolvedValue(null)

      const { POST } = await getAlertsHandlers()
      const res = await POST(
        createMockRequest('/api/alerts', {
          method: 'POST',
          body: { suiteId: 'suite-1', absoluteMin: 0.5 },
        }),
      )

      expect(res.status).toBe(401)
    })
  })

  // ---------------------------------------------------------------------------
  // GET /api/alerts/rules
  // ---------------------------------------------------------------------------

  describe('GET /api/alerts/rules', () => {
    it('returns default alert rules', async () => {
      const { GET } = await getAlertRulesHandlers()
      const res = await GET(createMockRequest('/api/alerts/rules'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toHaveProperty('items')
      expect(body).toHaveProperty('count')
      expect(body.items.length).toBeGreaterThan(0)
      // Default rules include api-error-rate, api-p95-latency, etc.
      const ruleIds = body.items.map((r: { id: string }) => r.id)
      expect(ruleIds).toContain('api-error-rate')
      expect(ruleIds).toContain('eval-score-low')
    })

    it('filters by severity', async () => {
      const { GET } = await getAlertRulesHandlers()
      const res = await GET(
        createMockRequest('/api/alerts/rules?severity=critical'),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      for (const rule of body.items) {
        expect(rule.severity).toBe('critical')
      }
    })

    it('filters by enabled state', async () => {
      const { GET } = await getAlertRulesHandlers()
      const res = await GET(
        createMockRequest('/api/alerts/rules?enabled=true'),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      for (const rule of body.items) {
        expect(rule.enabled).toBe(true)
      }
    })

    it('includes alert state for each rule', async () => {
      const { GET } = await getAlertRulesHandlers()
      const res = await GET(createMockRequest('/api/alerts/rules'))
      const body = await res.json()

      expect(res.status).toBe(200)
      for (const rule of body.items) {
        expect(rule).toHaveProperty('state')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // POST /api/alerts/rules
  // ---------------------------------------------------------------------------

  describe('POST /api/alerts/rules', () => {
    it('creates a new alert rule', async () => {
      const { POST } = await getAlertRulesHandlers()
      const res = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            name: 'Custom Rule',
            metric: 'eval.avg_score',
            operator: 'lt',
            threshold: 0.5,
            severity: 'critical',
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.name).toBe('Custom Rule')
      expect(body.metric).toBe('eval.avg_score')
      expect(body.operator).toBe('lt')
      expect(body.threshold).toBe(0.5)
      expect(body.severity).toBe('critical')
      expect(body.id).toBeDefined()
    })

    it('returns 400 when name is missing', async () => {
      const { POST } = await getAlertRulesHandlers()
      const res = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            metric: 'eval.avg_score',
            operator: 'lt',
            threshold: 0.5,
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('name is required')
    })

    it('returns 400 when metric is missing', async () => {
      const { POST } = await getAlertRulesHandlers()
      const res = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            name: 'Bad Rule',
            operator: 'lt',
            threshold: 0.5,
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('metric is required')
    })

    it('returns 400 for invalid operator', async () => {
      const { POST } = await getAlertRulesHandlers()
      const res = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            name: 'Bad Rule',
            metric: 'eval.avg_score',
            operator: 'notAnOperator',
            threshold: 0.5,
          },
        }),
      )
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('operator must be one of')
    })

    it('updates existing rule when id is provided', async () => {
      const { POST, GET } = await getAlertRulesHandlers()

      // Create a rule first
      const createRes = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            name: 'Update Me',
            metric: 'eval.avg_score',
            operator: 'lt',
            threshold: 0.5,
          },
        }),
      )
      const created = await createRes.json()

      // Update the rule
      const updateRes = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            id: created.id,
            name: 'Updated Rule',
            metric: 'eval.avg_score',
            operator: 'lt',
            threshold: 0.3,
          },
        }),
      )

      expect(updateRes.status).toBe(200)
      const updated = await updateRes.json()
      expect(updated.name).toBe('Updated Rule')
      expect(updated.threshold).toBe(0.3)
    })
  })

  // ---------------------------------------------------------------------------
  // DELETE /api/alerts/rules
  // ---------------------------------------------------------------------------

  describe('DELETE /api/alerts/rules', () => {
    it('deletes an existing rule', async () => {
      const { POST, DELETE, GET } = await getAlertRulesHandlers()

      // Create a rule
      const createRes = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            name: 'Delete Me',
            metric: 'eval.avg_score',
            operator: 'lt',
            threshold: 0.5,
          },
        }),
      )
      const created = await createRes.json()

      // Delete it
      const deleteRes = await DELETE(
        createMockRequest(`/api/alerts/rules?id=${created.id}`, {
          method: 'DELETE',
        }),
      )

      expect(deleteRes.status).toBe(204)
    })

    it('returns 400 when id is missing', async () => {
      const { DELETE } = await getAlertRulesHandlers()
      const res = await DELETE(
        createMockRequest('/api/alerts/rules', { method: 'DELETE' }),
      )
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('id query parameter is required')
    })

    it('returns 404 for non-existent rule', async () => {
      const { DELETE } = await getAlertRulesHandlers()
      const res = await DELETE(
        createMockRequest('/api/alerts/rules?id=non-existent', {
          method: 'DELETE',
        }),
      )

      expect(res.status).toBe(404)
    })
  })

  // ---------------------------------------------------------------------------
  // Full Flow: Create Rule -> Verify in List -> Delete -> Verify Gone
  // ---------------------------------------------------------------------------

  describe('Full CRUD lifecycle', () => {
    it('creates, lists, and deletes a rule end-to-end', async () => {
      const { POST, GET, DELETE } = await getAlertRulesHandlers()

      // Step 1: Create a new rule
      const createRes = await POST(
        createMockRequest('/api/alerts/rules', {
          method: 'POST',
          body: {
            name: 'Lifecycle Rule',
            metric: 'api.error_rate',
            operator: 'gt',
            threshold: 0.1,
            severity: 'warning',
            windowSeconds: 600,
            consecutiveBreaches: 2,
          },
        }),
      )
      const created = await createRes.json()
      expect(createRes.status).toBe(201)
      expect(created.id).toBeDefined()

      // Step 2: Verify it appears in the list
      const listRes = await GET(createMockRequest('/api/alerts/rules'))
      const listed = await listRes.json()
      const found = listed.items.find(
        (r: { id: string }) => r.id === created.id,
      )
      expect(found).toBeDefined()
      expect(found.name).toBe('Lifecycle Rule')
      expect(found.consecutiveBreaches).toBe(2)

      // Step 3: Delete the rule
      const deleteRes = await DELETE(
        createMockRequest(`/api/alerts/rules?id=${created.id}`, {
          method: 'DELETE',
        }),
      )
      expect(deleteRes.status).toBe(204)

      // Step 4: Verify it's gone
      const listRes2 = await GET(createMockRequest('/api/alerts/rules'))
      const listed2 = await listRes2.json()
      const notFound = listed2.items.find(
        (r: { id: string }) => r.id === created.id,
      )
      expect(notFound).toBeUndefined()
    })
  })
})
