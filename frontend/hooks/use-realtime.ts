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
  WebSocketErrorPayload,
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
  const pollingIntervalsRef = useRef<
    Map<string, ReturnType<typeof setInterval>>
  >(new Map())
  const mountedRef = useRef(true)

  /**
   * Update connection status and notify callback.
   */
  const updateConnectionStatus = useCallback(
    (status: ConnectionStatus) => {
      if (!mountedRef.current) return
      setConnectionStatus(status)
      onConnectionChange?.(status)
    },
    [onConnectionChange],
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
            onError?.(message.payload)
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
    [queryClient, onError],
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
   * Start polling for a specific run ID.
   */
  const startPolling = useCallback(
    (runId: string) => {
      // Don't start if already polling
      if (pollingIntervalsRef.current.has(runId)) return

      const poll = async () => {
        if (!mountedRef.current) return
        if (!subscriptionsRef.current.has(runId)) return

        try {
          const status = await api.getWorkflowRunStatus(runId)
          if (!mountedRef.current) return

          const update = pollToUpdate(runId, status)
          setRunStatuses((prev) => {
            const next = new Map(prev)
            next.set(runId, update)
            return next
          })

          // Stop polling if run is complete
          if (!status.isRunning) {
            const interval = pollingIntervalsRef.current.get(runId)
            if (interval) {
              clearInterval(interval)
              pollingIntervalsRef.current.delete(runId)
            }
          }
        } catch (error) {
          // Silently fail polling - will retry on next interval
          console.warn(`Polling failed for run ${runId}:`, error)
        }
      }

      // Poll immediately, then on interval
      poll()
      const interval = setInterval(poll, pollingInterval)
      pollingIntervalsRef.current.set(runId, interval)
    },
    [pollingInterval],
  )

  /**
   * Stop polling for a specific run ID.
   */
  const stopPolling = useCallback((runId: string) => {
    const interval = pollingIntervalsRef.current.get(runId)
    if (interval) {
      clearInterval(interval)
      pollingIntervalsRef.current.delete(runId)
    }
  }, [])

  /**
   * Stop all polling.
   */
  const stopAllPolling = useCallback(() => {
    for (const interval of pollingIntervalsRef.current.values()) {
      clearInterval(interval)
    }
    pollingIntervalsRef.current.clear()
  }, [])

  /**
   * Start ping interval to keep WebSocket alive.
   */
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }

    pingIntervalRef.current = setInterval(() => {
      sendMessage({
        type: 'ping',
        timestamp: new Date().toISOString(),
      })
    }, pingInterval)
  }, [pingInterval, sendMessage])

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
   */
  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (!enableWebSocket || !isWebSocketSupported()) {
      setIsWebSocket(false)
      updateConnectionStatus('disconnected')
      return
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close()
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
          sendMessage({
            type: 'subscribe',
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            payload: { runId },
          })
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
        onError?.({
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
    sendMessage,
    startPingInterval,
    stopPingInterval,
    stopAllPolling,
    startPolling,
    onError,
  ])

  /**
   * Disconnect from WebSocket server.
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    stopPingInterval()
    stopAllPolling()

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnecting')
      wsRef.current = null
    }

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

  // Initialize connection on mount
  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
