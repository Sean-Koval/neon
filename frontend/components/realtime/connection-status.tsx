'use client'

/**
 * Connection Status Indicator
 *
 * Shows the current real-time connection status in the UI.
 * Displays WebSocket vs polling mode and connection state.
 */

import { AlertCircle, Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import type { ConnectionStatus } from '@/lib/types'

interface ConnectionStatusIndicatorProps {
  /** Current connection status */
  status: ConnectionStatus
  /** Whether using WebSocket (true) or polling (false) */
  isWebSocket: boolean
  /** Optional callback to trigger reconnection */
  onReconnect?: () => void
  /** Show in compact mode (icon only) */
  compact?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Get display properties for each connection status.
 */
function getStatusDisplay(status: ConnectionStatus) {
  switch (status) {
    case 'connected':
      return {
        icon: Wifi,
        color: 'text-green-600 dark:text-emerald-400',
        bgColor: 'bg-green-50 dark:bg-emerald-500/10',
        borderColor: 'border-green-200 dark:border-emerald-500/25',
        label: 'Connected',
        pulse: false,
      }
    case 'connecting':
      return {
        icon: RefreshCw,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-500/10',
        borderColor: 'border-blue-200 dark:border-blue-500/25',
        label: 'Connecting',
        pulse: true,
      }
    case 'reconnecting':
      return {
        icon: RefreshCw,
        color: 'text-yellow-600 dark:text-amber-400',
        bgColor: 'bg-yellow-50 dark:bg-amber-500/10',
        borderColor: 'border-yellow-200 dark:border-amber-500/25',
        label: 'Reconnecting',
        pulse: true,
      }
    case 'disconnected':
      return {
        icon: WifiOff,
        color: 'text-gray-500',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: 'Disconnected',
        pulse: false,
      }
    case 'error':
      return {
        icon: AlertCircle,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        borderColor: 'border-red-200 dark:border-red-500/25',
        label: 'Connection Error',
        pulse: false,
      }
    default:
      return {
        icon: WifiOff,
        color: 'text-gray-500',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: 'Unknown',
        pulse: false,
      }
  }
}

/**
 * Connection status indicator component.
 *
 * @example
 * ```tsx
 * <ConnectionStatusIndicator
 *   status={connectionStatus}
 *   isWebSocket={isWebSocket}
 *   onReconnect={reconnect}
 * />
 * ```
 */
export function ConnectionStatusIndicator({
  status,
  isWebSocket,
  onReconnect,
  compact = false,
  className = '',
}: ConnectionStatusIndicatorProps) {
  const display = getStatusDisplay(status)
  const Icon = display.icon

  // Compact mode - just an icon with tooltip
  if (compact) {
    return (
      <div
        className={`inline-flex items-center justify-center ${className}`}
        title={`${display.label}${isWebSocket ? ' (WebSocket)' : ' (Polling)'}`}
      >
        <Icon
          className={`w-4 h-4 ${display.color} ${display.pulse ? 'animate-spin' : ''}`}
        />
      </div>
    )
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${display.bgColor} ${display.borderColor} ${className}`}
    >
      <Icon
        className={`w-4 h-4 ${display.color} ${display.pulse ? 'animate-spin' : ''}`}
      />
      <span className={`text-sm font-medium ${display.color}`}>
        {display.label}
      </span>
      {status === 'connected' && (
        <span className="text-xs text-gray-500">
          {isWebSocket ? (
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3" />
              Live
            </span>
          ) : (
            'Polling'
          )}
        </span>
      )}
      {(status === 'disconnected' || status === 'error') && onReconnect && (
        <button
          onClick={onReconnect}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline ml-1"
        >
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Minimal connection dot indicator.
 *
 * Just shows a colored dot for connection status.
 */
export function ConnectionDot({
  status,
  className = '',
}: {
  status: ConnectionStatus
  className?: string
}) {
  const colorMap: Record<ConnectionStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-blue-500 animate-pulse',
    reconnecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
  }

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colorMap[status]} ${className}`}
      title={status}
    />
  )
}

export default ConnectionStatusIndicator
