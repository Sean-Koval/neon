/**
 * Eval Progress Hook
 *
 * Client-side hook for real-time eval run progress updates using
 * Server-Sent Events (SSE). Falls back to polling if SSE is unavailable.
 *
 * Features:
 * - Connects to /api/eval-progress SSE endpoint
 * - Receives real-time progress events (test started, completed, scored)
 * - Returns current progress state
 * - Handles reconnection gracefully
 * - Updates React Query cache for consistency
 *
 * @example
 * ```tsx
 * const { progress, status, connectionState, error } = useEvalProgress(runId)
 *
 * if (progress) {
 *   console.log(`${progress.completed}/${progress.total} cases done`)
 * }
 * ```
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ConnectionStatus,
  RunStatusUpdate,
  WorkflowStatusPoll,
} from '@/lib/types'
import { workflowQueryKeys } from './use-workflow-runs'

interface EvalProgressState {
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

interface ProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'heartbeat' | 'connected'
  runId: string
  data?: EvalProgressState
  timestamp: string
}

interface UseEvalProgressOptions {
  /** Whether to enable the SSE connection (default: true) */
  enabled?: boolean
  /** Maximum reconnection attempts before giving up (default: 5) */
  maxReconnectAttempts?: number
  /** Base reconnection delay in ms (default: 1000, doubles each attempt) */
  reconnectDelay?: number
  /** Callback when connection status changes */
  onConnectionChange?: (status: ConnectionStatus) => void
  /** Callback when a progress update is received */
  onProgress?: (state: EvalProgressState) => void
  /** Callback when the run completes */
  onComplete?: (summary: EvalProgressState) => void
  /** Callback when an error occurs */
  onError?: (error: string) => void
}

interface UseEvalProgressReturn {
  /** Current eval progress state */
  progress: EvalProgressState | null
  /** Current connection status */
  connectionState: ConnectionStatus
  /** Whether the run is still in progress */
  isRunning: boolean
  /** Whether the run is complete */
  isComplete: boolean
  /** Whether the run has failed */
  isFailed: boolean
  /** Error message if any */
  error: string | null
  /** Manually reconnect to the SSE endpoint */
  reconnect: () => void
  /** Disconnect from the SSE endpoint */
  disconnect: () => void
}

export function useEvalProgress(
  runId: string | undefined,
  options: UseEvalProgressOptions = {},
): UseEvalProgressReturn {
  const {
    enabled = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
    onConnectionChange,
    onProgress,
    onComplete,
    onError,
  } = options

  const queryClient = useQueryClient()

  const [progress, setProgress] = useState<EvalProgressState | null>(null)
  const [connectionState, setConnectionState] =
    useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Store latest callbacks in refs
  const callbacksRef = useRef({
    onConnectionChange,
    onProgress,
    onComplete,
    onError,
  })
  useEffect(() => {
    callbacksRef.current = {
      onConnectionChange,
      onProgress,
      onComplete,
      onError,
    }
  }, [onConnectionChange, onProgress, onComplete, onError])

  const updateConnectionState = useCallback((status: ConnectionStatus) => {
    if (!mountedRef.current) return
    setConnectionState(status)
    callbacksRef.current.onConnectionChange?.(status)
  }, [])

  const updateProgress = useCallback(
    (state: EvalProgressState) => {
      if (!mountedRef.current || !runId) return

      setProgress(state)
      callbacksRef.current.onProgress?.(state)

      // Update React Query cache for consistency with other hooks
      queryClient.setQueryData<WorkflowStatusPoll>(
        workflowQueryKeys.status(runId),
        {
          id: runId,
          status: state.status as WorkflowStatusPoll['status'],
          isRunning: state.status === 'RUNNING',
          isComplete: state.status === 'COMPLETED',
          isFailed:
            state.status === 'FAILED' ||
            state.status === 'CANCELLED' ||
            state.status === 'TERMINATED',
          progress: state.progress,
          summary: state.summary,
          error: state.error,
        },
      )
    },
    [runId, queryClient],
  )

  const connect = useCallback(() => {
    if (!mountedRef.current || !runId || !enabled) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    updateConnectionState('connecting')

    const projectId = localStorage.getItem('neon-project-id') || 'default'
    const url = `/api/eval-progress?runId=${encodeURIComponent(runId)}&projectId=${encodeURIComponent(projectId)}`

    try {
      const es = new EventSource(url)
      eventSourceRef.current = es

      es.onopen = () => {
        if (!mountedRef.current) {
          es.close()
          return
        }
        reconnectAttemptsRef.current = 0
        updateConnectionState('connected')
      }

      // Listen for typed events
      es.addEventListener('progress', (event) => {
        try {
          const parsed: ProgressEvent = JSON.parse(event.data)
          if (parsed.data) {
            updateProgress(parsed.data)
          }
        } catch {
          console.error('Failed to parse progress event')
        }
      })

      es.addEventListener('complete', (event) => {
        try {
          const parsed: ProgressEvent = JSON.parse(event.data)
          if (parsed.data) {
            updateProgress(parsed.data)
            callbacksRef.current.onComplete?.(parsed.data)
          }
        } catch {
          console.error('Failed to parse complete event')
        }
        // Close on completion
        es.close()
        eventSourceRef.current = null
        updateConnectionState('disconnected')
      })

      es.addEventListener('error', (event) => {
        // Check if it's an SSE error event with data
        if (event instanceof MessageEvent && event.data) {
          try {
            const parsed: ProgressEvent = JSON.parse(event.data)
            if (parsed.data?.error) {
              setError(parsed.data.error)
              callbacksRef.current.onError?.(parsed.data.error)
            }
            if (parsed.data) {
              updateProgress(parsed.data)
            }
          } catch {
            // Not a data event, handle as connection error below
          }
          es.close()
          eventSourceRef.current = null
          updateConnectionState('disconnected')
          return
        }

        // Connection error - attempt reconnection
        if (!mountedRef.current) return

        es.close()
        eventSourceRef.current = null

        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          updateConnectionState('error')
          setError('Max reconnection attempts reached')
          return
        }

        reconnectAttemptsRef.current++
        const delay = reconnectDelay * 2 ** (reconnectAttemptsRef.current - 1)
        updateConnectionState('reconnecting')

        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect()
          }
        }, delay)
      })

      // Handle generic message events (initial connection, heartbeats)
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'connected') {
            // Connection confirmed
          }
        } catch {
          // Heartbeat comments, ignore
        }
      }
    } catch (err) {
      updateConnectionState('error')
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }, [
    runId,
    enabled,
    maxReconnectAttempts,
    reconnectDelay,
    updateConnectionState,
    updateProgress,
  ])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    updateConnectionState('disconnected')
  }, [updateConnectionState])

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0
    setError(null)
    disconnect()
    connect()
  }, [disconnect, connect])

  // Store connect/disconnect in refs for mount/unmount effect
  const connectRef = useRef(connect)
  const disconnectRef = useRef(disconnect)

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    disconnectRef.current = disconnect
  }, [disconnect])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true

    if (runId && enabled) {
      connectRef.current()
    }

    return () => {
      mountedRef.current = false
      disconnectRef.current()
    }
  }, [runId, enabled])

  const isRunning = progress?.status === 'RUNNING'
  const isComplete = progress?.status === 'COMPLETED'
  const isFailed =
    progress?.status === 'FAILED' ||
    progress?.status === 'CANCELLED' ||
    progress?.status === 'TERMINATED'

  return {
    progress,
    connectionState,
    isRunning,
    isComplete,
    isFailed,
    error,
    reconnect,
    disconnect,
  }
}

export default useEvalProgress
