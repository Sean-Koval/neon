import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

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
            { error: 'Unauthorized', message: 'Valid authentication required' },
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

function createMockRequest(url: string): NextRequest {
  return {
    method: 'GET',
    headers: new Headers(),
    nextUrl: new URL(url, 'http://localhost:3000'),
    url: new URL(url, 'http://localhost:3000').toString(),
  } as unknown as NextRequest
}

function makeSuiteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    project_id: TEST_WORKSPACE_ID,
    name: 'Customer Support Suite',
    description: 'A suite for export testing',
    agent_module_path: 'support-agent',
    config: {
      default_scorers: ['tool_selection', 'reasoning'],
      default_min_score: 0.7,
      default_timeout_seconds: 120,
      parallel: true,
      stop_on_failure: false,
    },
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

function makeCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b0000000-0000-0000-0000-000000000001',
    suite_id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Refund request',
    description: 'Checks refund flow',
    input: { prompt: 'I want a refund' },
    expected: {
      expected_tools: ['lookup_order'],
      expected_tool_sequence: ['lookup_order', 'process_refund'],
      expected_output_contains: ['refund'],
      expected_output_pattern: 'refund.*processed',
    },
    scorers: ['tool_selection', 'reasoning', 'efficiency'],
    config: {
      min_score: 0.8,
      tags: ['refund'],
      timeout_seconds: 60,
    },
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

async function getExportHandler() {
  const mod = await import('@/app/api/suites/[id]/export/route')
  return { GET: mod.GET }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticate.mockResolvedValue(AUTH_RESULT)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Suite Export Integration', () => {
  it('exports a suite as TypeScript', async () => {
    mockPgQuery
      .mockResolvedValueOnce({ rows: [makeSuiteRow()] })
      .mockResolvedValueOnce({ rows: [makeCaseRow()] })

    const { GET } = await getExportHandler()
    const res = await GET(
      createMockRequest(
        '/api/suites/a0000000-0000-0000-0000-000000000001/export?format=typescript',
      ),
      { params: { id: 'a0000000-0000-0000-0000-000000000001' } },
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/typescript')
    expect(res.headers.get('Content-Disposition')).toContain(
      'customer-support-suite.eval.ts',
    )
    const body = await res.text()
    expect(body).toContain('defineSuite')
    expect(body).toContain('toolSelectionScorer()')
  })

  it('exports a suite as Python source', async () => {
    mockPgQuery
      .mockResolvedValueOnce({ rows: [makeSuiteRow()] })
      .mockResolvedValueOnce({ rows: [makeCaseRow()] })

    const { GET } = await getExportHandler()
    const res = await GET(
      createMockRequest(
        '/api/suites/a0000000-0000-0000-0000-000000000001/export?format=python',
      ),
      { params: { id: 'a0000000-0000-0000-0000-000000000001' } },
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/x-python')
    expect(res.headers.get('Content-Disposition')).toContain(
      'customer-support-suite.eval.py',
    )
    const body = await res.text()
    expect(body).toContain('define_suite')
    expect(body).toContain('tool_selection_scorer')
    expect(body).toContain('LLMJudgeConfig')
  })

  it('rejects unsupported export formats', async () => {
    const { GET } = await getExportHandler()
    const res = await GET(
      createMockRequest(
        '/api/suites/a0000000-0000-0000-0000-000000000001/export?format=ruby',
      ),
      { params: { id: 'a0000000-0000-0000-0000-000000000001' } },
    )

    expect(res.status).toBe(400)
  })
})
