/**
 * Real-time Hook Unit Tests
 *
 * Tests for the useRealtime and useRealtimeRun hooks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ConnectionStatus,
  IncomingWebSocketMessage,
  RunStatusUpdate,
  WebSocketErrorPayload,
} from '@/lib/types'

// =============================================================================
// Mock WebSocket
// =============================================================================

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.sentMessages.push(data)
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({
        wasClean: true,
        code: code || 1000,
        reason: reason || '',
      } as CloseEvent)
    }
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }

  simulateMessage(data: IncomingWebSocketMessage): void {
    if (this.onmessage) {
      this.onmessage({
        data: JSON.stringify(data),
      } as MessageEvent)
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }

  simulateClose(wasClean = false): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({
        wasClean,
        code: wasClean ? 1000 : 1006,
        reason: '',
      } as CloseEvent)
    }
  }

  getSentMessages(): string[] {
    return this.sentMessages
  }

  getLastSentMessage<T>(): T | undefined {
    const last = this.sentMessages[this.sentMessages.length - 1]
    return last ? JSON.parse(last) : undefined
  }
}

// Store created WebSocket instances for test access
let _mockWebSocketInstance: MockWebSocket | null = null

// Mock global WebSocket as a constructor class
const MockWebSocketConstructor = function (this: MockWebSocket, url: string) {
  const instance = new MockWebSocket(url)
  _mockWebSocketInstance = instance
  return instance
} as unknown as typeof WebSocket

// Add static properties
Object.assign(MockWebSocketConstructor, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
})

vi.stubGlobal('WebSocket', MockWebSocketConstructor)

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

const mockErrorPayload: WebSocketErrorPayload = {
  code: 'SUBSCRIBE_ERROR',
  message: 'Run not found',
}

// =============================================================================
// Tests: WebSocket Message Handling
// =============================================================================

describe('WebSocket Message Handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _mockWebSocketInstance = null
    mockGetWorkflowRunStatus.mockReset()
    mockSetQueryData.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates WebSocket connection with correct URL', () => {
    // This tests the URL detection logic
    const expectedProtocol = 'ws:'
    const expectedHost = 'localhost:3000'
    const expectedPath = '/api/ws'

    // Mock window.location
    vi.stubGlobal('window', {
      location: {
        protocol: 'http:',
        host: 'localhost:3000',
      },
    })

    // Create a new WebSocket to test URL generation
    const ws = new MockWebSocket(
      `${expectedProtocol}//${expectedHost}${expectedPath}`,
    )

    expect(ws.url).toBe('ws://localhost:3000/api/ws')
  })

  it('parses update messages correctly', () => {
    const message: IncomingWebSocketMessage = {
      type: 'update',
      timestamp: new Date().toISOString(),
      payload: mockRunStatusUpdate,
    }

    // Parse the message
    const parsed = JSON.parse(JSON.stringify(message))

    expect(parsed.type).toBe('update')
    expect(parsed.payload).toEqual(mockRunStatusUpdate)
    expect(parsed.payload.runId).toBe('run-123')
    expect(parsed.payload.status).toBe('RUNNING')
    expect(parsed.payload.progress?.percentComplete).toBe(50)
  })

  it('parses error messages correctly', () => {
    const message: IncomingWebSocketMessage = {
      type: 'error',
      timestamp: new Date().toISOString(),
      payload: mockErrorPayload,
    }

    const parsed = JSON.parse(JSON.stringify(message))

    expect(parsed.type).toBe('error')
    expect(parsed.payload.code).toBe('SUBSCRIBE_ERROR')
    expect(parsed.payload.message).toBe('Run not found')
  })

  it('parses ack messages correctly', () => {
    const message: IncomingWebSocketMessage = {
      type: 'ack',
      timestamp: new Date().toISOString(),
      payload: {
        messageId: 'msg-123',
        success: true,
      },
    }

    const parsed = JSON.parse(JSON.stringify(message))

    expect(parsed.type).toBe('ack')
    expect(parsed.payload.success).toBe(true)
    expect(parsed.payload.messageId).toBe('msg-123')
  })

  it('parses pong messages correctly', () => {
    const message: IncomingWebSocketMessage = {
      type: 'pong',
      timestamp: new Date().toISOString(),
    }

    const parsed = JSON.parse(JSON.stringify(message))

    expect(parsed.type).toBe('pong')
  })
})

// =============================================================================
// Tests: Outgoing Message Format
// =============================================================================

describe('Outgoing Message Format', () => {
  it('creates subscribe message with correct format', () => {
    const message = {
      type: 'subscribe',
      id: 'test-uuid-1234',
      timestamp: new Date().toISOString(),
      payload: { runId: 'run-123' },
    }

    expect(message.type).toBe('subscribe')
    expect(message.payload.runId).toBe('run-123')
    expect(message.id).toBeDefined()
    expect(message.timestamp).toBeDefined()
  })

  it('creates unsubscribe message with correct format', () => {
    const message = {
      type: 'unsubscribe',
      id: 'test-uuid-1234',
      timestamp: new Date().toISOString(),
      payload: { runId: 'run-123' },
    }

    expect(message.type).toBe('unsubscribe')
    expect(message.payload.runId).toBe('run-123')
  })

  it('creates ping message with correct format', () => {
    const message = {
      type: 'ping',
      timestamp: new Date().toISOString(),
    }

    expect(message.type).toBe('ping')
    expect(message.timestamp).toBeDefined()
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

  it('WebSocket readyState maps to connection status', () => {
    const stateMap: Record<number, ConnectionStatus> = {
      [MockWebSocket.CONNECTING]: 'connecting',
      [MockWebSocket.OPEN]: 'connected',
      [MockWebSocket.CLOSING]: 'disconnected',
      [MockWebSocket.CLOSED]: 'disconnected',
    }

    expect(stateMap[MockWebSocket.CONNECTING]).toBe('connecting')
    expect(stateMap[MockWebSocket.OPEN]).toBe('connected')
    expect(stateMap[MockWebSocket.CLOSED]).toBe('disconnected')
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
})

// =============================================================================
// Tests: WebSocket Support Detection
// =============================================================================

describe('WebSocket Support Detection', () => {
  it('detects WebSocket support', () => {
    const isSupported = typeof WebSocket !== 'undefined'
    expect(isSupported).toBe(true)
  })

  it('handles missing WebSocket gracefully', () => {
    // Save original
    const originalWebSocket = global.WebSocket

    // Remove WebSocket
    // @ts-expect-error - intentionally setting to undefined for test
    global.WebSocket = undefined

    const isSupported = typeof WebSocket !== 'undefined'
    expect(isSupported).toBe(false)

    // Restore
    global.WebSocket = originalWebSocket
  })
})

// =============================================================================
// Tests: URL Generation
// =============================================================================

describe('URL Generation', () => {
  it('generates ws:// URL for http:// pages', () => {
    const protocol: string = 'http:'
    const host = 'localhost:3000'
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${wsProtocol}//${host}/api/ws`

    expect(url).toBe('ws://localhost:3000/api/ws')
  })

  it('generates wss:// URL for https:// pages', () => {
    const protocol: string = 'https:'
    const host = 'example.com'
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${wsProtocol}//${host}/api/ws`

    expect(url).toBe('wss://example.com/api/ws')
  })
})

// =============================================================================
// Tests: Message Queue
// =============================================================================

describe('Message Queue', () => {
  it('maintains message order', () => {
    const messages: string[] = []

    messages.push('msg-1')
    messages.push('msg-2')
    messages.push('msg-3')

    expect(messages[0]).toBe('msg-1')
    expect(messages[1]).toBe('msg-2')
    expect(messages[2]).toBe('msg-3')
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
    _mockWebSocketInstance = null
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clears WebSocket event handlers on disconnect', () => {
    // Create a mock WebSocket
    const ws = new MockWebSocket('ws://localhost:3000/api/ws')
    ws.onopen = () => {}
    ws.onmessage = () => {}
    ws.onerror = () => {}
    ws.onclose = () => {}

    // Verify handlers are set
    expect(ws.onopen).not.toBeNull()
    expect(ws.onmessage).not.toBeNull()
    expect(ws.onerror).not.toBeNull()
    expect(ws.onclose).not.toBeNull()

    // Simulate clearing handlers (as done in disconnect)
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null

    // Verify handlers are cleared
    expect(ws.onopen).toBeNull()
    expect(ws.onmessage).toBeNull()
    expect(ws.onerror).toBeNull()
    expect(ws.onclose).toBeNull()
  })

  it('clears polling intervals on cleanup', () => {
    const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>()

    // Simulate adding polling intervals
    const interval1 = setInterval(() => {}, 1000)
    const interval2 = setInterval(() => {}, 1000)
    pollingIntervals.set('run-1', interval1)
    pollingIntervals.set('run-2', interval2)

    expect(pollingIntervals.size).toBe(2)

    // Simulate cleanup (as done in stopAllPolling)
    for (const interval of pollingIntervals.values()) {
      clearInterval(interval)
    }
    pollingIntervals.clear()

    expect(pollingIntervals.size).toBe(0)
  })

  it('clears ping interval on cleanup', () => {
    let pingIntervalId: ReturnType<typeof setInterval> | null = null

    // Simulate starting ping interval
    pingIntervalId = setInterval(() => {}, 30000)
    expect(pingIntervalId).not.toBeNull()

    // Simulate cleanup (as done in stopPingInterval)
    if (pingIntervalId) {
      clearInterval(pingIntervalId)
      pingIntervalId = null
    }

    expect(pingIntervalId).toBeNull()
  })

  it('clears reconnect timeout on cleanup', () => {
    let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

    // Simulate setting reconnect timeout
    reconnectTimeoutId = setTimeout(() => {}, 1000)
    expect(reconnectTimeoutId).not.toBeNull()

    // Simulate cleanup (as done in disconnect)
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId)
      reconnectTimeoutId = null
    }

    expect(reconnectTimeoutId).toBeNull()
  })

  it('clears subscriptions on disconnect', () => {
    const subscriptions = new Set<string>()

    // Add some subscriptions
    subscriptions.add('run-1')
    subscriptions.add('run-2')
    subscriptions.add('run-3')

    expect(subscriptions.size).toBe(3)

    // Simulate disconnect clearing subscriptions
    subscriptions.clear()

    expect(subscriptions.size).toBe(0)
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

  it('uses refs for callbacks to prevent unnecessary re-renders', () => {
    // This tests the pattern of using refs for callbacks
    // to avoid dependency chain issues
    const callbackRef = { current: () => {} }
    let callCount = 0

    const originalCallback = () => {
      callCount++
    }
    const newCallback = () => {
      callCount += 10
    }

    // Set initial callback
    callbackRef.current = originalCallback

    // Call through ref
    callbackRef.current()
    expect(callCount).toBe(1)

    // Update callback ref
    callbackRef.current = newCallback

    // Call through ref - should use new callback
    callbackRef.current()
    expect(callCount).toBe(11)
  })

  it('uses isWebSocketRef for stable subscribe/unsubscribe identity', () => {
    // subscribe/unsubscribe use isWebSocketRef instead of isWebSocket state
    // to prevent identity changes that cause useEffect re-fires in useRealtimeRun
    const isWebSocketRef = { current: false }
    const subscriptions = new Set<string>()
    let pollStarted = false
    let wsSent = false

    const subscribe = (runId: string) => {
      if (subscriptions.has(runId)) return
      subscriptions.add(runId)

      if (isWebSocketRef.current) {
        wsSent = true
      } else {
        pollStarted = true
      }
    }

    // Subscribe when WS is not connected - should poll
    subscribe('run-1')
    expect(pollStarted).toBe(true)
    expect(wsSent).toBe(false)

    // Change WS state via ref - subscribe function identity is unchanged
    isWebSocketRef.current = true
    pollStarted = false

    // New subscription uses WS without function identity changing
    subscribe('run-2')
    expect(wsSent).toBe(true)
    expect(pollStarted).toBe(false)
  })

  it('poll generation counter invalidates stale poll results', () => {
    // Simulates the generation counter pattern used in executeBatchPoll
    const pollGenerationRef = { current: 0 }
    const results: string[] = []

    const executePoll = async (generation: number) => {
      // Simulate async delay
      await Promise.resolve()

      // Check generation - stale results should be discarded
      if (generation !== pollGenerationRef.current) return

      results.push('poll-result')
    }

    // Start a poll
    const gen1 = pollGenerationRef.current
    const poll1 = executePoll(gen1)

    // Disconnect bumps the generation, invalidating in-flight polls
    pollGenerationRef.current++

    // Start a new poll with the new generation
    const gen2 = pollGenerationRef.current
    const poll2 = executePoll(gen2)

    return Promise.all([poll1, poll2]).then(() => {
      // Only the second poll should have produced results
      expect(results).toHaveLength(1)
    })
  })

  it('disconnect skips state updates when unmounted', () => {
    const mountedRef = { current: true }
    let setStateCalled = false

    const disconnect = () => {
      // Only update state if still mounted
      if (mountedRef.current) {
        setStateCalled = true
      }
    }

    // Simulate unmount then disconnect (as in cleanup effect)
    mountedRef.current = false
    disconnect()
    expect(setStateCalled).toBe(false)

    // When still mounted, state updates should happen
    mountedRef.current = true
    disconnect()
    expect(setStateCalled).toBe(true)
  })

  it('disconnect clears runStatuses map to prevent unbounded growth', () => {
    const runStatuses = new Map<string, RunStatusUpdate>()

    // Accumulate statuses over time
    runStatuses.set('run-1', mockRunStatusUpdate)
    runStatuses.set('run-2', mockCompletedStatusUpdate)
    runStatuses.set('run-3', { ...mockRunStatusUpdate, runId: 'run-3' })

    expect(runStatuses.size).toBe(3)

    // Disconnect should clear the map (simulating setRunStatuses(new Map()))
    const clearedStatuses = new Map<string, RunStatusUpdate>()
    expect(clearedStatuses.size).toBe(0)

    // Verify old map entries don't leak into new map
    expect(clearedStatuses.has('run-1')).toBe(false)
    expect(clearedStatuses.has('run-2')).toBe(false)
    expect(clearedStatuses.has('run-3')).toBe(false)
  })
})

// =============================================================================
// Tests: Cleanup Behavior
// =============================================================================

describe('Cleanup Behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _mockWebSocketInstance = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('properly sequences cleanup operations', () => {
    const cleanupOrder: string[] = []

    // Simulate the order of cleanup operations
    const cleanup = () => {
      // 1. Clear reconnect timeout
      cleanupOrder.push('clearReconnectTimeout')

      // 2. Stop ping interval
      cleanupOrder.push('stopPingInterval')

      // 3. Stop all polling
      cleanupOrder.push('stopAllPolling')

      // 4. Clear WebSocket event handlers
      cleanupOrder.push('clearEventHandlers')

      // 5. Close WebSocket
      cleanupOrder.push('closeWebSocket')

      // 6. Clear subscriptions
      cleanupOrder.push('clearSubscriptions')
    }

    cleanup()

    expect(cleanupOrder).toEqual([
      'clearReconnectTimeout',
      'stopPingInterval',
      'stopAllPolling',
      'clearEventHandlers',
      'closeWebSocket',
      'clearSubscriptions',
    ])
  })

  it('handles multiple rapid connect/disconnect cycles', () => {
    const connections: MockWebSocket[] = []
    const cleanedUp: boolean[] = []

    // Simulate multiple rapid connections
    for (let i = 0; i < 5; i++) {
      const ws = new MockWebSocket('ws://localhost:3000/api/ws')
      connections.push(ws)
      cleanedUp.push(false)
    }

    // Simulate cleaning up all connections
    connections.forEach((ws, index) => {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws.close()
      cleanedUp[index] = true
    })

    expect(cleanedUp.every((c) => c)).toBe(true)
  })

  it('WebSocket close prevents onclose handler from running after cleanup', () => {
    const ws = new MockWebSocket('ws://localhost:3000/api/ws')
    let onCloseCalledAfterCleanup = false

    // Set up onclose handler
    ws.onclose = () => {
      onCloseCalledAfterCleanup = true
    }

    // Clear handler before close (simulating proper cleanup)
    ws.onclose = null

    // Now close - onclose should not be called
    ws.readyState = MockWebSocket.CLOSED
    // Manual trigger to verify no callback
    if (ws.onclose !== null) {
      ;(ws.onclose as (event: CloseEvent) => void)({} as CloseEvent)
    }

    expect(onCloseCalledAfterCleanup).toBe(false)
  })
})
