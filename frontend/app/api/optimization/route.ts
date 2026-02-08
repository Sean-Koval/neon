/**
 * Optimization Loop API
 *
 * GET /api/optimization - Get training loop status and history
 * POST /api/optimization - Control operations (pause/resume/abort/approve/reject)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { type AuthResult, withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'

interface LoopStage {
  name: string
  status: 'completed' | 'running' | 'pending' | 'failed'
  metric?: string
  duration?: string
}

interface ActiveLoop {
  id: string
  stage: string
  progress: number
  isPaused: boolean
  currentIteration: number
  maxIterations: number
  metrics: Record<string, number>
  stages: LoopStage[]
}

interface LoopHistoryEntry {
  id: string
  trigger: string
  stagesCompleted: number
  improvement: number
  duration: string
  status: string
  startedAt: string
}

function getMockStatus(): {
  activeLoop: ActiveLoop | null
  history: LoopHistoryEntry[]
} {
  return {
    activeLoop: {
      id: 'loop-2024-001',
      stage: 'optimize',
      progress: 0.45,
      isPaused: false,
      currentIteration: 3,
      maxIterations: 10,
      metrics: {
        scoreImprovement: 0.12,
        failuresPrevented: 23,
        avgLatencyReduction: 0.18,
      },
      stages: [
        {
          name: 'Collect',
          status: 'completed',
          metric: '247 traces',
          duration: '12s',
        },
        {
          name: 'Curate',
          status: 'completed',
          metric: '189 selected',
          duration: '8s',
        },
        {
          name: 'Optimize',
          status: 'running',
          metric: 'Iteration 3/10',
        },
        { name: 'Evaluate', status: 'pending' },
        { name: 'Deploy', status: 'pending' },
        { name: 'Monitor', status: 'pending' },
      ],
    },
    history: [
      {
        id: 'loop-2024-000',
        trigger: 'Score regression detected',
        stagesCompleted: 6,
        improvement: 0.15,
        duration: '4m 32s',
        status: 'completed',
        startedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'loop-2023-999',
        trigger: 'Scheduled optimization',
        stagesCompleted: 6,
        improvement: 0.08,
        duration: '3m 15s',
        status: 'completed',
        startedAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'loop-2023-998',
        trigger: 'Manual trigger',
        stagesCompleted: 4,
        improvement: -0.02,
        duration: '2m 48s',
        status: 'rolled_back',
        startedAt: new Date(Date.now() - 10800000).toISOString(),
      },
      {
        id: 'loop-2023-997',
        trigger: 'Score regression detected',
        stagesCompleted: 3,
        improvement: 0.0,
        duration: '1m 05s',
        status: 'aborted',
        startedAt: new Date(Date.now() - 14400000).toISOString(),
      },
    ],
  }
}

export const GET = withRateLimit(
  withAuth(async (_request: NextRequest, auth: AuthResult) => {
    try {
      const projectId = auth.workspaceId
      if (!projectId) {
        return NextResponse.json(
          { error: 'Workspace context required' },
          { status: 400 },
        )
      }

      const status = getMockStatus()
      return NextResponse.json(status)
    } catch (error) {
      logger.error({ err: error }, 'Error getting optimization status')
      return NextResponse.json(
        {
          error: 'Failed to get optimization status',
          details: String(error),
        },
        { status: 500 },
      )
    }
  }),
)

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

      const body = await request.json()
      const { action } = body as {
        action:
          | 'pause'
          | 'resume'
          | 'abort'
          | 'approve'
          | 'reject'
          | 'skip_stage'
          | 'rollback'
      }

      if (
        !action ||
        !['pause', 'resume', 'abort', 'approve', 'reject', 'skip_stage', 'rollback'].includes(action)
      ) {
        return NextResponse.json(
          {
            error: 'Invalid action',
            details:
              'Action must be one of: pause, resume, abort, approve, reject, skip_stage, rollback',
          },
          { status: 400 },
        )
      }

      logger.info(
        { action, projectId },
        'Optimization loop control action',
      )

      return NextResponse.json({
        success: true,
        action,
        message: `Loop ${action} operation accepted`,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      logger.error({ err: error }, 'Error controlling optimization loop')
      return NextResponse.json(
        {
          error: 'Failed to control optimization loop',
          details: String(error),
        },
        { status: 500 },
      )
    }
  }),
)
