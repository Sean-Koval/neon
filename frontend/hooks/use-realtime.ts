/**
 * Real-time Updates Hook
 *
 * Provides real-time eval run updates via WebSocket with automatic
 * polling fallback when WebSocket is unavailable.
 *
 * Features:
 * - WebSocket connection with auto-reconnection
 * - Polling fallback for environments without WebSocket support
 * - Subscribe to specific run IDs for targeted updates
 * - Connection status tracking
 * - Automatic cleanup on unmount
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { api } from '@/lib/api'
import type {
  ConnectionStatus,
  IncomingWebSocketMessage,
  OutgoingWebSocketMessage,
  RunStatusUpdate,
  UseRealtimeOptions,
  UseRealtimeReturn,
  WorkflowStatusPoll,
} from '@/lib/types'
import { workflowQueryKeys } from './use-workflow-runs'

// Default configuration
const DEFAULT_OPTIONS: Required<
  Omit<UseRealtimeOptions, 'onConnectionChange' | 'onError' | 'wsUrl'>
> = {
  enableWebSocket: true,
  pollingInterval: 2000,
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  pingInterval: 30000,
}

/**
 * Detect WebSocket URL from current location.
 */
function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/api/ws'
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws`
}

/**
 * Check if WebSocket is supported in the current environment.
 */
function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined'
}

/**
 * Convert WorkflowStatusPoll to RunStatusUpdate format.
 */
function pollToUpdate(
  runId: string,
  poll: WorkflowStatusPoll,
): RunStatusUpdate {
  return {
    runId,
    status: poll.status,
    progress: poll.progress,
    summary: poll.summary,
    error: poll.error,
  }
}

/**
 * Hook for real-time eval run updates.
 *
 * Provides WebSocket-based real-time updates with automatic polling fallback.
 * Manages subscriptions to specific run IDs and handles reconnection logic.
 *
 * @example
 * ```tsx
 * const { connectionStatus, subscribe, unsubscribe, getRunStatus } = useRealtime({
 *   onConnectionChange: (status) => console.log('Connection:', status),
 * })
 *
 * // Subscribe to a run
 * useEffect(() => {
 *   subscribe(runId)
 *   return () => unsubscribe(runId)
 * }, [runId, subscribe, unsubscribe])
 *
 * // Get current status
 * const status = getRunStatus(runId)
 * ```
 */
export function useRealtime(
  options: UseRealtimeOptions = {},
): UseRealtimeReturn {
  const {
    wsUrl = getDefaultWsUrl(),
    enableWebSocket = DEFAULT_OPTIONS.enableWebSocket,
    pollingInterval = DEFAULT_OPTIONS.pollingInterval,
    maxReconnectAttempts = DEFAULT_OPTIONS.maxReconnectAttempts,
    reconnectDelay = DEFAULT_OPTIONS.reconnectDelay,
    pingInterval = DEFAULT_OPTIONS.pingInterval,
    onConnectionChange,
    onError,
  } = options

  const queryClient = useQueryClient()

  // State
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected')
  const [isWebSocket, setIsWebSocket] = useState(false)
  const [runStatuses, setRunStatuses] = useState<Map<string, RunStatusUpdate>>(
    () => new Map(),
  )

  // Refs for mutable state that doesn't trigger re-renders
  const wsRef = useRef<WebSocket | null>(null)
  const subscriptionsRef = useRef<Set<string>>(new Set())
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const batchPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  )
  const pollingRunIdsRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(true)

  // Refs to store latest callback versions without causing re-renders
  const onConnectionChangeRef = useRef(onConnectionChange)
  const onErrorRef = useRef(onError)

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange
  }, [onConnectionChange])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  /**
   * Update connection status and notify callback.
   */
  const updateConnectionStatus = useCallback(
    (status: ConnectionStatus) => {
      if (!mountedRef.current) return
      setConnectionStatus(status)
      onConnectionChangeRef.current?.(status)
    },
    [], // No dependencies - uses ref for callback
  )

  /**
   * Handle incoming WebSocket message.
   */
  const handleMessage = useCallback(
    (message: IncomingWebSocketMessage) => {
      if (!mountedRef.current) return

      switch (message.type) {
        case 'update':
          if (message.payload) {
            const update = message.payload
            setRunStatuses((prev) => {
              const next = new Map(prev)
              next.set(update.runId, update)
              return next
            })

            // Also update React Query cache for consistency
            queryClient.setQueryData<WorkflowStatusPoll>(
              workflowQueryKeys.status(update.runId),
              {
                id: update.runId,
                status: update.status,
                isRunning: update.status === 'RUNNING',
                isComplete: update.status === 'COMPLETED',
                isFailed:
                  update.status === 'FAILED' ||
                  update.status === 'CANCELLED' ||
                  update.status === 'TERMINATED',
                progress: update.progress,
                summary: update.summary,
                error: update.error,
              },
            )
          }
          break

        case 'error':
          if (message.payload) {
            onErrorRef.current?.(message.payload)
          }
          break

        case 'pong':
          // Connection is alive, nothing to do
          break

        case 'ack':
          // Subscription acknowledged, nothing to do
          break
      }
    },
    [queryClient], // Removed onError - uses ref instead
  )

  /**
   * Send a message via WebSocket.
   */
  const sendMessage = useCallback((message: OutgoingWebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    return false
  }, [])

  /**
   * Execute a single batch poll for all active polling run IDs.
   * Fetches status for all runs concurrently and removes completed runs.
   */
  const executeBatchPoll = useCallback(async () => {
    if (!mountedRef.current) return
    const runIds = Array.from(pollingRunIdsRef.current) as string[]
    if (runIds.length === 0) return

    const activeRunIds = runIds.filter((id) =>
      subscriptionsRef.current.has(id),
    )
    if (activeRunIds.length === 0) return

    const results = await Promise.allSettled(
      activeRunIds.map(async (runId) => {
        const status = await api.getWorkflowRunStatus(runId)
        return { runId, status }
      }),
    )

    if (!mountedRef.current) return

    const completedRunIds: string[] = []
    const updates = new Map<string, RunStatusUpdate>()

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { runId, status } = result.value
        updates.set(runId, pollToUpdate(runId, status))

        // Update React Query cache for consistency
        queryClient.setQueryData<WorkflowStatusPoll>(
          workflowQueryKeys.status(runId),
          {
            id: runId,
            status: status.status,
            isRunning: status.isRunning,
            isComplete: status.isComplete,
            isFailed: status.isFailed,
            progress: status.progress,
            summary: status.summary,
            error: status.error,
          },
        )

        if (!status.isRunning) {
          completedRunIds.push(runId)
        }
      } else {
        console.warn('Batch poll failed for a run:', result.reason)
      }
    }

    // Batch state update
    if (updates.size > 0) {
      setRunStatuses((prev) => {
        const next = new Map(prev)
        for (const [runId, update] of updates) {
          next.set(runId, update)
        }
        return next
      })
    }

    // Remove completed runs from polling set
    for (const runId of completedRunIds) {
      pollingRunIdsRef.current.delete(runId)
    }

    // Stop the interval if no more runs to poll
    if (pollingRunIdsRef.current.size === 0 && batchPollingIntervalRef.current) {
      clearInterval(batchPollingIntervalRef.current)
      batchPollingIntervalRef.current = null
    }
  }, [queryClient])

  /**
   * Ensure the batch polling interval is running.
   */
  const ensureBatchPollingStarted = useCallback(() => {
    if (batchPollingIntervalRef.current) return
    if (pollingRunIdsRef.current.size === 0) return

    batchPollingIntervalRef.current = setInterval(
      executeBatchPoll,
      pollingInterval,
    )
  }, [executeBatchPoll, pollingInterval])

  /**
   * Start polling for a specific run ID (adds to the batch).
   */
  const startPolling = useCallback(
    (runId: string) => {
      pollingRunIdsRef.current.add(runId)
      // Fire an immediate poll, then the interval takes over
      executeBatchPoll()
      ensureBatchPollingStarted()
    },
    [executeBatchPoll, ensureBatchPollingStarted],
  )

  /**
   * Stop polling for a specific run ID.
   */
  const stopPolling = useCallback((runId: string) => {
    pollingRunIdsRef.current.delete(runId)

    if (pollingRunIdsRef.current.size === 0 && batchPollingIntervalRef.current) {
      clearInterval(batchPollingIntervalRef.current)
      batchPollingIntervalRef.current = null
    }
  }, [])

  /**
   * Stop all polling.
   */
  const stopAllPolling = useCallback(() => {
    pollingRunIdsRef.current.clear()
    if (batchPollingIntervalRef.current) {
      clearInterval(batchPollingIntervalRef.current)
      batchPollingIntervalRef.current = null
    }
  }, [])

  /**
   * Start ping interval to keep WebSocket alive.
   */
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }

    pingIntervalRef.current = setInterval(() => {
      // Access wsRef directly instead of through sendMessage to avoid dependency
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString(),
          }),
        )
      }
    }, pingInterval)
  }, [pingInterval])

  /**
   * Stop ping interval.
   */
  const stopPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
  }, [])

  /**
   * Connect to WebSocket server.
   * Uses refs for callbacks to avoid dependency chain issues that cause memory leaks.
   */
  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (!enableWebSocket || !isWebSocketSupported()) {
      setIsWebSocket(false)
      updateConnectionStatus('disconnected')
      return
    }

    // Close existing connection and clear its event handlers
    if (wsRef.current) {
      // Clear event handlers to prevent memory leaks
      wsRef.current.onopen = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }

    updateConnectionStatus('connecting')

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close()
          return
        }

        reconnectAttemptsRef.current = 0
        setIsWebSocket(true)
        updateConnectionStatus('connected')
        startPingInterval()

        // Stop polling since WebSocket is connected
        stopAllPolling()

        // Re-subscribe to all current subscriptions
        for (const runId of subscriptionsRef.current) {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'subscribe',
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                payload: { runId },
              }),
            )
          }
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as IncomingWebSocketMessage
          handleMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onerror = (event) => {
        console.error('WebSocket error:', event)
        updateConnectionStatus('error')
        onErrorRef.current?.({
          code: 'WS_ERROR',
          message: 'WebSocket connection error',
        })
      }

      ws.onclose = (event) => {
        if (!mountedRef.current) return

        wsRef.current = null
        stopPingInterval()

        // Don't reconnect if closed cleanly or max attempts reached
        if (
          event.wasClean ||
          reconnectAttemptsRef.current >= maxReconnectAttempts
        ) {
          setIsWebSocket(false)
          updateConnectionStatus('disconnected')

          // Fall back to polling for active subscriptions
          for (const runId of subscriptionsRef.current) {
            startPolling(runId)
          }
          return
        }

        // Attempt reconnection with exponential backoff
        reconnectAttemptsRef.current++
        const delay = reconnectDelay * 2 ** (reconnectAttemptsRef.current - 1)

        updateConnectionStatus('reconnecting')

        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect()
          }
        }, delay)
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setIsWebSocket(false)
      updateConnectionStatus('error')

      // Fall back to polling
      for (const runId of subscriptionsRef.current) {
        startPolling(runId)
      }
    }
  }, [
    wsUrl,
    enableWebSocket,
    maxReconnectAttempts,
    reconnectDelay,
    updateConnectionStatus,
    handleMessage,
    startPingInterval,
    stopPingInterval,
    stopAllPolling,
    startPolling,
  ])

  /**
   * Disconnect from WebSocket server.
   * Clears all event handlers to prevent memory leaks.
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    stopPingInterval()
    stopAllPolling()

    if (wsRef.current) {
      // Clear event handlers before closing to prevent memory leaks
      wsRef.current.onopen = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.onclose = null
      wsRef.current.close(1000, 'Client disconnecting')
      wsRef.current = null
    }

    // Clear subscriptions to release references
    subscriptionsRef.current.clear()

    setIsWebSocket(false)
    updateConnectionStatus('disconnected')
  }, [stopPingInterval, stopAllPolling, updateConnectionStatus])

  /**
   * Subscribe to updates for a specific run.
   */
  const subscribe = useCallback(
    (runId: string) => {
      if (subscriptionsRef.current.has(runId)) return

      subscriptionsRef.current.add(runId)

      if (isWebSocket && wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({
          type: 'subscribe',
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          payload: { runId },
        })
      } else {
        // Use polling if WebSocket not available
        startPolling(runId)
      }
    },
    [isWebSocket, sendMessage, startPolling],
  )

  /**
   * Unsubscribe from updates for a specific run.
   */
  const unsubscribe = useCallback(
    (runId: string) => {
      if (!subscriptionsRef.current.has(runId)) return

      subscriptionsRef.current.delete(runId)
      stopPolling(runId)

      // Remove from local state
      setRunStatuses((prev) => {
        const next = new Map(prev)
        next.delete(runId)
        return next
      })

      if (isWebSocket && wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({
          type: 'unsubscribe',
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          payload: { runId },
        })
      }
    },
    [isWebSocket, sendMessage, stopPolling],
  )

  /**
   * Get current status for a specific run.
   */
  const getRunStatus = useCallback(
    (runId: string): RunStatusUpdate | undefined => {
      return runStatuses.get(runId)
    },
    [runStatuses],
  )

  /**
   * Manually trigger reconnection.
   */
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0
    disconnect()
    connect()
  }, [disconnect, connect])

  // Store connect/disconnect in refs to avoid effect dependency issues
  const connectRef = useRef(connect)
  const disconnectRef = useRef(disconnect)

  // Keep refs updated
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    disconnectRef.current = disconnect
  }, [disconnect])

  // Initialize connection on mount - uses refs to avoid dependency issues
  // that cause memory leaks from repeated connect/disconnect cycles
  useEffect(() => {
    mountedRef.current = true
    connectRef.current()

    return () => {
      mountedRef.current = false
      disconnectRef.current()
    }
  }, []) // Empty deps - only run on mount/unmount

  return {
    connectionStatus,
    isWebSocket,
    subscribe,
    unsubscribe,
    getRunStatus,
    runStatuses,
    reconnect,
  }
}

/**
 * Hook for subscribing to a single run's real-time updates.
 *
 * Simplified interface when you only need to track one run.
 *
 * @example
 * ```tsx
 * const { status, connectionStatus } = useRealtimeRun(runId)
 * ```
 */
export function useRealtimeRun(
  runId: string | undefined,
  options: UseRealtimeOptions = {},
): {
  status: RunStatusUpdate | undefined
  connectionStatus: ConnectionStatus
  isWebSocket: boolean
} {
  const {
    connectionStatus,
    isWebSocket,
    subscribe,
    unsubscribe,
    getRunStatus,
  } = useRealtime(options)

  useEffect(() => {
    if (!runId) return

    subscribe(runId)
    return () => unsubscribe(runId)
  }, [runId, subscribe, unsubscribe])

  return {
    status: runId ? getRunStatus(runId) : undefined,
    connectionStatus,
    isWebSocket,
  }
}

export default useRealtime
