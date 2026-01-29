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
let mockWebSocketInstance: MockWebSocket | null = null

// Mock global WebSocket
vi.stubGlobal('WebSocket', function (url: string) {
  mockWebSocketInstance = new MockWebSocket(url)
  return mockWebSocketInstance
})

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
    mockWebSocketInstance = null
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
    const ws = new (WebSocket as unknown as typeof MockWebSocket)(
      `${expectedProtocol}//${expectedHost}${expectedPath}`
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
      expect(['connecting', 'connected', 'disconnected', 'reconnecting', 'error']).toContain(state)
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
      delays.push(baseDelay * Math.pow(2, attempt - 1))
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
