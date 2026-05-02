/**
 * Eval Progress SSE Endpoint
 *
 * Server-Sent Events endpoint for real-time eval run progress updates.
 * Since Next.js App Router doesn't natively support WebSocket,
 * this uses SSE (ReadableStream) as the transport.
 *
 * Clients connect via EventSource or fetch with streaming response.
 * The endpoint polls the workflow status and streams updates to the client.
 *
 * Usage:
 *   GET /api/eval-progress?runId=<id>&projectId=<id>
 */

import type { NextRequest } from 'next/server'
import { withAuth, type AuthResult } from '@/lib/middleware/auth'

interface ProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'heartbeat'
  runId: string
  data: {
    status: string
    progress?: {
      completed: number
      total: number
      passed: number
      failed: number
      percentComplete: number
    }
    summary?: {
      total: number
      passed: number
      failed: number
      avgScore: number
    }
    error?: string
    latestResult?: {
      caseIndex: number
      result: {
        traceId: string
        status: string
        iterations: number
        reason?: string
      }
      scores: Array<{
        name: string
        value: number
        reason?: string
      }>
    }
  }
  timestamp: string
}

/**
 * Fetch workflow status from the internal API.
 * In production, this would query Temporal directly.
 */
async function fetchWorkflowStatus(
  runId: string,
  projectId: string,
  origin: string,
): Promise<{
  status: string
  isRunning: boolean
  isComplete: boolean
  isFailed: boolean
  progress?: ProgressEvent['data']['progress']
  summary?: ProgressEvent['data']['summary']
  error?: string
}> {
  try {
    const response = await fetch(
      `${origin}/api/runs/${runId}/status?projectId=${encodeURIComponent(projectId)}`,
      {
        headers: { 'x-project-id': projectId },
      },
    )

    if (!response.ok) {
      throw new Error(`Status fetch failed: ${response.status}`)
    }

    return response.json()
  } catch {
    // If the internal endpoint isn't available, return a simulated status
    // This allows the SSE endpoint to work even when Temporal isn't running
    return {
      status: 'RUNNING',
      isRunning: true,
      isComplete: false,
      isFailed: false,
    }
  }
}

export const GET = withAuth(async function GET(request: NextRequest, auth: AuthResult) {
  const { searchParams } = new URL(request.url)
  const runId = searchParams.get('runId')
  const projectId = auth.workspaceId || searchParams.get('projectId') || 'default'

  if (!runId) {
    return new Response(JSON.stringify({ error: 'runId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const origin = new URL(request.url).origin

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let isAborted = false

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const connectEvent = `data: ${JSON.stringify({
        type: 'connected',
        runId,
        timestamp: new Date().toISOString(),
      })}\n\n`
      controller.enqueue(encoder.encode(connectEvent))

      // Poll for status updates
      const pollInterval = 2000 // 2 seconds
      let lastStatus = ''

      const poll = async () => {
        if (isAborted) return

        try {
          const status = await fetchWorkflowStatus(runId, projectId, origin)

          const currentStatusStr = JSON.stringify(status)

          // Only send update if status changed
          if (currentStatusStr !== lastStatus) {
            lastStatus = currentStatusStr

            let eventType: ProgressEvent['type'] = 'progress'
            if (status.isComplete) eventType = 'complete'
            else if (status.isFailed) eventType = 'error'

            const event: ProgressEvent = {
              type: eventType,
              runId,
              data: {
                status: status.status,
                progress: status.progress,
                summary: status.summary,
                error: status.error,
              },
              timestamp: new Date().toISOString(),
            }

            const sseData = `event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`
            controller.enqueue(encoder.encode(sseData))

            // Close stream if run is complete or failed
            if (status.isComplete || status.isFailed) {
              if (intervalId) clearInterval(intervalId)
              controller.close()
              return
            }
          }

          // Send heartbeat to keep connection alive
          const heartbeat = `:heartbeat ${new Date().toISOString()}\n\n`
          controller.enqueue(encoder.encode(heartbeat))
        } catch (err) {
          if (isAborted) return

          const errorEvent = `event: error\ndata: ${JSON.stringify({
            type: 'error',
            runId,
            data: {
              status: 'ERROR',
              error: err instanceof Error ? err.message : 'Unknown error',
            },
            timestamp: new Date().toISOString(),
          })}\n\n`
          controller.enqueue(encoder.encode(errorEvent))
        }
      }

      // Initial poll
      poll()

      // Set up polling interval
      intervalId = setInterval(poll, pollInterval)
    },
    cancel() {
      isAborted = true
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSE returns plain Response; NextResponse extends Response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  }) as any
})
