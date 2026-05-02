/**
 * Integration Test: Debug Checkpoint Hydration API
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { AuthResult } from '@/lib/middleware/auth'

const TEST_USER = {
  id: 'user-debug-1',
  email: 'debug@example.com',
  name: 'Debug User',
}

const TEST_WORKSPACE_ID = 'ws-debug-0000-0000-0000-000000000001'

const AUTH_RESULT: AuthResult = {
  user: TEST_USER,
  workspaceId: TEST_WORKSPACE_ID,
}

vi.mock('@/lib/middleware/auth', () => ({
  withAuth: vi.fn(
    (
      handler: (
        request: NextRequest,
        auth: AuthResult,
      ) => Promise<NextResponse>,
    ) =>
      async (request: NextRequest) =>
        handler(request, AUTH_RESULT),
  ),
}))

vi.mock('@/lib/middleware/rate-limit', () => ({
  withRateLimit: vi.fn(
    (handler: (...args: unknown[]) => Promise<NextResponse>) => handler,
  ),
}))

const mockGetTraceSummary = vi.fn()

vi.mock('@/lib/db/clickhouse', () => ({
  getClickHouseClient: vi.fn(),
  traces: {
    getTraceSummary: (...args: unknown[]) => mockGetTraceSummary(...args),
  },
}))

describe('POST /api/debug/checkpoints/hydrate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetTraceSummary.mockResolvedValue({
      data: {
        trace: {
          project_id: TEST_WORKSPACE_ID,
          trace_id: 'trace-001',
          name: 'Hydrate Trace',
          timestamp: '2026-03-30T12:00:00.000Z',
          end_time: null,
          duration_ms: 42,
          status: 'ok',
          metadata: {},
          agent_id: 'agent-1',
          agent_version: 'v1',
          workflow_id: 'workflow-1',
          run_id: 'run-1',
          total_tokens: 0,
          total_cost: 0,
          llm_calls: 0,
          tool_calls: 0,
        },
        spans: [
          {
            project_id: TEST_WORKSPACE_ID,
            trace_id: 'trace-001',
            span_id: 'span-1',
            parent_span_id: null,
            name: 'agent-root',
            kind: 'internal',
            span_type: 'span',
            timestamp: '2026-03-30T12:00:00.000Z',
            end_time: '2026-03-30T12:00:01.000Z',
            duration_ms: 1000,
            status: 'ok',
            status_message: '',
            model: null,
            input_tokens: null,
            output_tokens: null,
            total_tokens: null,
            cost_usd: null,
            tool_name: null,
            attributes: {
              'neon.state_snapshots': JSON.stringify([
                {
                  snapshotId: 'snapshot-1',
                  name: 'checkpoint',
                  stateType: 'workflow',
                  checkpoint: {
                    format: 'neon.checkpoint.v1',
                    checkpointId: 'checkpoint-1',
                    snapshotId: 'snapshot-1',
                    payload: {
                      kind: 'artifact',
                      artifactId: 'artifact-1',
                      contentHash: 'sha256:abc',
                    },
                    runtime: {
                      projectId: TEST_WORKSPACE_ID,
                      traceId: 'trace-001',
                      workflowId: 'workflow-1',
                      workflowRunId: 'run-1',
                      spanId: 'span-1',
                    },
                    restore: {
                      mode: 'restore',
                      target: 'workflow',
                      entrySpanId: 'span-1',
                    },
                    integrity: {
                      schemaVersion: '1',
                      contentHash: 'sha256:abc',
                    },
                  },
                },
              ]),
            },
          },
        ],
      },
    })
  })

  afterEach(async () => {
    const { sessionStates } = await import('@/app/api/debug/stream/route')
    sessionStates.clear()
  })

  it('hydrates a trace-backed checkpoint into debug session state', async () => {
    const { POST } = await import('@/app/api/debug/checkpoints/hydrate/route')
    const { sessionStates } = await import('@/app/api/debug/stream/route')

    const request = new NextRequest(
      'http://localhost:3000/api/debug/checkpoints/hydrate',
      {
        method: 'POST',
        body: JSON.stringify({
          traceId: 'trace-001',
          checkpointId: 'checkpoint-1',
          mode: 'replay',
        }),
      },
    )

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockGetTraceSummary).toHaveBeenCalledWith(
      TEST_WORKSPACE_ID,
      'trace-001',
    )
    expect(body.success).toBe(true)
    expect(body.checkpoint.manifest.restore.mode).toBe('replay')
    expect(body.sessionState.hydratedFrom.checkpointId).toBe('checkpoint-1')
    expect(body.sessionState.currentSpanId).toBe('span-1')

    const session = sessionStates.get('trace-001')
    expect(session?.state).toBe('paused')
    expect(session?.hydratedFrom?.requestedMode).toBe('replay')
  })

  it('returns 404 when the requested checkpoint is missing', async () => {
    const { POST } = await import('@/app/api/debug/checkpoints/hydrate/route')

    const request = new NextRequest(
      'http://localhost:3000/api/debug/checkpoints/hydrate',
      {
        method: 'POST',
        body: JSON.stringify({
          traceId: 'trace-001',
          checkpointId: 'missing-checkpoint',
        }),
      },
    )

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Checkpoint not found for trace')
  })
})
