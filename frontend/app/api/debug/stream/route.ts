/**
 * Debug Stream API
 *
 * Server-Sent Events (SSE) endpoint for real-time debug trace streaming.
 * Provides bidirectional communication via SSE for events and POST for commands.
 *
 * This endpoint supports:
 * - Real-time span enter/exit events
 * - Breakpoint hit notifications
 * - Debug session state updates
 * - Pause/resume/step commands (via POST)
 *
 * @example
 * ```typescript
 * // Subscribe to debug stream
 * const eventSource = new EventSource('/api/debug/stream?traceId=trace-123');
 *
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log('Debug event:', data.type);
 * };
 *
 * // Send commands via POST
 * await fetch('/api/debug/stream', {
 *   method: 'POST',
 *   body: JSON.stringify({ command: 'resume', traceId: 'trace-123' }),
 * });
 * ```
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  getClickHouseClient,
  type SpanDetails,
  type SpanRecord,
} from '@/lib/clickhouse'

// ============================================================================
// Authentication
// ============================================================================

/**
 * Validate project access for debug endpoints
 *
 * NOTE: This is a simplified validation for the debug MVP.
 * In production, this should:
 * 1. Extract userId from session/API key
 * 2. Use canAccessWorkspace() from @/lib/db/permissions
 * 3. Verify the trace belongs to the workspace
 *
 * For now, we require a valid project ID (not the default fallback).
 */
function validateProjectAccess(
  projectId: string | null,
  options: { allowDefaultInDev?: boolean } = {},
): { valid: boolean; projectId: string; error?: string } {
  const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001'
  const isDev = process.env.NODE_ENV !== 'production'

  // No project ID provided
  if (!projectId) {
    if (isDev && options.allowDefaultInDev) {
      return { valid: true, projectId: DEFAULT_PROJECT_ID }
    }
    return {
      valid: false,
      projectId: '',
      error:
        'Missing required header: x-project-id or projectId query parameter',
    }
  }

  // Using default project ID
  if (projectId === DEFAULT_PROJECT_ID) {
    if (isDev && options.allowDefaultInDev) {
      return { valid: true, projectId }
    }
    return {
      valid: false,
      projectId,
      error: 'Invalid project ID: default project not allowed in production',
    }
  }

  // Valid UUID format check
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(projectId)) {
    return {
      valid: false,
      projectId,
      error: 'Invalid project ID format: must be a valid UUID',
    }
  }

  return { valid: true, projectId }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Span type for debug events
 */
interface DebugSpan {
  spanId: string
  name: string
  spanType: string
  status: 'unset' | 'ok' | 'error'
  [key: string]: unknown
}

/**
 * Debug event sent to clients
 */
interface DebugEvent {
  type:
    | 'connected'
    | 'traceStarted'
    | 'spanEnter'
    | 'spanExit'
    | 'breakpointHit'
    | 'paused'
    | 'resumed'
    | 'stepCompleted'
    | 'inspectResult'
    | 'traceCompleted'
    | 'error'
    | 'ping'
  traceId: string
  timestamp: string
  payload: {
    span?: DebugSpan
    trace?: Record<string, unknown>
    breakpoint?: Record<string, unknown>
    state?: 'running' | 'paused' | 'stepping' | 'completed'
    message?: string
    data?: Record<string, unknown>
    connectionId?: string
    sessionState?: {
      state: 'running' | 'paused' | 'stepping' | 'completed'
      currentSpanId: string | null
    }
    stepMode?: 'over' | 'into' | 'out'
    [key: string]: unknown
  }
}

/**
 * Debug command from client
 */
interface DebugCommand {
  command:
    | 'resume'
    | 'stepOver'
    | 'stepInto'
    | 'stepOut'
    | 'pause'
    | 'inspect'
    | 'setBreakpoint'
    | 'removeBreakpoint'
    | 'enableBreakpoint'
    | 'disableBreakpoint'
  traceId: string
  payload?: {
    spanId?: string
    breakpointId?: string
    breakpoint?: Record<string, unknown>
  }
  requestId?: string
}

/**
 * Active debug session subscriber
 */
interface DebugSubscriber {
  traceId: string
  projectId: string
  controller: ReadableStreamDefaultController
  breakpoints: Map<string, Record<string, unknown>>
  lastPing: number
  pingIntervalId: ReturnType<typeof setInterval> | null
}

// ============================================================================
// In-Memory State
// ============================================================================

/**
 * Active subscribers by connection ID
 * In production, this should use Redis pub/sub for horizontal scaling
 */
const subscribers = new Map<string, DebugSubscriber>()

/**
 * Trace to subscriber mapping for broadcasting
 */
const traceSubscribers = new Map<string, Set<string>>()

/**
 * Debug session state
 */
const sessionStates = new Map<
  string,
  {
    state: 'running' | 'paused' | 'stepping' | 'completed'
    currentSpanId: string | null
    pausedAt: Date | null
  }
>()

// ============================================================================
// Stale Connection Cleanup
// ============================================================================

/**
 * Maximum time (ms) since last ping before a connection is considered stale.
 * Connections that haven't pinged in this time will be cleaned up.
 */
const STALE_CONNECTION_THRESHOLD_MS = 120000 // 2 minutes

/**
 * Cleanup stale connections that haven't responded to pings.
 * This runs periodically to prevent memory leaks from zombie connections.
 */
function cleanupStaleConnections(): void {
  const now = Date.now()

  for (const [connectionId, subscriber] of subscribers) {
    const timeSinceLastPing = now - subscriber.lastPing
    if (timeSinceLastPing > STALE_CONNECTION_THRESHOLD_MS) {
      console.warn(
        `[DEBUG STREAM] Cleaning up stale connection ${connectionId} ` +
          `(last ping: ${Math.round(timeSinceLastPing / 1000)}s ago)`,
      )
      cleanupSubscriber(connectionId)
    }
  }
}

// Run stale connection cleanup every 60 seconds
// Note: In serverless environments, this timer may not persist between requests.
// For production, consider using a separate cleanup worker or Redis TTLs.
let staleCleanupInterval: ReturnType<typeof setInterval> | null = null
if (typeof setInterval !== 'undefined') {
  staleCleanupInterval = setInterval(cleanupStaleConnections, 60000)
  // Ensure interval doesn't prevent process exit
  if (staleCleanupInterval.unref) {
    staleCleanupInterval.unref()
  }
}

// ============================================================================
// SSE Stream Handler (GET)
// ============================================================================

/**
 * GET /api/debug/stream
 *
 * Opens a Server-Sent Events stream for real-time debug updates.
 * Client should provide traceId as a query parameter.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const traceId = searchParams.get('traceId')

  // Validate project access
  const projectIdRaw =
    request.headers.get('x-project-id') || searchParams.get('projectId')
  const projectValidation = validateProjectAccess(projectIdRaw, {
    allowDefaultInDev: true,
  })

  if (!projectValidation.valid) {
    return NextResponse.json(
      { error: projectValidation.error },
      { status: 401 },
    )
  }

  const projectId = projectValidation.projectId

  if (!traceId) {
    return NextResponse.json(
      { error: 'Missing required parameter: traceId' },
      { status: 400 },
    )
  }

  // Generate unique connection ID
  const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register subscriber
      const subscriber: DebugSubscriber = {
        traceId,
        projectId,
        controller,
        breakpoints: new Map(),
        lastPing: Date.now(),
        pingIntervalId: null,
      }

      subscribers.set(connectionId, subscriber)

      // Add to trace subscribers
      if (!traceSubscribers.has(traceId)) {
        traceSubscribers.set(traceId, new Set())
      }
      const subscribersForTrace = traceSubscribers.get(traceId)
      subscribersForTrace?.add(connectionId)

      // Initialize session state if not exists
      if (!sessionStates.has(traceId)) {
        sessionStates.set(traceId, {
          state: 'running',
          currentSpanId: null,
          pausedAt: null,
        })
      }

      // Send connected event
      const connectedEvent: DebugEvent = {
        type: 'connected',
        traceId,
        timestamp: new Date().toISOString(),
        payload: {
          connectionId,
          sessionState: sessionStates.get(traceId),
        },
      }
      sendSSE(controller, connectedEvent)

      // Set up keepalive ping and store interval ID for cleanup
      const pingIntervalId = setInterval(() => {
        const sub = subscribers.get(connectionId)
        if (!sub) {
          clearInterval(pingIntervalId)
          return
        }

        try {
          const pingEvent: DebugEvent = {
            type: 'ping',
            traceId,
            timestamp: new Date().toISOString(),
            payload: {},
          }
          sendSSE(controller, pingEvent)
          sub.lastPing = Date.now()
        } catch {
          // Connection closed - cleanup will handle interval clearing
          cleanupSubscriber(connectionId)
        }
      }, 30000) // 30 second keepalive

      // Store interval ID with subscriber for cleanup
      subscriber.pingIntervalId = pingIntervalId

      // Handle connection close
      request.signal.addEventListener('abort', () => {
        cleanupSubscriber(connectionId)
      })
    },

    cancel() {
      cleanupSubscriber(connectionId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

// ============================================================================
// Command Handler (POST)
// ============================================================================

/**
 * POST /api/debug/stream
 *
 * Handles debug commands from the client.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate project access
    const projectIdRaw =
      request.headers.get('x-project-id') ||
      request.nextUrl.searchParams.get('projectId')
    const projectValidation = validateProjectAccess(projectIdRaw, {
      allowDefaultInDev: true,
    })

    if (!projectValidation.valid) {
      return NextResponse.json(
        { error: projectValidation.error },
        { status: 401 },
      )
    }

    const projectId = projectValidation.projectId

    const body: DebugCommand = await request.json()
    const { command, traceId, payload, requestId } = body

    if (!command || !traceId) {
      return NextResponse.json(
        { error: 'Missing required fields: command, traceId' },
        { status: 400 },
      )
    }

    // Get session state
    const session = sessionStates.get(traceId)
    if (!session) {
      return NextResponse.json(
        { error: 'No active debug session for this trace' },
        { status: 404 },
      )
    }

    let responsePayload: Record<string, unknown> = { success: true }

    switch (command) {
      case 'resume':
        session.state = 'running'
        session.pausedAt = null
        broadcastToTrace(traceId, {
          type: 'resumed',
          traceId,
          timestamp: new Date().toISOString(),
          payload: { state: 'running' },
        })
        break

      case 'stepOver':
        session.state = 'stepping'
        broadcastToTrace(traceId, {
          type: 'resumed',
          traceId,
          timestamp: new Date().toISOString(),
          payload: { state: 'stepping', stepMode: 'over' },
        })
        break

      case 'stepInto':
        session.state = 'stepping'
        broadcastToTrace(traceId, {
          type: 'resumed',
          traceId,
          timestamp: new Date().toISOString(),
          payload: { state: 'stepping', stepMode: 'into' },
        })
        break

      case 'stepOut':
        session.state = 'stepping'
        broadcastToTrace(traceId, {
          type: 'resumed',
          traceId,
          timestamp: new Date().toISOString(),
          payload: { state: 'stepping', stepMode: 'out' },
        })
        break

      case 'pause':
        session.state = 'paused'
        session.pausedAt = new Date()
        broadcastToTrace(traceId, {
          type: 'paused',
          traceId,
          timestamp: new Date().toISOString(),
          payload: { state: 'paused' },
        })
        break

      case 'inspect':
        if (!payload?.spanId) {
          return NextResponse.json(
            { error: 'Missing spanId for inspect command' },
            { status: 400 },
          )
        }
        // Fetch span data from ClickHouse
        responsePayload = {
          success: true,
          data: await getSpanInspection(projectId, traceId, payload.spanId),
          requestId,
        }
        break

      case 'setBreakpoint':
        if (!payload?.breakpoint) {
          return NextResponse.json(
            { error: 'Missing breakpoint for setBreakpoint command' },
            { status: 400 },
          )
        }
        // Store breakpoint for all subscribers of this trace
        for (const connId of traceSubscribers.get(traceId) ?? []) {
          const sub = subscribers.get(connId)
          if (sub && payload.breakpoint.id) {
            sub.breakpoints.set(
              payload.breakpoint.id as string,
              payload.breakpoint,
            )
          }
        }
        break

      case 'removeBreakpoint':
        if (!payload?.breakpointId) {
          return NextResponse.json(
            { error: 'Missing breakpointId for removeBreakpoint command' },
            { status: 400 },
          )
        }
        for (const connId of traceSubscribers.get(traceId) ?? []) {
          const sub = subscribers.get(connId)
          if (sub) {
            sub.breakpoints.delete(payload.breakpointId)
          }
        }
        break

      case 'enableBreakpoint':
      case 'disableBreakpoint':
        if (!payload?.breakpointId) {
          return NextResponse.json(
            { error: 'Missing breakpointId' },
            { status: 400 },
          )
        }
        for (const connId of traceSubscribers.get(traceId) ?? []) {
          const sub = subscribers.get(connId)
          if (sub) {
            const bp = sub.breakpoints.get(payload.breakpointId)
            if (bp) {
              bp.enabled = command === 'enableBreakpoint'
            }
          }
        }
        break

      default:
        return NextResponse.json(
          { error: `Unknown command: ${command}` },
          { status: 400 },
        )
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('Error handling debug command:', error)
    return NextResponse.json(
      { error: 'Failed to process command', details: String(error) },
      { status: 500 },
    )
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Send a Server-Sent Event to a controller
 */
function sendSSE(
  controller: ReadableStreamDefaultController,
  event: DebugEvent,
): void {
  const data = `data: ${JSON.stringify(event)}\n\n`
  controller.enqueue(new TextEncoder().encode(data))
}

/**
 * Broadcast an event to all subscribers of a trace
 */
function broadcastToTrace(traceId: string, event: DebugEvent): void {
  const connIds = traceSubscribers.get(traceId)
  if (!connIds) return

  for (const connId of connIds) {
    const subscriber = subscribers.get(connId)
    if (subscriber) {
      try {
        sendSSE(subscriber.controller, event)
      } catch {
        // Connection may be closed, clean up
        cleanupSubscriber(connId)
      }
    }
  }
}

/**
 * Clean up a subscriber connection
 */
function cleanupSubscriber(connectionId: string): void {
  const subscriber = subscribers.get(connectionId)
  if (subscriber) {
    // Clear ping interval to prevent memory leaks
    if (subscriber.pingIntervalId) {
      clearInterval(subscriber.pingIntervalId)
      subscriber.pingIntervalId = null
    }

    // Remove from trace subscribers
    const traceConns = traceSubscribers.get(subscriber.traceId)
    if (traceConns) {
      traceConns.delete(connectionId)
      if (traceConns.size === 0) {
        traceSubscribers.delete(subscriber.traceId)
        // Clean up session state when no subscribers
        sessionStates.delete(subscriber.traceId)
      }
    }

    // Remove subscriber
    subscribers.delete(connectionId)
  }
}

/**
 * Span inspection result with full details
 */
interface SpanInspectionResult {
  spanId: string
  traceId: string
  projectId: string
  name: string
  spanType: string
  status: 'unset' | 'ok' | 'error'
  statusMessage: string
  timestamp: string
  endTime: string | null
  durationMs: number
  parentSpanId: string | null
  model: string | null
  tokens: {
    input: number | null
    output: number | null
    total: number | null
  }
  costUsd: number | null
  tool: {
    name: string | null
    input: string
    output: string
  }
  payload: {
    input: string
    output: string
    modelParameters: Record<string, string>
    attributes: Record<string, string>
  }
}

/**
 * Get span inspection data from ClickHouse
 *
 * Fetches both span metadata and payload details for the debug inspector.
 */
async function getSpanInspection(
  projectId: string,
  traceId: string,
  spanId: string,
): Promise<SpanInspectionResult | { error: string }> {
  try {
    const ch = getClickHouseClient()

    // Query for full span data including payload
    const result = await ch.query({
      query: `
        SELECT
          project_id,
          trace_id,
          span_id,
          parent_span_id,
          name,
          span_type,
          timestamp,
          end_time,
          duration_ms,
          status,
          status_message,
          model,
          model_parameters,
          input,
          output,
          input_tokens,
          output_tokens,
          total_tokens,
          cost_usd,
          tool_name,
          tool_input,
          tool_output,
          attributes
        FROM spans
        WHERE project_id = {projectId:String}
          AND trace_id = {traceId:String}
          AND span_id = {spanId:String}
        LIMIT 1
      `,
      query_params: { projectId, traceId, spanId },
      format: 'JSONEachRow',
    })

    const spans = await result.json<SpanRecord & SpanDetails>()

    if (spans.length === 0) {
      return {
        error: `Span not found: ${spanId}`,
      }
    }

    const span = spans[0]

    return {
      spanId: span.span_id,
      traceId: span.trace_id,
      projectId: span.project_id,
      name: span.name,
      spanType: span.span_type,
      status: span.status,
      statusMessage: span.status_message,
      timestamp: span.timestamp,
      endTime: span.end_time,
      durationMs: span.duration_ms,
      parentSpanId: span.parent_span_id,
      model: span.model,
      tokens: {
        input: span.input_tokens,
        output: span.output_tokens,
        total: span.total_tokens,
      },
      costUsd: span.cost_usd,
      tool: {
        name: span.tool_name,
        input: span.tool_input ?? '',
        output: span.tool_output ?? '',
      },
      payload: {
        input: span.input ?? '',
        output: span.output ?? '',
        modelParameters: span.model_parameters ?? {},
        attributes: span.attributes ?? {},
      },
    }
  } catch (error) {
    console.error('Error fetching span inspection data:', error)
    return {
      error: `Failed to fetch span data: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// ============================================================================
// Event Ingestion Endpoint (Internal)
// ============================================================================

/**
 * This would typically be called from the Temporal workers
 * to push debug events to connected clients.
 *
 * POST /api/debug/events (separate route file)
 */
export function pushDebugEvent(event: DebugEvent): void {
  // Update session state based on event
  const session = sessionStates.get(event.traceId)
  if (session) {
    if (event.type === 'paused' || event.type === 'breakpointHit') {
      session.state = 'paused'
      session.pausedAt = new Date()
      if (event.payload.span) {
        session.currentSpanId = event.payload.span.spanId as string
      }
    } else if (event.type === 'resumed') {
      session.state = 'running'
      session.pausedAt = null
    } else if (event.type === 'stepCompleted') {
      session.state = 'paused'
      session.pausedAt = new Date()
      if (event.payload.span) {
        session.currentSpanId = event.payload.span.spanId as string
      }
    } else if (event.type === 'traceCompleted') {
      session.state = 'completed'
    }
  }

  // Broadcast to subscribers
  broadcastToTrace(event.traceId, event)
}

// Export for use in events route
export { broadcastToTrace, sessionStates, subscribers, traceSubscribers }
