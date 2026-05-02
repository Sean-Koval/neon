import { type NextRequest, NextResponse } from 'next/server'

import type { CheckpointManifest } from '@/lib/traces/trace-bundle'
import {
  persistAgentCheckpoint,
  persistEvalCaseCheckpoint,
  persistEvalRunCheckpoint,
  persistProgressiveRolloutCheckpoint,
  persistTrainingLoopCheckpoint,
  type PersistAgentCheckpointParams,
  type PersistEvalCaseCheckpointParams,
  type PersistEvalRunCheckpointParams,
  type PersistProgressiveRolloutCheckpointParams,
  type PersistTrainingLoopCheckpointParams,
} from '@/lib/checkpoints/store'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'

type PersistCheckpointRequest =
  | (Omit<PersistAgentCheckpointParams, 'projectId'> & { kind?: 'agent_run' })
  | (Omit<PersistEvalCaseCheckpointParams, 'projectId'> & { kind: 'eval_case' })
  | (Omit<PersistEvalRunCheckpointParams, 'projectId'> & { kind: 'eval_run' })
  | (Omit<PersistProgressiveRolloutCheckpointParams, 'projectId'> & {
      kind: 'progressive_rollout'
    })
  | (Omit<PersistTrainingLoopCheckpointParams, 'projectId'> & { kind: 'training_loop' })

export const POST = withRateLimit(
  withAuth(async (request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const body = (await request.json()) as PersistCheckpointRequest
      if (!body?.manifest || !body?.traceId || !body?.state) {
        return NextResponse.json(
          { error: 'Missing required checkpoint payload fields' },
          { status: 400 },
        )
      }
      if (
        (body.kind === undefined ||
          body.kind === 'agent_run' ||
          body.kind === 'eval_case' ||
          body.kind === 'eval_run') &&
        !body.agentId
      ) {
        return NextResponse.json(
          { error: 'Checkpoint payload requires agentId' },
          { status: 400 },
        )
      }
      if (body.kind === 'eval_run' && !body.runId) {
        return NextResponse.json(
          { error: 'Eval run checkpoints require runId' },
          { status: 400 },
        )
      }
      if (
        body.kind === 'progressive_rollout' &&
        !body.rolloutId
      ) {
        return NextResponse.json(
          { error: 'Progressive rollout checkpoints require rolloutId' },
          { status: 400 },
        )
      }
      if (
        body.kind === 'training_loop' &&
        (!body.loopId || !body.promptId || !body.suiteId)
      ) {
        return NextResponse.json(
          { error: 'Training loop checkpoints require loopId, promptId, and suiteId' },
          { status: 400 },
        )
      }

      const stored =
        body.kind === 'eval_case'
          ? await persistEvalCaseCheckpoint({
              ...body,
              projectId,
            })
          : body.kind === 'eval_run'
            ? await persistEvalRunCheckpoint({
                ...body,
                projectId,
              })
            : body.kind === 'progressive_rollout'
              ? await persistProgressiveRolloutCheckpoint({
                  ...body,
                  projectId,
                })
            : body.kind === 'training_loop'
              ? await persistTrainingLoopCheckpoint({
                  ...body,
                  projectId,
                })
          : await persistAgentCheckpoint({
              ...body,
              projectId,
            })

      return NextResponse.json({
        success: true,
        checkpointId: stored.manifest.checkpointId,
        manifest: stored.manifest satisfies CheckpointManifest,
        envelope: stored.envelope,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error persisting checkpoint')
      return NextResponse.json(
        { error: 'Failed to persist checkpoint', details: String(error) },
        { status: 500 },
      )
    }
  }),
)
