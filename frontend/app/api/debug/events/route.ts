/**
 * Debug Events API
 *
 * Internal endpoint for receiving debug events from Temporal workers
 * and broadcasting them to connected debug stream clients.
 *
 * This endpoint is called by the debug-handler activity when
 * debug events occur (breakpoint hit, step completed, etc.)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { broadcastToTrace, sessionStates } from '../stream/route'

// ============================================================================
// Types
// ============================================================================

interface DebugEvent {
  type:
    | 'sessionStarted'
    | 'spanEnter'
    | 'spanExit'
    | 'breakpointHit'
    | 'paused'
    | 'resumed'
    | 'stepCompleted'
    | 'sessionEnded'
    | 'traceStarted'
    | 'traceCompleted'
    | 'error'
  traceId: string
  timestamp: string
  payload: {
    span?: Record<string, unknown>
    trace?: Record<string, unknown>
    breakpoint?: Record<string, unknown>
    state?: 'running' | 'paused' | 'stepping' | 'completed'
    message?: string
    data?: Record<string, unknown>
  }
}

// ============================================================================
// POST Handler
// ============================================================================

/**
 * POST /api/debug/events
 *
 * Receives debug events from Temporal workers and broadcasts
 * them to all subscribers of the trace.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate internal API key for service-to-service communication
    const internalKey = request.headers.get('x-internal-key')
    const expectedKey = process.env.INTERNAL_API_KEY
    const isDev = process.env.NODE_ENV !== 'production'

    // In production, require valid internal API key
    if (!isDev && expectedKey && internalKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid internal API key' },
        { status: 401 },
      )
    }

    // In development without INTERNAL_API_KEY set, log a warning
    if (isDev && !expectedKey) {
      console.warn(
        '[DEBUG EVENTS] Running without INTERNAL_API_KEY. ' +
          'Set INTERNAL_API_KEY env var for production security.',
      )
    }

    const event: DebugEvent = await request.json()

    if (!event.type || !event.traceId) {
      return NextResponse.json(
        { error: 'Missing required fields: type, traceId' },
        { status: 400 },
      )
    }

    // Ensure session state exists
    if (!sessionStates.has(event.traceId)) {
      sessionStates.set(event.traceId, {
        state: 'running',
        currentSpanId: null,
        pausedAt: null,
      })
    }

    const session = sessionStates.get(event.traceId)
    if (!session) {
      return NextResponse.json(
        { error: 'Failed to initialize debug session state' },
        { status: 500 },
      )
    }

    // Update session state based on event type
    switch (event.type) {
      case 'sessionStarted':
      case 'traceStarted':
        session.state = 'running'
        session.currentSpanId = null
        session.pausedAt = null
        break

      case 'breakpointHit':
      case 'paused':
      case 'stepCompleted':
        session.state = 'paused'
        session.pausedAt = new Date()
        if (event.payload.span?.spanId) {
          session.currentSpanId = event.payload.span.spanId as string
        }
        break

      case 'resumed':
        session.state =
          event.payload.state === 'stepping' ? 'stepping' : 'running'
        session.pausedAt = null
        break

      case 'sessionEnded':
      case 'traceCompleted':
        session.state = 'completed'
        break

      case 'spanEnter':
        if (event.payload.span?.spanId) {
          session.currentSpanId = event.payload.span.spanId as string
        }
        break

      case 'spanExit':
        // Current span tracking is handled by the span stack in the client
        break
    }

    // Broadcast to all subscribers
    // Cast payload to the expected type - the stream route's DebugEvent payload
    // has a more specific type (DebugSpan) but incoming events from workers
    // use a generic Record type
    broadcastToTrace(event.traceId, {
      type: mapEventType(event.type),
      traceId: event.traceId,
      timestamp: event.timestamp,
      payload: event.payload as Parameters<
        typeof broadcastToTrace
      >[1]['payload'],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing debug event:', error)
    return NextResponse.json(
      { error: 'Failed to process event', details: String(error) },
      { status: 500 },
    )
  }
}

/** Client-facing event types */
type ClientEventType =
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

/**
 * Map internal event types to client-facing event types
 */
function mapEventType(type: DebugEvent['type']): ClientEventType {
  const mapping: Partial<Record<DebugEvent['type'], ClientEventType>> = {
    sessionStarted: 'connected',
    sessionEnded: 'traceCompleted',
  }
  return (mapping[type] ?? type) as ClientEventType
}
