/**
 * Real-time Updates Hook
 *
 * Provides real-time eval run updates via Server-Sent Events (SSE) with
 * automatic polling fallback when SSE is unavailable.
 *
 * Architecture: Uses the /api/eval-progress SSE endpoint for each subscribed
 * run ID. Each subscription opens its own EventSource connection that receives
 * progress, complete, and error events from the server. Falls back to batch
 * polling via the REST API when SSE connections fail.
 *
 * Features:
 * - SSE connection per subscription with auto-reconnection
 * - Polling fallback for environments without SSE support
 * - Subscribe to specific run IDs for targeted updates
 * - Connection status tracking
 * - Automatic cleanup on unmount
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import { CONFIG } from '@/lib/config'
import type {
  ConnectionStatus,
  RunStatusUpdate,
  UseRealtimeOptions,
  UseRealtimeReturn,
  WorkflowStatusPoll,
} from '@/lib/types'
import { workflowQueryKeys } from './use-workflow-runs'

// Default configuration
const DEFAULT_OPTIONS: Required<
  Omit<UseRealtimeOptions, 'onConnectionChange' | 'onError'>
> = {
  pollingInterval: CONFIG.REALTIME_POLLING_INTERVAL_MS,
  maxReconnectAttempts: CONFIG.REALTIME_MAX_RECONNECT_ATTEMPTS,
  reconnectDelay: CONFIG.REALTIME_RECONNECT_DELAY_MS,
}

/**
 * State for a single SSE subscription.
 */
interface SseSubscription {
  runId: string
  eventSource: EventSource
  reconnectAttempts: number
  reconnectTimeout: ReturnType<typeof setTimeout> | null
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
 * Provides SSE-based real-time updates with automatic polling fallback.
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
    pollingInterval = DEFAULT_OPTIONS.pollingInterval,
    maxReconnectAttempts = DEFAULT_OPTIONS.maxReconnectAttempts,
    reconnectDelay = DEFAULT_OPTIONS.reconnectDelay,
    onConnectionChange,
    onError,
  } = options

  const queryClient = useQueryClient()

  // State
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected')
  const [isStreaming, setIsStreaming] = useState(false)
  const [runStatuses, setRunStatuses] = useState<Map<string, RunStatusUpdate>>(
    () => new Map(),
  )

  // Refs for mutable state that doesn't trigger re-renders
  const sseConnectionsRef = useRef<Map<string, SseSubscription>>(new Map())
  const batchPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  )
  const pollingRunIdsRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(true)
  // Generation counter to discard stale poll results after disconnect
  const pollGenerationRef = useRef(0)

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
   * Recompute aggregate connection status from all SSE connections.
   */
  const recomputeConnectionStatus = useCallback(() => {
    if (!mountedRef.current) return

    const connections = sseConnectionsRef.current
    const pollingIds = pollingRunIdsRef.current

    if (connections.size === 0 && pollingIds.size === 0) {
      updateConnectionStatus('disconnected')
      setIsStreaming(false)
      return
    }

    // If any SSE connections are active, we're streaming
    if (connections.size > 0) {
      setIsStreaming(true)
      updateConnectionStatus('connected')
      return
    }

    // Only polling — connected but not streaming
    if (pollingIds.size > 0) {
      setIsStreaming(false)
      updateConnectionStatus('connected')
    }
  }, [updateConnectionStatus])

  /**
   * Handle an SSE progress update for a run.
   */
  const handleRunUpdate = useCallback(
    (runId: string, data: RunStatusUpdate) => {
      if (!mountedRef.current) return

      setRunStatuses((prev) => {
        const next = new Map(prev)
        next.set(runId, data)
        return next
      })

      // Update React Query cache for consistency
      queryClient.setQueryData<WorkflowStatusPoll>(
        workflowQueryKeys.status(runId),
        {
          id: runId,
          status: data.status,
          isRunning: data.status === 'RUNNING',
          isComplete: data.status === 'COMPLETED',
          isFailed:
            data.status === 'FAILED' ||
            data.status === 'CANCELLED' ||
            data.status === 'TERMINATED',
          progress: data.progress,
          summary: data.summary,
          error: data.error,
        },
      )
    },
    [queryClient],
  )

  // =========================================================================
  // Polling Fallback
  // =========================================================================

  /**
   * Execute a single batch poll for all active polling run IDs.
   * Uses a generation counter to discard results from stale polls.
   */
  const executeBatchPoll = useCallback(async () => {
    if (!mountedRef.current) return
    const runIds = Array.from(pollingRunIdsRef.current)
    if (runIds.length === 0) return

    const generation = pollGenerationRef.current

    const results = await Promise.allSettled(
      runIds.map(async (runId) => {
        const status = await api.getWorkflowRunStatus(runId)
        return { runId, status }
      }),
    )

    if (!mountedRef.current) return
    if (generation !== pollGenerationRef.current) return

    const completedRunIds: string[] = []

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { runId, status } = result.value
        handleRunUpdate(runId, pollToUpdate(runId, status))

        if (!status.isRunning) {
          completedRunIds.push(runId)
        }
      } else {
        console.warn('Batch poll failed for a run:', result.reason)
      }
    }

    for (const runId of completedRunIds) {
      pollingRunIdsRef.current.delete(runId)
    }

    if (
      pollingRunIdsRef.current.size === 0 &&
      batchPollingIntervalRef.current
    ) {
      clearInterval(batchPollingIntervalRef.current)
      batchPollingIntervalRef.current = null
    }
  }, [handleRunUpdate])

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
      executeBatchPoll()
      ensureBatchPollingStarted()
      recomputeConnectionStatus()
    },
    [executeBatchPoll, ensureBatchPollingStarted, recomputeConnectionStatus],
  )

  /**
   * Stop polling for a specific run ID.
   */
  const stopPolling = useCallback(
    (runId: string) => {
      pollingRunIdsRef.current.delete(runId)

      if (
        pollingRunIdsRef.current.size === 0 &&
        batchPollingIntervalRef.current
      ) {
        clearInterval(batchPollingIntervalRef.current)
        batchPollingIntervalRef.current = null
      }

      recomputeConnectionStatus()
    },
    [recomputeConnectionStatus],
  )

  /**
   * Stop all polling and invalidate in-flight poll results.
   */
  const stopAllPolling = useCallback(() => {
    pollingRunIdsRef.current.clear()
    pollGenerationRef.current++
    if (batchPollingIntervalRef.current) {
      clearInterval(batchPollingIntervalRef.current)
      batchPollingIntervalRef.current = null
    }
  }, [])

  // =========================================================================
  // SSE Connection Management
  // =========================================================================

  /**
   * Close an SSE connection for a run and clean up its state.
   */
  const closeSseConnection = useCallback((runId: string) => {
    const sub = sseConnectionsRef.current.get(runId)
    if (!sub) return

    if (sub.reconnectTimeout) {
      clearTimeout(sub.reconnectTimeout)
    }
    sub.eventSource.close()
    sseConnectionsRef.current.delete(runId)
  }, [])

  /**
   * Open an SSE connection for a specific run ID.
   * Falls back to polling on failure after max reconnect attempts.
   */
  const openSseConnection = useCallback(
    (runId: string) => {
      if (!mountedRef.current) return

      // Close existing connection for this run if any
      closeSseConnection(runId)

      const projectId =
        typeof window !== 'undefined'
          ? localStorage.getItem('neon-project-id') || 'default'
          : 'default'
      const url = `/api/eval-progress?runId=${encodeURIComponent(runId)}&projectId=${encodeURIComponent(projectId)}`

      try {
        const es = new EventSource(url)

        const subscription: SseSubscription = {
          runId,
          eventSource: es,
          reconnectAttempts: 0,
          reconnectTimeout: null,
        }
        sseConnectionsRef.current.set(runId, subscription)

        es.onopen = () => {
          if (!mountedRef.current) {
            es.close()
            return
          }
          subscription.reconnectAttempts = 0
          recomputeConnectionStatus()
        }

        // Listen for progress events
        es.addEventListener('progress', (event) => {
          try {
            const parsed = JSON.parse(event.data)
            if (parsed.data) {
              handleRunUpdate(runId, {
                runId,
                status: parsed.data.status,
                progress: parsed.data.progress,
                summary: parsed.data.summary,
                error: parsed.data.error,
                latestResult: parsed.data.latestResult,
              })
            }
          } catch {
            console.error('Failed to parse SSE progress event')
          }
        })

        // Listen for completion events
        es.addEventListener('complete', (event) => {
          try {
            const parsed = JSON.parse(event.data)
            if (parsed.data) {
              handleRunUpdate(runId, {
                runId,
                status: parsed.data.status,
                progress: parsed.data.progress,
                summary: parsed.data.summary,
                error: parsed.data.error,
              })
            }
          } catch {
            console.error('Failed to parse SSE complete event')
          }
          // Close on completion — run is done
          closeSseConnection(runId)
          recomputeConnectionStatus()
        })

        // Listen for error events (both SSE data errors and connection errors)
        es.addEventListener('error', (event) => {
          // Check if it's an SSE error event with data
          if (event instanceof MessageEvent && event.data) {
            try {
              const parsed = JSON.parse(event.data)
              if (parsed.data?.error) {
                onErrorRef.current?.({
                  code: 'SSE_ERROR',
                  message: parsed.data.error,
                })
              }
              if (parsed.data) {
                handleRunUpdate(runId, {
                  runId,
                  status: parsed.data.status,
                  progress: parsed.data.progress,
                  summary: parsed.data.summary,
                  error: parsed.data.error,
                })
              }
            } catch {
              // Not a data event
            }
            closeSseConnection(runId)
            recomputeConnectionStatus()
            return
          }

          // Connection error — attempt reconnection
          if (!mountedRef.current) return

          es.close()

          if (subscription.reconnectAttempts >= maxReconnectAttempts) {
            // Give up on SSE, fall back to polling for this run
            sseConnectionsRef.current.delete(runId)
            startPolling(runId)
            return
          }

          subscription.reconnectAttempts++
          const delay =
            reconnectDelay * 2 ** (subscription.reconnectAttempts - 1)

          subscription.reconnectTimeout = setTimeout(() => {
            if (mountedRef.current) {
              openSseConnection(runId)
            }
          }, delay)
        })

        // Handle generic message events (initial connection, heartbeats)
        es.onmessage = () => {
          // Heartbeats and connection confirmations — no action needed
        }
      } catch {
        // EventSource creation failed — fall back to polling
        startPolling(runId)
      }
    },
    [
      closeSseConnection,
      handleRunUpdate,
      maxReconnectAttempts,
      reconnectDelay,
      recomputeConnectionStatus,
      startPolling,
    ],
  )

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Subscribe to updates for a specific run.
   */
  const subscribe = useCallback(
    (runId: string) => {
      // Already subscribed via SSE or polling
      if (sseConnectionsRef.current.has(runId)) return
      if (pollingRunIdsRef.current.has(runId)) return

      openSseConnection(runId)
    },
    [openSseConnection],
  )

  /**
   * Unsubscribe from updates for a specific run.
   */
  const unsubscribe = useCallback(
    (runId: string) => {
      closeSseConnection(runId)
      stopPolling(runId)

      // Remove from local state
      setRunStatuses((prev) => {
        const next = new Map(prev)
        next.delete(runId)
        return next
      })

      recomputeConnectionStatus()
    },
    [closeSseConnection, stopPolling, recomputeConnectionStatus],
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
   * Manually trigger reconnection for all subscriptions.
   */
  const reconnect = useCallback(() => {
    // Collect current run IDs before clearing
    const runIds = [
      ...Array.from(sseConnectionsRef.current.keys()),
      ...Array.from(pollingRunIdsRef.current),
    ]

    // Close all existing connections
    for (const runId of sseConnectionsRef.current.keys()) {
      closeSseConnection(runId)
    }
    stopAllPolling()

    // Re-open SSE connections for all runs
    for (const runId of runIds) {
      openSseConnection(runId)
    }
  }, [closeSseConnection, stopAllPolling, openSseConnection])

  /**
   * Disconnect all connections and clean up.
   */
  const disconnectAll = useCallback(() => {
    // Close all SSE connections
    for (const runId of Array.from(sseConnectionsRef.current.keys())) {
      closeSseConnection(runId)
    }

    // Stop all polling
    stopAllPolling()

    // Only update state if still mounted
    if (mountedRef.current) {
      setIsStreaming(false)
      setRunStatuses(new Map())
      updateConnectionStatus('disconnected')
    }
  }, [closeSseConnection, stopAllPolling, updateConnectionStatus])

  // Store disconnectAll in ref for cleanup effect
  const disconnectAllRef = useRef(disconnectAll)
  useEffect(() => {
    disconnectAllRef.current = disconnectAll
  }, [disconnectAll])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      disconnectAllRef.current()
    }
  }, [])

  return {
    connectionStatus,
    isWebSocket: isStreaming,
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
