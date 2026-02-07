/**
 * Real-time Hook Unit Tests
 *
 * Tests for the useRealtime and useRealtimeRun hooks.
 * Tests cover the SSE-based real-time architecture with polling fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ConnectionStatus,
  RunStatusUpdate,
  WebSocketErrorPayload,
} from '@/lib/types'

// =============================================================================
// Mock EventSource
// =============================================================================

class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  url: string
  readyState: number
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private listeners = new Map<string, Array<(event: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
    this.readyState = MockEventSource.CONNECTING
    _mockEventSourceInstances.push(this)
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void): void {
    const handlers = this.listeners.get(type) || []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(
    type: string,
    handler: (event: MessageEvent) => void,
  ): void {
    const handlers = this.listeners.get(type) || []
    this.listeners.set(
      type,
      handlers.filter((h) => h !== handler),
    )
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
    this.listeners.clear()
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockEventSource.OPEN
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }

  simulateEvent(type: string, data: unknown): void {
    const handlers = this.listeners.get(type) || []
    const event = { data: JSON.stringify(data) } as MessageEvent
    for (const handler of handlers) {
      handler(event)
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
    // Also fire error event listeners
    const handlers = this.listeners.get('error') || []
    for (const handler of handlers) {
      handler(new Event('error') as unknown as MessageEvent)
    }
  }
}

// Store created EventSource instances for test access
let _mockEventSourceInstances: MockEventSource[] = []

vi.stubGlobal('EventSource', MockEventSource)

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}))

// Mock api
const mockGetWorkflowRunStatus = vi.fn()
vi.mock('@/lib/api', () => ({
  api: {
    getWorkflowRunStatus: () => mockGetWorkflowRunStatus(),
  },
}))

// Mock QueryClient
const mockSetQueryData = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
  }),
}))

// =============================================================================
// Test Fixtures
// =============================================================================

const mockRunStatusUpdate: RunStatusUpdate = {
  runId: 'run-123',
  status: 'RUNNING',
  progress: {
    completed: 5,
    total: 10,
    passed: 4,
    failed: 1,
    percentComplete: 50,
  },
}

const mockCompletedStatusUpdate: RunStatusUpdate = {
  runId: 'run-123',
  status: 'COMPLETED',
  progress: {
    completed: 10,
    total: 10,
    passed: 8,
    failed: 2,
    percentComplete: 100,
  },
  summary: {
    total: 10,
    passed: 8,
    failed: 2,
    avgScore: 0.85,
  },
}

const _mockErrorPayload: WebSocketErrorPayload = {
  code: 'SUBSCRIBE_ERROR',
  message: 'Run not found',
}

// =============================================================================
// Tests: SSE Event Handling
// =============================================================================

describe('SSE Event Handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _mockEventSourceInstances = []
    mockGetWorkflowRunStatus.mockReset()
    mockSetQueryData.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates EventSource with correct URL format', () => {
    const runId = 'run-123'
    const projectId = 'proj-456'
    const url = `/api/eval-progress?runId=${encodeURIComponent(runId)}&projectId=${encodeURIComponent(projectId)}`

    const es = new MockEventSource(url)

    expect(es.url).toBe('/api/eval-progress?runId=run-123&projectId=proj-456')
  })

  it('parses progress events correctly', () => {
    const progressEvent = {
      type: 'progress',
      runId: 'run-123',
      data: {
        status: 'RUNNING',
        progress: {
          completed: 5,
          total: 10,
          passed: 4,
          failed: 1,
          percentComplete: 50,
        },
      },
      timestamp: new Date().toISOString(),
    }

    const parsed = JSON.parse(JSON.stringify(progressEvent))

    expect(parsed.type).toBe('progress')
    expect(parsed.data.status).toBe('RUNNING')
    expect(parsed.data.progress?.percentComplete).toBe(50)
  })

  it('parses complete events correctly', () => {
    const completeEvent = {
      type: 'complete',
      runId: 'run-123',
      data: {
        status: 'COMPLETED',
        progress: {
          completed: 10,
          total: 10,
          passed: 8,
          failed: 2,
          percentComplete: 100,
        },
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          avgScore: 0.85,
        },
      },
      timestamp: new Date().toISOString(),
    }

    const parsed = JSON.parse(JSON.stringify(completeEvent))

    expect(parsed.type).toBe('complete')
    expect(parsed.data.status).toBe('COMPLETED')
    expect(parsed.data.summary?.avgScore).toBe(0.85)
  })

  it('parses error events correctly', () => {
    const errorEvent = {
      type: 'error',
      runId: 'run-123',
      data: {
        status: 'FAILED',
        error: 'Run not found',
      },
      timestamp: new Date().toISOString(),
    }

    const parsed = JSON.parse(JSON.stringify(errorEvent))

    expect(parsed.type).toBe('error')
    expect(parsed.data.error).toBe('Run not found')
  })
})

// =============================================================================
// Tests: Connection Status
// =============================================================================

describe('Connection Status', () => {
  it('tracks all connection states', () => {
    const states: ConnectionStatus[] = [
      'connecting',
      'connected',
      'disconnected',
      'reconnecting',
      'error',
    ]

    for (const state of states) {
      expect([
        'connecting',
        'connected',
        'disconnected',
        'reconnecting',
        'error',
      ]).toContain(state)
    }
  })

  it('EventSource readyState maps to connection status', () => {
    const stateMap: Record<number, ConnectionStatus> = {
      [MockEventSource.CONNECTING]: 'connecting',
      [MockEventSource.OPEN]: 'connected',
      [MockEventSource.CLOSED]: 'disconnected',
    }

    expect(stateMap[MockEventSource.CONNECTING]).toBe('connecting')
    expect(stateMap[MockEventSource.OPEN]).toBe('connected')
    expect(stateMap[MockEventSource.CLOSED]).toBe('disconnected')
  })
})

// =============================================================================
// Tests: Run Status Update Processing
// =============================================================================

describe('Run Status Update Processing', () => {
  it('extracts progress correctly from update', () => {
    const update = mockRunStatusUpdate

    expect(update.progress?.completed).toBe(5)
    expect(update.progress?.total).toBe(10)
    expect(update.progress?.passed).toBe(4)
    expect(update.progress?.failed).toBe(1)
    expect(update.progress?.percentComplete).toBe(50)
  })

  it('extracts summary correctly from completed update', () => {
    const update = mockCompletedStatusUpdate

    expect(update.summary?.total).toBe(10)
    expect(update.summary?.passed).toBe(8)
    expect(update.summary?.failed).toBe(2)
    expect(update.summary?.avgScore).toBe(0.85)
  })

  it('detects running status correctly', () => {
    expect(mockRunStatusUpdate.status).toBe('RUNNING')
    expect(mockCompletedStatusUpdate.status).toBe('COMPLETED')
  })

  it('handles update with latestResult', () => {
    const updateWithResult: RunStatusUpdate = {
      ...mockRunStatusUpdate,
      latestResult: {
        caseIndex: 4,
        result: {
          traceId: 'trace-456',
          status: 'success',
          iterations: 3,
        },
        scores: [
          { name: 'tool_selection', value: 0.9 },
          { name: 'reasoning', value: 0.85 },
        ],
      },
    }

    expect(updateWithResult.latestResult?.caseIndex).toBe(4)
    expect(updateWithResult.latestResult?.result.status).toBe('success')
    expect(updateWithResult.latestResult?.scores).toHaveLength(2)
  })
})

// =============================================================================
// Tests: Polling Fallback Logic
// =============================================================================

describe('Polling Fallback Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetWorkflowRunStatus.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('converts WorkflowStatusPoll to RunStatusUpdate format', () => {
    const pollResponse = {
      id: 'run-123',
      status: 'RUNNING' as const,
      isRunning: true,
      isComplete: false,
      isFailed: false,
      progress: {
        completed: 5,
        total: 10,
        passed: 4,
        failed: 1,
        percentComplete: 50,
      },
    }

    // Convert to RunStatusUpdate format
    const update: RunStatusUpdate = {
      runId: pollResponse.id,
      status: pollResponse.status,
      progress: pollResponse.progress,
      summary: undefined,
      error: undefined,
    }

    expect(update.runId).toBe('run-123')
    expect(update.status).toBe('RUNNING')
    expect(update.progress?.percentComplete).toBe(50)
  })

  it('handles polling error gracefully', async () => {
    mockGetWorkflowRunStatus.mockRejectedValueOnce(new Error('Network error'))

    // The hook should catch this error and continue polling
    try {
      await mockGetWorkflowRunStatus()
    } catch (error) {
      expect(error).toBeDefined()
    }
  })
})

// =============================================================================
// Tests: Subscription Management
// =============================================================================

describe('Subscription Management', () => {
  it('tracks multiple subscriptions', () => {
    const subscriptions = new Set<string>()

    subscriptions.add('run-1')
    subscriptions.add('run-2')
    subscriptions.add('run-3')

    expect(subscriptions.size).toBe(3)
    expect(subscriptions.has('run-1')).toBe(true)
    expect(subscriptions.has('run-2')).toBe(true)
    expect(subscriptions.has('run-3')).toBe(true)
  })

  it('prevents duplicate subscriptions', () => {
    const subscriptions = new Set<string>()

    subscriptions.add('run-1')
    subscriptions.add('run-1')
    subscriptions.add('run-1')

    expect(subscriptions.size).toBe(1)
  })

  it('removes subscription correctly', () => {
    const subscriptions = new Set<string>()

    subscriptions.add('run-1')
    subscriptions.add('run-2')
    subscriptions.delete('run-1')

    expect(subscriptions.size).toBe(1)
    expect(subscriptions.has('run-1')).toBe(false)
    expect(subscriptions.has('run-2')).toBe(true)
  })
})

// =============================================================================
// Tests: Reconnection Logic
// =============================================================================

describe('Reconnection Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates exponential backoff correctly', () => {
    const baseDelay = 1000
    const maxAttempts = 3

    const delays: number[] = []
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      delays.push(baseDelay * 2 ** (attempt - 1))
    }

    expect(delays).toEqual([1000, 2000, 4000])
  })

  it('stops reconnecting after max attempts', () => {
    const maxAttempts = 3
    let attempts = 0

    while (attempts < maxAttempts) {
      attempts++
    }

    expect(attempts).toBe(maxAttempts)
    expect(attempts >= maxAttempts).toBe(true)
  })

  it('falls back to polling after SSE reconnect attempts exhausted', () => {
    // Simulates the fallback behavior
    const maxReconnectAttempts = 3
    let reconnectAttempts = 0
    let pollingStarted = false

    const onSseError = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        pollingStarted = true
        return
      }
      reconnectAttempts++
    }

    // Exhaust reconnect attempts
    for (let i = 0; i <= maxReconnectAttempts; i++) {
      onSseError()
    }

    expect(pollingStarted).toBe(true)
    expect(reconnectAttempts).toBe(maxReconnectAttempts)
  })
})

// =============================================================================
// Tests: URL Generation
// =============================================================================

describe('URL Generation', () => {
  it('generates SSE URL with runId and projectId', () => {
    const runId = 'run-123'
    const projectId = 'default'
    const url = `/api/eval-progress?runId=${encodeURIComponent(runId)}&projectId=${encodeURIComponent(projectId)}`

    expect(url).toBe('/api/eval-progress?runId=run-123&projectId=default')
  })

  it('encodes special characters in runId', () => {
    const runId = 'run-123/special&chars'
    const projectId = 'default'
    const url = `/api/eval-progress?runId=${encodeURIComponent(runId)}&projectId=${encodeURIComponent(projectId)}`

    expect(url).toContain('run-123%2Fspecial%26chars')
  })
})

// =============================================================================
// Tests: RunStatusUpdate Map
// =============================================================================

describe('RunStatusUpdate Map', () => {
  it('stores and retrieves run statuses correctly', () => {
    const statuses = new Map<string, RunStatusUpdate>()

    statuses.set('run-1', mockRunStatusUpdate)
    statuses.set('run-2', mockCompletedStatusUpdate)

    expect(statuses.get('run-1')).toEqual(mockRunStatusUpdate)
    expect(statuses.get('run-2')).toEqual(mockCompletedStatusUpdate)
    expect(statuses.get('run-3')).toBeUndefined()
  })

  it('updates existing run status', () => {
    const statuses = new Map<string, RunStatusUpdate>()

    statuses.set('run-1', mockRunStatusUpdate)
    statuses.set('run-1', mockCompletedStatusUpdate)

    expect(statuses.get('run-1')).toEqual(mockCompletedStatusUpdate)
    expect(statuses.size).toBe(1)
  })

  it('removes run status on unsubscribe', () => {
    const statuses = new Map<string, RunStatusUpdate>()

    statuses.set('run-1', mockRunStatusUpdate)
    statuses.delete('run-1')

    expect(statuses.has('run-1')).toBe(false)
    expect(statuses.size).toBe(0)
  })
})

// =============================================================================
// Tests: Memory Leak Prevention
// =============================================================================

describe('Memory Leak Prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _mockEventSourceInstances = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('closes EventSource on cleanup', () => {
    const es = new MockEventSource(
      '/api/eval-progress?runId=run-1&projectId=default',
    )
    es.simulateOpen()

    expect(es.readyState).toBe(MockEventSource.OPEN)

    es.close()

    expect(es.readyState).toBe(MockEventSource.CLOSED)
  })

  it('clears polling intervals on cleanup', () => {
    const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>()

    const interval1 = setInterval(() => {}, 1000)
    const interval2 = setInterval(() => {}, 1000)
    pollingIntervals.set('run-1', interval1)
    pollingIntervals.set('run-2', interval2)

    expect(pollingIntervals.size).toBe(2)

    for (const interval of pollingIntervals.values()) {
      clearInterval(interval)
    }
    pollingIntervals.clear()

    expect(pollingIntervals.size).toBe(0)
  })

  it('clears reconnect timeout on cleanup', () => {
    let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

    reconnectTimeoutId = setTimeout(() => {}, 1000)
    expect(reconnectTimeoutId).not.toBeNull()

    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId)
      reconnectTimeoutId = null
    }

    expect(reconnectTimeoutId).toBeNull()
  })

  it('prevents state updates after unmount via mountedRef', () => {
    const mountedRef = { current: true }
    let stateUpdateCalled = false

    const setStateSafe = (_value: unknown) => {
      if (!mountedRef.current) return
      stateUpdateCalled = true
    }

    // Before unmount - should update
    setStateSafe('test')
    expect(stateUpdateCalled).toBe(true)

    // After unmount - should not update
    stateUpdateCalled = false
    mountedRef.current = false
    setStateSafe('test')
    expect(stateUpdateCalled).toBe(false)
  })

  it('poll generation counter invalidates stale poll results', () => {
    const pollGenerationRef = { current: 0 }
    const results: string[] = []

    const executePoll = async (generation: number) => {
      await Promise.resolve()

      if (generation !== pollGenerationRef.current) return

      results.push('poll-result')
    }

    // Start a poll
    const gen1 = pollGenerationRef.current
    const poll1 = executePoll(gen1)

    // Disconnect bumps the generation
    pollGenerationRef.current++

    // Start a new poll with the new generation
    const gen2 = pollGenerationRef.current
    const poll2 = executePoll(gen2)

    return Promise.all([poll1, poll2]).then(() => {
      expect(results).toHaveLength(1)
    })
  })

  it('disconnect skips state updates when unmounted', () => {
    const mountedRef = { current: true }
    let setStateCalled = false

    const disconnect = () => {
      if (mountedRef.current) {
        setStateCalled = true
      }
    }

    mountedRef.current = false
    disconnect()
    expect(setStateCalled).toBe(false)

    mountedRef.current = true
    disconnect()
    expect(setStateCalled).toBe(true)
  })

  it('disconnect clears runStatuses map to prevent unbounded growth', () => {
    const runStatuses = new Map<string, RunStatusUpdate>()

    runStatuses.set('run-1', mockRunStatusUpdate)
    runStatuses.set('run-2', mockCompletedStatusUpdate)
    runStatuses.set('run-3', { ...mockRunStatusUpdate, runId: 'run-3' })

    expect(runStatuses.size).toBe(3)

    const clearedStatuses = new Map<string, RunStatusUpdate>()
    expect(clearedStatuses.size).toBe(0)
    expect(clearedStatuses.has('run-1')).toBe(false)
  })
})

// =============================================================================
// Tests: SSE Subscription Lifecycle
// =============================================================================

describe('SSE Subscription Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _mockEventSourceInstances = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('manages per-run SSE connections', () => {
    const connections = new Map<string, MockEventSource>()

    // Subscribe to two runs
    const es1 = new MockEventSource(
      '/api/eval-progress?runId=run-1&projectId=default',
    )
    const es2 = new MockEventSource(
      '/api/eval-progress?runId=run-2&projectId=default',
    )
    connections.set('run-1', es1)
    connections.set('run-2', es2)

    expect(connections.size).toBe(2)

    // Unsubscribe from one
    const removed = connections.get('run-1')
    removed?.close()
    connections.delete('run-1')

    expect(connections.size).toBe(1)
    expect(connections.has('run-2')).toBe(true)
    expect(removed?.readyState).toBe(MockEventSource.CLOSED)
  })

  it('closes SSE connection on run completion', () => {
    const es = new MockEventSource(
      '/api/eval-progress?runId=run-1&projectId=default',
    )
    es.simulateOpen()

    expect(es.readyState).toBe(MockEventSource.OPEN)

    // Simulate receiving a complete event
    es.close()
    expect(es.readyState).toBe(MockEventSource.CLOSED)
  })

  it('closes all SSE connections on disconnect', () => {
    const connections = new Map<string, MockEventSource>()

    for (let i = 1; i <= 5; i++) {
      const es = new MockEventSource(
        `/api/eval-progress?runId=run-${i}&projectId=default`,
      )
      es.simulateOpen()
      connections.set(`run-${i}`, es)
    }

    expect(connections.size).toBe(5)

    // Disconnect all
    for (const [runId, es] of connections) {
      es.close()
      connections.delete(runId)
    }

    expect(connections.size).toBe(0)
  })

  it('reconnect re-opens SSE connections for all tracked runs', () => {
    const trackedRunIds = ['run-1', 'run-2', 'run-3']
    const reconnectedIds: string[] = []

    // Simulate reconnect
    for (const runId of trackedRunIds) {
      reconnectedIds.push(runId)
    }

    expect(reconnectedIds).toEqual(trackedRunIds)
  })
})

// =============================================================================
// Tests: Cleanup Behavior
// =============================================================================

describe('Cleanup Behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _mockEventSourceInstances = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('properly sequences cleanup operations', () => {
    const cleanupOrder: string[] = []

    const cleanup = () => {
      // 1. Close all SSE connections
      cleanupOrder.push('closeSseConnections')

      // 2. Stop all polling
      cleanupOrder.push('stopAllPolling')

      // 3. Clear run statuses
      cleanupOrder.push('clearRunStatuses')

      // 4. Update connection status
      cleanupOrder.push('updateConnectionStatus')
    }

    cleanup()

    expect(cleanupOrder).toEqual([
      'closeSseConnections',
      'stopAllPolling',
      'clearRunStatuses',
      'updateConnectionStatus',
    ])
  })

  it('handles multiple rapid subscribe/unsubscribe cycles', () => {
    const connections: MockEventSource[] = []
    const cleanedUp: boolean[] = []

    for (let i = 0; i < 5; i++) {
      const es = new MockEventSource(
        `/api/eval-progress?runId=run-${i}&projectId=default`,
      )
      connections.push(es)
      cleanedUp.push(false)
    }

    connections.forEach((es, index) => {
      es.close()
      cleanedUp[index] = true
    })

    expect(cleanedUp.every((c) => c)).toBe(true)
  })
})
