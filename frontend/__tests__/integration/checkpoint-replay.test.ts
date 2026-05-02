/**
 * Integration Test: Checkpoint persistence and replay
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest, NextResponse } from 'next/server'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'

import type { AuthResult } from '@/lib/middleware/auth'

const TEST_WORKSPACE_ID = 'ws-checkpoint-0000-0000-0000-000000000001'
const AUTH_RESULT: AuthResult = {
  user: {
    id: 'user-checkpoint-0000-0000-0000-000000000001',
    email: 'checkpoint@example.com',
    name: 'Checkpoint User',
  },
  workspaceId: TEST_WORKSPACE_ID,
}

const mockAuthenticate = vi.fn<() => Promise<AuthResult | null>>()
const mockStartWorkflowFromCheckpoint = vi.fn()

vi.mock('@/lib/middleware/auth', () => ({
  withAuth: vi.fn(
    (
      handler: (
        request: NextRequest,
        auth: AuthResult,
        ...args: unknown[]
      ) => Promise<NextResponse>,
    ) =>
      async (request: NextRequest, ...args: unknown[]) => {
        const auth = await mockAuthenticate()
        if (!auth) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return handler(request, auth, ...args)
      },
  ),
}))

vi.mock('@/lib/middleware/rate-limit', () => ({
  withRateLimit: vi.fn((handler: unknown) => handler),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/temporal', () => ({
  startWorkflowFromCheckpoint: (...args: unknown[]) =>
    mockStartWorkflowFromCheckpoint(...args),
}))

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

async function getCheckpointHandlers() {
  const mod = await import('@/app/api/checkpoints/route')
  return { POST: mod.POST }
}

async function getCheckpointDetailHandlers() {
  const mod = await import('@/app/api/checkpoints/[id]/route')
  return { GET: mod.GET }
}

async function getCheckpointReplayHandlers() {
  const mod = await import('@/app/api/checkpoints/[id]/replay/route')
  return { POST: mod.POST }
}

describe('Checkpoint replay integration', () => {
  let checkpointDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthenticate.mockResolvedValue(AUTH_RESULT)
    mockStartWorkflowFromCheckpoint.mockResolvedValue({
      workflowId: 'agent-replay-ws-1',
      runId: 'run-replay-1',
    })
    checkpointDir = await mkdtemp(path.join(os.tmpdir(), 'neon-checkpoints-'))
    process.env.NEON_CHECKPOINT_DIR = checkpointDir
  })

  afterEach(async () => {
    delete process.env.NEON_CHECKPOINT_DIR
    if (checkpointDir) {
      await rm(checkpointDir, { recursive: true, force: true })
    }
  })

  it('persists and reads an agent checkpoint body', async () => {
    const { POST } = await getCheckpointHandlers()
    const createReq = createMockRequest('/api/checkpoints', {
      method: 'POST',
      body: {
        traceId: 'trace-checkpoint-1',
        agentId: 'agent-1',
        agentVersion: 'v1',
        input: { query: 'What is 2+2?' },
        state: {
          iteration: 1,
          maxIterations: 10,
          status: 'running',
          messages: [{ role: 'user', content: '{"query":"What is 2+2?"}' }],
          requireApproval: false,
          tools: [{ name: 'calculator', description: 'Math tool', parameters: {} }],
        },
        manifest: {
          format: 'neon.checkpoint.v1',
          checkpointId: 'checkpoint-1',
          snapshotId: 'checkpoint-1',
          name: 'iteration-1',
          stateType: 'agent_run',
          runtime: {
            projectId: TEST_WORKSPACE_ID,
            traceId: 'trace-checkpoint-1',
            workflowId: 'wf-1',
            workflowRunId: 'run-1',
            capturedAt: '2026-03-30T00:00:00.000Z',
            sequence: 1,
          },
          restore: {
            mode: 'replay',
            target: 'workflow',
            requiresApproval: false,
            replaysSideEffects: true,
          },
          integrity: {
            schemaVersion: '1',
          },
        },
      },
    })

    const createRes = await POST(createReq)
    expect(createRes.status).toBe(200)
    const created = await createRes.json()
    expect(created.manifest.payload.uri).toBe('/api/checkpoints/checkpoint-1')

    const { GET } = await getCheckpointDetailHandlers()
    const getReq = createMockRequest('/api/checkpoints/checkpoint-1')
    const getRes = await GET(getReq, {
      params: Promise.resolve({ id: 'checkpoint-1' }),
    })

    expect(getRes.status).toBe(200)
    const fetched = await getRes.json()
    expect(fetched.envelope.traceId).toBe('trace-checkpoint-1')
    expect(fetched.envelope.state.iteration).toBe(1)
  })

  it('starts a replay workflow from a persisted checkpoint', async () => {
    const { POST: createCheckpoint } = await getCheckpointHandlers()
    await createCheckpoint(
      createMockRequest('/api/checkpoints', {
        method: 'POST',
        body: {
          traceId: 'trace-checkpoint-2',
          agentId: 'agent-2',
          agentVersion: 'v2',
          input: { task: 'Summarize' },
          state: {
            iteration: 2,
            maxIterations: 8,
            status: 'running',
            messages: [
              { role: 'user', content: '{"task":"Summarize"}' },
              { role: 'assistant', content: 'Drafting summary.' },
            ],
            requireApproval: true,
            tools: [{ name: 'search', description: 'Search tool', parameters: {} }],
          },
          manifest: {
            format: 'neon.checkpoint.v1',
            checkpointId: 'checkpoint-replay-1',
            snapshotId: 'checkpoint-replay-1',
            name: 'iteration-2',
            stateType: 'agent_run',
            runtime: {
              projectId: TEST_WORKSPACE_ID,
              traceId: 'trace-checkpoint-2',
              workflowId: 'wf-2',
              workflowRunId: 'run-2',
              capturedAt: '2026-03-30T00:00:00.000Z',
              sequence: 2,
            },
            restore: {
              mode: 'replay',
              target: 'workflow',
              requiresApproval: true,
              replaysSideEffects: true,
            },
            integrity: {
              schemaVersion: '1',
            },
          },
        },
      }),
    )

    const { POST } = await getCheckpointReplayHandlers()
    const replayRes = await POST(
      createMockRequest('/api/checkpoints/checkpoint-replay-1/replay', {
        method: 'POST',
        body: {
          mode: 'replay',
          overrides: {
            maxIterations: 12,
          },
        },
      }),
      {
        params: Promise.resolve({ id: 'checkpoint-replay-1' }),
      },
    )

    expect(replayRes.status).toBe(200)
    const replayBody = await replayRes.json()
    expect(replayBody.workflowId).toBe('agent-replay-ws-1')
    expect(replayBody.kind).toBe('agent_run')
    expect(replayBody.workflowName).toBe('agentRunWorkflow')
    expect(mockStartWorkflowFromCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'agent_run',
        workflowName: 'agentRunWorkflow',
        checkpointId: 'checkpoint-replay-1',
        sourceTraceId: 'trace-checkpoint-2',
        mode: 'replay',
        workflowId: expect.stringContaining(
          `agent-replay-${TEST_WORKSPACE_ID}-checkpoint-replay-1-`,
        ),
        args: [
          expect.objectContaining({
            projectId: TEST_WORKSPACE_ID,
            agentId: 'agent-2',
            maxIterations: 12,
            restoreFrom: expect.objectContaining({
              checkpointId: 'checkpoint-replay-1',
              traceId: 'trace-checkpoint-2',
              mode: 'replay',
            }),
            restoredCheckpoint: expect.objectContaining({
              checkpointId: 'checkpoint-replay-1',
            }),
          }),
        ],
        memo: expect.objectContaining({
          checkpointId: 'checkpoint-replay-1',
          sourceTraceId: 'trace-checkpoint-2',
          replayMode: 'replay',
        }),
      }),
    )
  })

  it('returns 422 for unsupported checkpoint kinds', async () => {
    const { POST: createCheckpoint } = await getCheckpointHandlers()
    await createCheckpoint(
      createMockRequest('/api/checkpoints', {
        method: 'POST',
        body: {
          traceId: 'trace-checkpoint-unsupported',
          agentId: 'agent-unsupported',
          agentVersion: 'v1',
          input: { task: 'Unsupported replay' },
          state: {
            iteration: 1,
            maxIterations: 4,
            status: 'running',
            messages: [{ role: 'user', content: '{"task":"Unsupported replay"}' }],
            requireApproval: false,
            tools: [],
          },
          manifest: {
            format: 'neon.checkpoint.v1',
            checkpointId: 'checkpoint-unsupported',
            snapshotId: 'checkpoint-unsupported',
            name: 'unsupported',
            stateType: 'agent_run',
            runtime: {
              projectId: TEST_WORKSPACE_ID,
              traceId: 'trace-checkpoint-unsupported',
              workflowId: 'wf-unsupported',
              workflowRunId: 'run-unsupported',
              capturedAt: '2026-03-30T00:00:00.000Z',
              sequence: 1,
            },
            restore: {
              mode: 'replay',
              target: 'workflow',
              requiresApproval: false,
              replaysSideEffects: true,
            },
            integrity: {
              schemaVersion: '1',
            },
          },
        },
      }),
    )

    const storedPath = path.join(
      checkpointDir,
      TEST_WORKSPACE_ID,
      'checkpoint-unsupported.json',
    )
    const rawStored = await readFile(storedPath, 'utf8')
    const stored = JSON.parse(rawStored) as {
      manifest: Record<string, unknown>
      envelope: Record<string, unknown>
    }
    stored.envelope.kind = 'optimization_loop'
    await writeFile(storedPath, JSON.stringify(stored, null, 2), 'utf8')

    const { POST } = await getCheckpointReplayHandlers()
    const replayRes = await POST(createMockRequest('/api/checkpoints/checkpoint-unsupported/replay', {
      method: 'POST',
      body: { mode: 'replay' },
    }), {
      params: Promise.resolve({ id: 'checkpoint-unsupported' }),
    })

    expect(replayRes.status).toBe(422)
    const replayBody = await replayRes.json()
    expect(replayBody.error).toContain('does not support runtime restore yet')
    expect(replayBody.kind).toBe('optimization_loop')
    expect(mockStartWorkflowFromCheckpoint).not.toHaveBeenCalled()
  })

  it('starts an eval-case restore workflow from a persisted checkpoint', async () => {
    const { POST: createCheckpoint } = await getCheckpointHandlers()
    await createCheckpoint(
      createMockRequest('/api/checkpoints', {
        method: 'POST',
        body: {
          kind: 'eval_case',
          traceId: 'trace-eval-case-1',
          caseId: 'case-1',
          runId: 'eval-run-1',
          agentId: 'agent-eval',
          agentVersion: 'eval-v1',
          input: {
            caseId: 'case-1',
            runId: 'eval-run-1',
            projectId: TEST_WORKSPACE_ID,
            agentId: 'agent-eval',
            agentVersion: 'eval-v1',
            input: { prompt: 'Rate this answer' },
            expected: { rating: 'good' },
            tools: [{ name: 'search', description: 'Search tool', parameters: {} }],
            scorers: ['accuracy'],
            mode: 'full',
            maxIterations: 6,
          },
          state: {
            status: 'scoring',
            agentResult: {
              traceId: 'trace-eval-agent-1',
              status: 'completed',
              output: 'Looks good',
              iterations: 2,
            },
            scores: [],
          },
          manifest: {
            format: 'neon.checkpoint.v1',
            checkpointId: 'checkpoint-eval-case-1',
            snapshotId: 'checkpoint-eval-case-1',
            name: 'scoring',
            stateType: 'eval_case',
            runtime: {
              projectId: TEST_WORKSPACE_ID,
              traceId: 'trace-eval-case-1',
              workflowId: 'wf-eval-case-1',
              workflowRunId: 'run-eval-case-1',
              agentId: 'agent-eval',
              agentVersion: 'eval-v1',
              capturedAt: '2026-03-30T00:00:00.000Z',
              sequence: 3,
            },
            restore: {
              mode: 'restore',
              target: 'workflow',
              requiresApproval: false,
              replaysSideEffects: true,
            },
            integrity: {
              schemaVersion: '1',
            },
          },
        },
      }),
    )

    const { POST } = await getCheckpointReplayHandlers()
    const replayRes = await POST(
      createMockRequest('/api/checkpoints/checkpoint-eval-case-1/replay', {
        method: 'POST',
        body: { mode: 'restore' },
      }),
      {
        params: Promise.resolve({ id: 'checkpoint-eval-case-1' }),
      },
    )

    expect(replayRes.status).toBe(200)
    const replayBody = await replayRes.json()
    expect(replayBody.kind).toBe('eval_case')
    expect(replayBody.workflowName).toBe('evalCaseWorkflow')
    expect(replayBody.mode).toBe('restore')
    expect(mockStartWorkflowFromCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'eval_case',
        workflowName: 'evalCaseWorkflow',
        checkpointId: 'checkpoint-eval-case-1',
        sourceTraceId: 'trace-eval-case-1',
        mode: 'restore',
        workflowId: expect.stringContaining(
          `eval-case-replay-${TEST_WORKSPACE_ID}-checkpoint-eval-case-1-`,
        ),
        args: [
          expect.objectContaining({
            caseId: 'case-1',
            runId: 'eval-run-1',
            projectId: TEST_WORKSPACE_ID,
            agentId: 'agent-eval',
            restoreFrom: expect.objectContaining({
              checkpointId: 'checkpoint-eval-case-1',
              traceId: 'trace-eval-case-1',
              mode: 'restore',
            }),
            restoredCheckpoint: expect.objectContaining({
              checkpointId: 'checkpoint-eval-case-1',
              kind: 'eval_case',
            }),
          }),
        ],
      }),
    )
  })

  it('starts an eval-run restore workflow from a persisted checkpoint', async () => {
    const { POST: createCheckpoint } = await getCheckpointHandlers()
    await createCheckpoint(
      createMockRequest('/api/checkpoints', {
        method: 'POST',
        body: {
          kind: 'eval_run',
          traceId: 'trace-eval-run-1',
          runId: 'eval-run-1',
          agentId: 'agent-eval-run',
          agentVersion: 'eval-run-v1',
          input: {
            runId: 'eval-run-1',
            projectId: TEST_WORKSPACE_ID,
            agentId: 'agent-eval-run',
            agentVersion: 'eval-run-v1',
            dataset: {
              items: [
                { input: { prompt: 'first' }, expected: { output: 'a' } },
                { input: { prompt: 'second' }, expected: { output: 'b' } },
              ],
            },
            tools: [{ name: 'search', description: 'Search tool', parameters: {} }],
            scorers: ['accuracy'],
          },
          state: {
            status: 'running',
            completed: 1,
            total: 2,
            passed: 1,
            failed: 0,
            nextCaseIndex: 1,
            results: [
              {
                caseIndex: 0,
                result: {
                  traceId: 'trace-eval-run-case-0',
                  status: 'completed',
                  iterations: 2,
                  output: 'done',
                },
                scores: [{ name: 'accuracy', value: 1, reason: 'pass' }],
              },
            ],
          },
          manifest: {
            format: 'neon.checkpoint.v1',
            checkpointId: 'checkpoint-eval-run-1',
            snapshotId: 'checkpoint-eval-run-1',
            name: 'case-0-complete',
            stateType: 'eval_run',
            runtime: {
              projectId: TEST_WORKSPACE_ID,
              traceId: 'trace-eval-run-1',
              workflowId: 'wf-eval-run-1',
              workflowRunId: 'run-eval-run-1',
              agentId: 'agent-eval-run',
              agentVersion: 'eval-run-v1',
              capturedAt: '2026-03-30T00:00:00.000Z',
              sequence: 2,
            },
            restore: {
              mode: 'restore',
              target: 'workflow',
              requiresApproval: false,
              replaysSideEffects: true,
            },
            integrity: {
              schemaVersion: '1',
            },
          },
        },
      }),
    )

    const { POST } = await getCheckpointReplayHandlers()
    const replayRes = await POST(
      createMockRequest('/api/checkpoints/checkpoint-eval-run-1/replay', {
        method: 'POST',
        body: { mode: 'restore' },
      }),
      {
        params: Promise.resolve({ id: 'checkpoint-eval-run-1' }),
      },
    )

    expect(replayRes.status).toBe(200)
    const replayBody = await replayRes.json()
    expect(replayBody.kind).toBe('eval_run')
    expect(replayBody.workflowName).toBe('evalRunWorkflow')
    expect(replayBody.mode).toBe('restore')
    expect(mockStartWorkflowFromCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'eval_run',
        workflowName: 'evalRunWorkflow',
        checkpointId: 'checkpoint-eval-run-1',
        sourceTraceId: 'trace-eval-run-1',
        mode: 'restore',
        workflowId: expect.stringContaining(
          `eval-run-replay-${TEST_WORKSPACE_ID}-checkpoint-eval-run-1-`,
        ),
        args: [
          expect.objectContaining({
            runId: expect.stringContaining('eval-run-1-restore-'),
            projectId: TEST_WORKSPACE_ID,
            agentId: 'agent-eval-run',
            restoreFrom: expect.objectContaining({
              checkpointId: 'checkpoint-eval-run-1',
              traceId: 'trace-eval-run-1',
              mode: 'restore',
            }),
            restoredCheckpoint: expect.objectContaining({
              checkpointId: 'checkpoint-eval-run-1',
              kind: 'eval_run',
            }),
          }),
        ],
        memo: expect.objectContaining({
          checkpointId: 'checkpoint-eval-run-1',
          sourceTraceId: 'trace-eval-run-1',
          replayMode: 'restore',
          sourceRunId: 'eval-run-1',
        }),
      }),
    )
  })

  it('starts a progressive-rollout restore workflow from a persisted checkpoint', async () => {
    const { POST: createCheckpoint } = await getCheckpointHandlers()
    await createCheckpoint(
      createMockRequest('/api/checkpoints', {
        method: 'POST',
        body: {
          kind: 'progressive_rollout',
          traceId: 'trace-rollout-1',
          rolloutId: 'rollout-source-1',
          input: {
            rolloutId: 'rollout-source-1',
            projectId: TEST_WORKSPACE_ID,
            currentAgent: {
              agentId: 'agent-current',
              agentVersion: 'v1',
              tools: [],
            },
            newAgent: {
              agentId: 'agent-candidate',
              agentVersion: 'v2',
              tools: [{ name: 'search', description: 'Search tool', parameters: {} }],
            },
            dataset: {
              items: [{ input: { prompt: 'hello' }, expected: { output: 'hi' } }],
            },
            scorers: ['accuracy'],
            stages: [10, 25, 50, 100],
            minimumScore: 0.7,
            stageDurationMs: 1000,
          },
          state: {
            status: 'running',
            currentStageIndex: 1,
            currentPercentage: 25,
            stages: [10, 25, 50, 100],
            scores: [0.81, 0.79],
            stageResults: [
              {
                stage: 0,
                percentage: 10,
                score: 0.81,
                passed: true,
                runId: 'rollout-source-1-stage-0',
              },
              {
                stage: 1,
                percentage: 25,
                score: 0.79,
                passed: true,
                runId: 'rollout-source-1-stage-1',
              },
            ],
            nextStageIndex: 2,
          },
          manifest: {
            format: 'neon.checkpoint.v1',
            checkpointId: 'checkpoint-rollout-1',
            snapshotId: 'checkpoint-rollout-1',
            name: 'stage-1',
            stateType: 'progressive_rollout',
            runtime: {
              projectId: TEST_WORKSPACE_ID,
              traceId: 'trace-rollout-1',
              workflowId: 'wf-rollout-1',
              workflowRunId: 'run-rollout-1',
              agentId: 'agent-candidate',
              agentVersion: 'v2',
              capturedAt: '2026-03-30T00:00:00.000Z',
              sequence: 2,
            },
            restore: {
              mode: 'restore',
              target: 'workflow',
              requiresApproval: false,
              replaysSideEffects: true,
            },
            integrity: {
              schemaVersion: '1',
            },
          },
        },
      }),
    )

    const { POST } = await getCheckpointReplayHandlers()
    const replayRes = await POST(
      createMockRequest('/api/checkpoints/checkpoint-rollout-1/replay', {
        method: 'POST',
        body: { mode: 'restore' },
      }),
      {
        params: Promise.resolve({ id: 'checkpoint-rollout-1' }),
      },
    )

    expect(replayRes.status).toBe(200)
    const replayBody = await replayRes.json()
    expect(replayBody.kind).toBe('progressive_rollout')
    expect(replayBody.workflowName).toBe('progressiveRolloutWorkflow')
    expect(replayBody.mode).toBe('restore')
    expect(mockStartWorkflowFromCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'progressive_rollout',
        workflowName: 'progressiveRolloutWorkflow',
        checkpointId: 'checkpoint-rollout-1',
        sourceTraceId: 'trace-rollout-1',
        mode: 'restore',
        workflowId: expect.stringContaining(
          `progressive-rollout-replay-${TEST_WORKSPACE_ID}-checkpoint-rollout-1-`,
        ),
        args: [
          expect.objectContaining({
            projectId: TEST_WORKSPACE_ID,
            rolloutId: expect.stringContaining('rollout-source-1-restore-'),
            restoreFrom: expect.objectContaining({
              checkpointId: 'checkpoint-rollout-1',
              traceId: 'trace-rollout-1',
              mode: 'restore',
            }),
            restoredCheckpoint: expect.objectContaining({
              checkpointId: 'checkpoint-rollout-1',
              kind: 'progressive_rollout',
            }),
          }),
        ],
        memo: expect.objectContaining({
          checkpointId: 'checkpoint-rollout-1',
          sourceTraceId: 'trace-rollout-1',
          replayMode: 'restore',
          sourceRolloutId: 'rollout-source-1',
          newAgentId: 'agent-candidate',
        }),
      }),
    )
  })

  it('starts a training-loop restore workflow from a persisted checkpoint', async () => {
    const { POST: createCheckpoint } = await getCheckpointHandlers()
    await createCheckpoint(
      createMockRequest('/api/checkpoints', {
        method: 'POST',
        body: {
          kind: 'training_loop',
          traceId: 'trace-training-loop-1',
          loopId: 'training-loop-source-1',
          promptId: 'prompt-1',
          suiteId: 'suite-1',
          input: {
            projectId: TEST_WORKSPACE_ID,
            suiteId: 'suite-1',
            promptId: 'prompt-1',
            strategy: 'coordinate_ascent',
            trigger: 'manual',
            maxIterations: 3,
          },
          state: {
            status: 'running',
            currentStage: 'curating',
            currentIteration: 1,
            maxIterations: 3,
            baselineScore: 0.85,
            currentMetrics: { signalCount: 50, qualityScore: 0.9 },
            stageHistory: [
              {
                iteration: 1,
                stage: 'collecting',
                status: 'completed',
                metrics: { signalCount: 50 },
                durationMs: 100,
                timestamp: '2026-03-30T00:00:00.000Z',
              },
            ],
            collectedSignals: [{ id: 'signal-1', type: 'preference' }],
            curatedData: [],
            approvalStatus: 'idle',
          },
          manifest: {
            format: 'neon.checkpoint.v1',
            checkpointId: 'checkpoint-training-loop-1',
            snapshotId: 'checkpoint-training-loop-1',
            name: 'iter-1-curating',
            stateType: 'training_loop',
            runtime: {
              projectId: TEST_WORKSPACE_ID,
              traceId: 'trace-training-loop-1',
              workflowId: 'wf-training-loop-1',
              workflowRunId: 'run-training-loop-1',
              agentId: 'prompt-1',
              capturedAt: '2026-03-30T00:00:00.000Z',
              sequence: 2,
            },
            restore: {
              mode: 'restore',
              target: 'workflow',
              requiresApproval: true,
              replaysSideEffects: true,
            },
            integrity: {
              schemaVersion: '1',
            },
          },
        },
      }),
    )

    const { POST } = await getCheckpointReplayHandlers()
    const replayRes = await POST(
      createMockRequest('/api/checkpoints/checkpoint-training-loop-1/replay', {
        method: 'POST',
        body: { mode: 'restore' },
      }),
      {
        params: Promise.resolve({ id: 'checkpoint-training-loop-1' }),
      },
    )

    expect(replayRes.status).toBe(200)
    const replayBody = await replayRes.json()
    expect(replayBody.kind).toBe('training_loop')
    expect(replayBody.workflowName).toBe('trainingLoopWorkflow')
    expect(replayBody.mode).toBe('restore')
    expect(mockStartWorkflowFromCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'training_loop',
        workflowName: 'trainingLoopWorkflow',
        checkpointId: 'checkpoint-training-loop-1',
        sourceTraceId: 'trace-training-loop-1',
        mode: 'restore',
        workflowId: expect.stringContaining(
          `training-loop-replay-${TEST_WORKSPACE_ID}-checkpoint-training-loop-1-`,
        ),
        args: [
          expect.objectContaining({
            projectId: TEST_WORKSPACE_ID,
            promptId: 'prompt-1',
            suiteId: 'suite-1',
            restoreFrom: expect.objectContaining({
              checkpointId: 'checkpoint-training-loop-1',
              traceId: 'trace-training-loop-1',
              mode: 'restore',
            }),
            restoredCheckpoint: expect.objectContaining({
              checkpointId: 'checkpoint-training-loop-1',
              kind: 'training_loop',
            }),
          }),
        ],
        memo: expect.objectContaining({
          checkpointId: 'checkpoint-training-loop-1',
          sourceTraceId: 'trace-training-loop-1',
          replayMode: 'restore',
          loopId: 'training-loop-source-1',
        }),
      }),
    )
  })
})
