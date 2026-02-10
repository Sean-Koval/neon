'use client'

/**
 * Live Debugger Component
 *
 * Real-time debugging interface for agent traces with:
 * - WebSocket/SSE connection to debug stream
 * - Breakpoint controls (add, remove, enable, disable)
 * - Execution controls (resume, step over, step into, step out, pause)
 * - Live span stack visualization
 * - Current span inspection
 *
 * @example
 * ```tsx
 * <LiveDebugger
 *   traceId="trace-123"
 *   projectId="project-456"
 *   onClose={() => setDebugMode(false)}
 * />
 * ```
 */

import { clsx } from 'clsx'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bug,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionStatus } from '@/lib/types'
import { ConnectionStatusIndicator } from '../realtime/connection-status'
import {
  getSpanTypeConfig,
  type SpanType,
  SpanTypeBadge,
} from './span-type-badge'

// ============================================================================
// Types
// ============================================================================

/**
 * Debug session state
 */
type DebugState = 'idle' | 'running' | 'paused' | 'stepping' | 'completed'

/**
 * Span data from debug stream
 */
interface DebugSpan {
  spanId: string
  traceId: string
  parentSpanId?: string | null
  name: string
  spanType: SpanType | string
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

/**
 * Breakpoint definition
 */
interface Breakpoint {
  id: string
  name?: string
  enabled: boolean
  spanType?: SpanType | SpanType[]
  spanName?: string
  toolName?: string
  model?: string
  trigger: 'onEnter' | 'onExit' | 'onError'
}

/**
 * Debug event from stream
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
    breakpoint?: Breakpoint
    state?: DebugState
    stepMode?: 'over' | 'into' | 'out'
    message?: string
    data?: Record<string, unknown>
    connectionId?: string
    sessionState?: {
      state: DebugState
      currentSpanId: string | null
    }
  }
}

// ============================================================================
// Props
// ============================================================================

interface LiveDebuggerProps {
  /** Trace ID to debug */
  traceId: string
  /** Project ID for authentication */
  projectId?: string
  /** Callback when debugger is closed */
  onClose?: () => void
  /** Initial breakpoints */
  initialBreakpoints?: Breakpoint[]
  /** Additional CSS classes */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export function LiveDebugger({
  traceId,
  projectId = '00000000-0000-0000-0000-000000000001',
  onClose,
  initialBreakpoints = [],
  className = '',
}: LiveDebuggerProps) {
  // Connection state
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected')
  const eventSourceRef = useRef<EventSource | null>(null)

  // Debug state
  const [debugState, setDebugState] = useState<DebugState>('idle')
  const [currentSpan, setCurrentSpan] = useState<DebugSpan | null>(null)
  const [spanStack, setSpanStack] = useState<DebugSpan[]>([])
  const [eventLog, setEventLog] = useState<DebugEvent[]>([])

  // Breakpoints
  const [breakpoints, setBreakpoints] =
    useState<Breakpoint[]>(initialBreakpoints)
  const [showAddBreakpoint, setShowAddBreakpoint] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<
    'stack' | 'breakpoints' | 'events'
  >('stack')
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setConnectionStatus('connecting')

    const url = `/api/debug/stream?traceId=${encodeURIComponent(traceId)}&projectId=${encodeURIComponent(projectId)}`
    const eventSource = new EventSource(url)

    eventSource.onopen = () => {
      setConnectionStatus('connected')
    }

    eventSource.onmessage = (event) => {
      try {
        const data: DebugEvent = JSON.parse(event.data)
        handleDebugEvent(data)
      } catch (error) {
        console.error('Failed to parse debug event:', error)
      }
    }

    eventSource.onerror = () => {
      setConnectionStatus('error')
      eventSource.close()
      // Attempt reconnect after delay
      setTimeout(() => {
        if (eventSourceRef.current === eventSource) {
          setConnectionStatus('reconnecting')
          connect()
        }
      }, 3000)
    }

    eventSourceRef.current = eventSource
  }, [traceId, projectId])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setConnectionStatus('disconnected')
  }, [])

  // Connect on mount
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  const handleDebugEvent = (event: DebugEvent) => {
    // Skip ping events from log
    if (event.type !== 'ping') {
      setEventLog((prev: DebugEvent[]) => [...prev.slice(-99), event])
    }

    switch (event.type) {
      case 'connected':
        if (event.payload.sessionState) {
          setDebugState(event.payload.sessionState.state)
        }
        break

      case 'traceStarted':
        setDebugState('running')
        setSpanStack([])
        setCurrentSpan(null)
        break

      case 'spanEnter':
        if (event.payload.span) {
          setSpanStack((prev: DebugSpan[]) => [...prev, event.payload.span!])
          setCurrentSpan(event.payload.span)
        }
        break

      case 'spanExit':
        if (event.payload.span) {
          setSpanStack((prev: DebugSpan[]) => prev.slice(0, -1))
          setCurrentSpan((prev: DebugSpan | null) =>
            prev?.spanId === event.payload.span?.spanId ? null : prev,
          )
        }
        break

      case 'breakpointHit':
        setDebugState('paused')
        if (event.payload.span) {
          setCurrentSpan(event.payload.span)
        }
        break

      case 'paused':
        setDebugState('paused')
        if (event.payload.span) {
          setCurrentSpan(event.payload.span)
        }
        break

      case 'resumed':
        setDebugState(event.payload.state ?? 'running')
        break

      case 'stepCompleted':
        setDebugState('paused')
        if (event.payload.span) {
          setCurrentSpan(event.payload.span)
        }
        break

      case 'traceCompleted':
        setDebugState('completed')
        break

      case 'error':
        console.error('Debug error:', event.payload.message)
        break
    }
  }

  // ===========================================================================
  // Debug Commands
  // ===========================================================================

  const sendCommand = async (
    command: string,
    payload?: Record<string, unknown>,
  ) => {
    try {
      const response = await fetch('/api/debug/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          traceId,
          payload,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('Command failed:', error)
      }
    } catch (error) {
      console.error('Failed to send command:', error)
    }
  }

  const handleResume = () => sendCommand('resume')
  const handleStepOver = () => sendCommand('stepOver')
  const handleStepInto = () => sendCommand('stepInto')
  const handleStepOut = () => sendCommand('stepOut')
  const handlePause = () => sendCommand('pause')

  // ===========================================================================
  // Breakpoint Management
  // ===========================================================================

  const addBreakpoint = (bp: Omit<Breakpoint, 'id'>) => {
    const newBp: Breakpoint = {
      ...bp,
      id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }
    setBreakpoints((prev: Breakpoint[]) => [...prev, newBp])
    sendCommand('setBreakpoint', { breakpoint: newBp })
  }

  const removeBreakpoint = (id: string) => {
    setBreakpoints((prev: Breakpoint[]) =>
      prev.filter((bp: Breakpoint) => bp.id !== id),
    )
    sendCommand('removeBreakpoint', { breakpointId: id })
  }

  const toggleBreakpoint = (id: string) => {
    setBreakpoints((prev: Breakpoint[]) =>
      prev.map((bp: Breakpoint) =>
        bp.id === id ? { ...bp, enabled: !bp.enabled } : bp,
      ),
    )
    const bp = breakpoints.find((b: Breakpoint) => b.id === id)
    if (bp) {
      sendCommand(bp.enabled ? 'disableBreakpoint' : 'enableBreakpoint', {
        breakpointId: id,
      })
    }
  }

  // ===========================================================================
  // UI Helpers
  // ===========================================================================

  const toggleEventExpanded = (index: number) => {
    setExpandedEvents((prev: Set<number>) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const isControlDisabled = connectionStatus !== 'connected'
  const isPaused = debugState === 'paused'
  const isRunning = debugState === 'running' || debugState === 'stepping'

  return (
    <div
      className={clsx(
        'flex flex-col h-full bg-white dark:bg-dark-800 border-l shadow-lg',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-dark-900">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-orange-500" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Live Debugger</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-32">
            {traceId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionStatusIndicator
            status={connectionStatus}
            isWebSocket={false}
            onReconnect={connect}
            compact
          />
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-700 rounded text-gray-500 dark:text-gray-400"
              title="Close Debugger"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Debug State Banner */}
      <DebugStateBanner state={debugState} span={currentSpan} />

      {/* Control Bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b bg-white dark:bg-dark-800">
        {/* Resume/Pause */}
        {isPaused ? (
          <ControlButton
            icon={Play}
            label="Resume"
            onClick={handleResume}
            disabled={isControlDisabled}
            variant="primary"
          />
        ) : (
          <ControlButton
            icon={Pause}
            label="Pause"
            onClick={handlePause}
            disabled={isControlDisabled || !isRunning}
          />
        )}

        <div className="w-px h-6 bg-gray-200 dark:bg-dark-700 mx-1" />

        {/* Step Controls */}
        <ControlButton
          icon={ArrowRight}
          label="Step Over"
          onClick={handleStepOver}
          disabled={isControlDisabled || !isPaused}
          title="Step to next span at same level (F10)"
        />
        <ControlButton
          icon={ArrowDown}
          label="Step Into"
          onClick={handleStepInto}
          disabled={isControlDisabled || !isPaused}
          title="Step into child span (F11)"
        />
        <ControlButton
          icon={ArrowLeft}
          label="Step Out"
          onClick={handleStepOut}
          disabled={isControlDisabled || !isPaused}
          title="Step out to parent span (Shift+F11)"
        />

        <div className="flex-1" />

        {/* State Indicator */}
        <DebugStateChip state={debugState} />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b bg-gray-50 dark:bg-dark-900">
        <TabButton
          active={activeTab === 'stack'}
          onClick={() => setActiveTab('stack')}
          icon={Layers}
          label="Call Stack"
          badge={spanStack.length > 0 ? spanStack.length : undefined}
        />
        <TabButton
          active={activeTab === 'breakpoints'}
          onClick={() => setActiveTab('breakpoints')}
          icon={CircleDot}
          label="Breakpoints"
          badge={breakpoints.length > 0 ? breakpoints.length : undefined}
        />
        <TabButton
          active={activeTab === 'events'}
          onClick={() => setActiveTab('events')}
          icon={Timer}
          label="Events"
          badge={eventLog.length > 0 ? eventLog.length : undefined}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'stack' && (
          <CallStackPanel
            stack={spanStack}
            currentSpan={currentSpan}
            onSpanSelect={setCurrentSpan}
          />
        )}
        {activeTab === 'breakpoints' && (
          <BreakpointsPanel
            breakpoints={breakpoints}
            onToggle={toggleBreakpoint}
            onRemove={removeBreakpoint}
            onAdd={() => setShowAddBreakpoint(true)}
          />
        )}
        {activeTab === 'events' && (
          <EventLogPanel
            events={eventLog}
            expanded={expandedEvents}
            onToggleExpand={toggleEventExpanded}
          />
        )}
      </div>

      {/* Current Span Preview */}
      {currentSpan && isPaused && <CurrentSpanPreview span={currentSpan} />}

      {/* Add Breakpoint Modal */}
      {showAddBreakpoint && (
        <AddBreakpointModal
          onAdd={(bp) => {
            addBreakpoint(bp)
            setShowAddBreakpoint(false)
          }}
          onClose={() => setShowAddBreakpoint(false)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Debug state banner showing current status
 */
function DebugStateBanner({
  state,
  span,
}: {
  state: DebugState
  span: DebugSpan | null
}) {
  if (state === 'idle') return null

  const configs: Record<
    DebugState,
    { bg: string; text: string; label: string }
  > = {
    idle: { bg: 'bg-gray-100 dark:bg-dark-800', text: 'text-gray-600 dark:text-gray-300', label: 'Idle' },
    running: { bg: 'bg-green-50 dark:bg-emerald-500/10', text: 'text-green-700 dark:text-emerald-400', label: 'Running' },
    paused: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', label: 'Paused' },
    stepping: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', label: 'Stepping' },
    completed: { bg: 'bg-gray-100 dark:bg-dark-800', text: 'text-gray-600 dark:text-gray-300', label: 'Completed' },
  }

  const config = configs[state]

  return (
    <div className={clsx('px-4 py-2 border-b', config.bg)}>
      <div className="flex items-center gap-2">
        {state === 'paused' && <Pause className="w-4 h-4 text-amber-500" />}
        {state === 'running' && (
          <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
        )}
        <span className={clsx('text-sm font-medium', config.text)}>
          {config.label}
        </span>
        {span && state === 'paused' && (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            at <span className="font-mono">{span.name}</span>
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Small state chip indicator
 */
function DebugStateChip({ state }: { state: DebugState }) {
  const configs: Record<
    DebugState,
    { bg: string; text: string; dot: string; label: string }
  > = {
    idle: {
      bg: 'bg-gray-100 dark:bg-dark-800',
      text: 'text-gray-600 dark:text-gray-300',
      dot: 'bg-gray-400',
      label: 'Idle',
    },
    running: {
      bg: 'bg-green-50 dark:bg-emerald-500/10',
      text: 'text-green-700 dark:text-emerald-400',
      dot: 'bg-green-500',
      label: 'Running',
    },
    paused: {
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      text: 'text-amber-700 dark:text-amber-400',
      dot: 'bg-amber-500',
      label: 'Paused',
    },
    stepping: {
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      text: 'text-blue-700 dark:text-blue-400',
      dot: 'bg-blue-500',
      label: 'Stepping',
    },
    completed: {
      bg: 'bg-gray-100 dark:bg-dark-800',
      text: 'text-gray-600 dark:text-gray-300',
      dot: 'bg-gray-400',
      label: 'Done',
    },
  }

  const config = configs[state]

  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        config.bg,
        config.text,
      )}
    >
      <span
        className={clsx(
          'w-2 h-2 rounded-full',
          config.dot,
          state === 'running' && 'animate-pulse',
        )}
      />
      {config.label}
    </div>
  )
}

/**
 * Control button with icon
 */
function ControlButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = 'default',
  title,
}: {
  icon: typeof Play
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'primary'
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1.5 rounded text-sm font-medium transition-colors',
        variant === 'primary'
          ? 'bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300'
          : 'bg-gray-100 dark:bg-dark-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:bg-gray-50 dark:disabled:bg-dark-900',
        disabled && 'cursor-not-allowed',
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

/**
 * Tab button
 */
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Layers
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-dark-800'
          : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-dark-700',
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge !== undefined && (
        <span
          className={clsx(
            'text-xs px-1.5 py-0.5 rounded-full',
            active ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-gray-200 dark:bg-dark-700 text-gray-600 dark:text-gray-300',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/**
 * Call stack panel
 */
function CallStackPanel({
  stack,
  currentSpan,
  onSpanSelect,
}: {
  stack: DebugSpan[]
  currentSpan: DebugSpan | null
  onSpanSelect: (span: DebugSpan) => void
}) {
  if (stack.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <Layers className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No active spans</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Spans will appear here during execution
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {[...stack].reverse().map((span, index) => {
        const isTop = index === 0
        const isCurrent = span.spanId === currentSpan?.spanId
        const typeConfig = getSpanTypeConfig(span.spanType)

        return (
          <button
            key={span.spanId}
            onClick={() => onSpanSelect(span)}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors',
              isCurrent && 'bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-50 dark:hover:bg-blue-500/10',
            )}
          >
            {/* Depth indicator */}
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300"
              title={`Stack depth: ${stack.length - index}`}
            >
              {stack.length - index}
            </div>

            {/* Span info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <SpanTypeBadge type={span.spanType} size="sm" />
                <span
                  className={clsx(
                    'font-mono text-sm truncate',
                    isCurrent ? 'text-blue-700 dark:text-blue-400 font-medium' : 'text-gray-900 dark:text-gray-100',
                  )}
                >
                  {span.name}
                </span>
              </div>
              {(span.toolName || span.model) && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {span.toolName ?? span.model}
                </div>
              )}
            </div>

            {/* Current indicator */}
            {isTop && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded font-medium">
                Top
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Breakpoints panel
 */
function BreakpointsPanel({
  breakpoints,
  onToggle,
  onRemove,
  onAdd,
}: {
  breakpoints: Breakpoint[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  return (
    <div>
      {/* Add button */}
      <div className="p-4 border-b">
        <button
          onClick={onAdd}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Breakpoint
        </button>
      </div>

      {/* Breakpoint list */}
      {breakpoints.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <CircleDot className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No breakpoints set</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Add breakpoints to pause execution
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {breakpoints.map((bp) => (
            <div
              key={bp.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-700"
            >
              {/* Toggle */}
              <button
                onClick={() => onToggle(bp.id)}
                className={clsx(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                  bp.enabled
                    ? 'border-red-500 bg-red-500'
                    : 'border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-800',
                )}
              >
                {bp.enabled && <Circle className="w-2 h-2 text-white" />}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div
                  className={clsx(
                    'text-sm font-medium',
                    bp.enabled ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  {bp.name ?? `Breakpoint ${bp.id.slice(-6)}`}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  {bp.spanType && (
                    <span>
                      type:{' '}
                      {Array.isArray(bp.spanType)
                        ? bp.spanType.join(', ')
                        : bp.spanType}
                    </span>
                  )}
                  {bp.spanName && <span>name: {bp.spanName}</span>}
                  {bp.toolName && <span>tool: {bp.toolName}</span>}
                  <span className="text-gray-400 dark:text-gray-500">on {bp.trigger}</span>
                </div>
              </div>

              {/* Remove */}
              <button
                onClick={() => onRemove(bp.id)}
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Event log panel
 */
function EventLogPanel({
  events,
  expanded,
  onToggleExpand,
}: {
  events: DebugEvent[]
  expanded: Set<number>
  onToggleExpand: (index: number) => void
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <Timer className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No events yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Debug events will appear here</p>
      </div>
    )
  }

  return (
    <div className="divide-y text-xs font-mono">
      {[...events].reverse().map((event, index) => {
        const realIndex = events.length - 1 - index
        const isExpanded = expanded.has(realIndex)

        return (
          <div key={realIndex} className="hover:bg-gray-50 dark:hover:bg-dark-700">
            <button
              onClick={() => onToggleExpand(realIndex)}
              className="w-full flex items-center gap-2 px-4 py-2 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              )}
              <EventTypeBadge type={event.type} />
              <span className="text-gray-500 dark:text-gray-400 truncate flex-1">
                {event.payload.span?.name ?? event.payload.message ?? ''}
              </span>
              <span className="text-gray-400 dark:text-gray-500">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 pl-9">
                <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-dark-900 p-2 rounded overflow-x-auto">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Event type badge
 */
function EventTypeBadge({ type }: { type: DebugEvent['type'] }) {
  const configs: Record<string, { bg: string; text: string }> = {
    connected: { bg: 'bg-green-100 dark:bg-emerald-500/20', text: 'text-green-700 dark:text-emerald-400' },
    traceStarted: { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400' },
    spanEnter: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-700 dark:text-purple-400' },
    spanExit: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-700 dark:text-purple-400' },
    breakpointHit: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400' },
    paused: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400' },
    resumed: { bg: 'bg-green-100 dark:bg-emerald-500/20', text: 'text-green-700 dark:text-emerald-400' },
    stepCompleted: { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400' },
    traceCompleted: { bg: 'bg-gray-100 dark:bg-dark-800', text: 'text-gray-700 dark:text-gray-300' },
    error: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400' },
    ping: { bg: 'bg-gray-100 dark:bg-dark-800', text: 'text-gray-500 dark:text-gray-400' },
    inspectResult: { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-700 dark:text-cyan-400' },
  }

  const config = configs[type] ?? { bg: 'bg-gray-100 dark:bg-dark-800', text: 'text-gray-600 dark:text-gray-300' }

  return (
    <span
      className={clsx(
        'px-1.5 py-0.5 rounded text-xs font-medium',
        config.bg,
        config.text,
      )}
    >
      {type}
    </span>
  )
}

/**
 * Current span preview footer
 */
function CurrentSpanPreview({ span }: { span: DebugSpan }) {
  const [expanded, setExpanded] = useState(false)
  const typeConfig = getSpanTypeConfig(span.spanType)

  return (
    <div className="border-t bg-gray-50 dark:bg-dark-900">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-dark-700"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        )}
        <SpanTypeBadge type={span.spanType} size="sm" />
        <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
          {span.name}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {span.durationMs ? `${span.durationMs}ms` : 'in progress'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Span ID:</span>{' '}
              <span className="font-mono">{span.spanId.slice(0, 16)}...</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Status:</span>{' '}
              <span
                className={clsx(
                  span.status === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : span.status === 'ok'
                      ? 'text-green-600 dark:text-emerald-400'
                      : 'text-gray-600 dark:text-gray-300',
                )}
              >
                {span.status}
              </span>
            </div>
            {span.toolName && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Tool:</span>{' '}
                <span className="font-mono">{span.toolName}</span>
              </div>
            )}
            {span.model && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Model:</span>{' '}
                <span className="font-mono">{span.model}</span>
              </div>
            )}
            {span.totalTokens && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Tokens:</span>{' '}
                {span.totalTokens.toLocaleString()}
              </div>
            )}
          </div>

          {span.input && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Input:</div>
              <pre className="text-xs bg-white dark:bg-dark-800 border rounded p-2 max-h-20 overflow-auto">
                {span.input.slice(0, 500)}
                {span.input.length > 500 && '...'}
              </pre>
            </div>
          )}

          {span.output && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Output:</div>
              <pre className="text-xs bg-white dark:bg-dark-800 border rounded p-2 max-h-20 overflow-auto">
                {span.output.slice(0, 500)}
                {span.output.length > 500 && '...'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Add breakpoint modal
 */
function AddBreakpointModal({
  onAdd,
  onClose,
}: {
  onAdd: (bp: Omit<Breakpoint, 'id'>) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [spanType, setSpanType] = useState<SpanType | ''>('')
  const [spanName, setSpanName] = useState('')
  const [toolName, setToolName] = useState('')
  const [trigger, setTrigger] = useState<'onEnter' | 'onExit' | 'onError'>(
    'onExit',
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onAdd({
      name: name || undefined,
      enabled: true,
      spanType: spanType || undefined,
      spanName: spanName || undefined,
      toolName: toolName || undefined,
      trigger,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Add Breakpoint</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tool errors"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Span Type
            </label>
            <select
              value={spanType}
              onChange={(e) => setSpanType(e.target.value as SpanType | '')}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Any type</option>
              <option value="generation">Generation (LLM)</option>
              <option value="tool">Tool</option>
              <option value="retrieval">Retrieval</option>
              <option value="span">Span</option>
              <option value="event">Event</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Span Name (pattern)
            </label>
            <input
              type="text"
              value={spanName}
              onChange={(e) => setSpanName(e.target.value)}
              placeholder="e.g., process-query"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tool Name (for tool spans)
            </label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="e.g., get_weather"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Trigger
            </label>
            <select
              value={trigger}
              onChange={(e) =>
                setTrigger(e.target.value as 'onEnter' | 'onExit' | 'onError')
              }
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="onEnter">On Enter (when span starts)</option>
              <option value="onExit">On Exit (when span completes)</option>
              <option value="onError">On Error (only when span errors)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Add Breakpoint
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LiveDebugger
