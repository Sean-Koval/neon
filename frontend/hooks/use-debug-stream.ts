'use client'

/**
 * Debug Stream Hook
 *
 * Connects to the SSE debug stream endpoint for live trace data.
 * Maintains received spans in state, supports pause/resume,
 * and handles reconnection with exponential backoff.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface DebugSpan {
  spanId: string
  traceId: string
  parentSpanId?: string | null
  name: string
  spanType: string
  timestamp: string
  endTime?: string | null
  durationMs: number
  status: 'unset' | 'ok' | 'error'
  statusMessage?: string
  model?: string
  toolName?: string
  input?: string
  output?: string
  totalTokens?: number
}

interface DebugStreamEvent {
  type: string
  traceId: string
  timestamp: string
  payload: {
    span?: DebugSpan
    state?: string
    message?: string
    connectionId?: string
    sessionState?: {
      state: string
      currentSpanId: string | null
    }
    [key: string]: unknown
  }
}

interface UseDebugStreamOptions {
  traceId: string
  projectId?: string
  enabled?: boolean
}

interface UseDebugStreamResult {
  spans: DebugSpan[]
  isConnected: boolean
  isPaused: boolean
  isComplete: boolean
  togglePause: () => void
  error: string | null
}

export function useDebugStream({
  traceId,
  projectId = '00000000-0000-0000-0000-000000000001',
  enabled = true,
}: UseDebugStreamOptions): UseDebugStreamResult {
  const [spans, setSpans] = useState<DebugSpan[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPausedRef = useRef(false)

  // Keep ref in sync with state for use in callbacks
  isPausedRef.current = isPaused

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    cleanup()

    if (!traceId || !enabled) return

    const url = `/api/debug/stream?traceId=${encodeURIComponent(traceId)}&projectId=${encodeURIComponent(projectId)}`
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
      setError(null)
      retryCountRef.current = 0
    }

    eventSource.onmessage = (event) => {
      try {
        const data: DebugStreamEvent = JSON.parse(event.data)

        // Skip ping events
        if (data.type === 'ping') return

        // Handle span events - accumulate spans
        if (data.type === 'spanEnter' || data.type === 'spanExit') {
          const span = data.payload.span
          if (span) {
            setSpans((prev) => {
              const existing = prev.findIndex((s) => s.spanId === span.spanId)
              if (existing >= 0) {
                const updated = [...prev]
                updated[existing] = span
                return updated
              }
              return [...prev, span]
            })
          }
        }

        // Handle completion
        if (data.type === 'traceCompleted') {
          setIsComplete(true)
        }

        // Handle errors
        if (data.type === 'error') {
          setError(data.payload.message || 'Unknown stream error')
        }
      } catch {
        // Ignore parse errors from heartbeat comments
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      eventSource.close()

      // Exponential backoff reconnection
      if (!isComplete) {
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000)
        retryCountRef.current++

        retryTimerRef.current = setTimeout(() => {
          connect()
        }, delay)
      }
    }
  }, [traceId, projectId, enabled, cleanup, isComplete])

  // Connect on mount / when params change
  useEffect(() => {
    if (enabled) {
      connect()
    }
    return cleanup
  }, [connect, cleanup, enabled])

  const togglePause = useCallback(async () => {
    const newPaused = !isPausedRef.current
    setIsPaused(newPaused)

    try {
      await fetch('/api/debug/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: newPaused ? 'pause' : 'resume',
          traceId,
        }),
      })
    } catch {
      // Command failed, revert state
      setIsPaused(!newPaused)
    }
  }, [traceId])

  return {
    spans,
    isConnected,
    isPaused,
    isComplete,
    togglePause,
    error,
  }
}
