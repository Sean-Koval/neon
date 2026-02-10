'use client'

/**
 * MCP Server Card
 *
 * Displays health and metrics for an individual MCP server.
 */

import { clsx } from 'clsx'
import {
  Activity,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  Server,
  Terminal,
  Wifi,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import type {
  MCPServerInfo,
  MCPServerStatus,
  MCPTransport,
} from '@/hooks/use-mcp-health'

// =============================================================================
// Helpers
// =============================================================================

function getStatusConfig(status: MCPServerStatus) {
  const configs: Record<
    MCPServerStatus,
    {
      icon: typeof CheckCircle
      label: string
      color: string
      bgColor: string
      borderColor: string
    }
  > = {
    healthy: {
      icon: CheckCircle,
      label: 'Healthy',
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
      borderColor: 'border-emerald-200 dark:border-emerald-500/25',
    },
    degraded: {
      icon: AlertCircle,
      label: 'Degraded',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-500/10',
      borderColor: 'border-amber-200 dark:border-amber-500/25',
    },
    unhealthy: {
      icon: XCircle,
      label: 'Unhealthy',
      color: 'text-rose-600 dark:text-rose-400',
      bgColor: 'bg-rose-50 dark:bg-rose-500/10',
      borderColor: 'border-rose-200 dark:border-rose-500/25',
    },
    unknown: {
      icon: AlertCircle,
      label: 'Unknown',
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-dark-900',
      borderColor: 'border-gray-200 dark:border-dark-700',
    },
  }

  return configs[status]
}

function getTransportConfig(transport: MCPTransport) {
  const configs: Record<
    MCPTransport,
    {
      icon: typeof Terminal
      label: string
      color: string
      bgColor: string
    }
  > = {
    stdio: {
      icon: Terminal,
      label: 'stdio',
      color: 'text-gray-600 dark:text-gray-300',
      bgColor: 'bg-gray-100 dark:bg-dark-800',
    },
    http: {
      icon: Globe,
      label: 'HTTP',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-500/10',
    },
    websocket: {
      icon: Wifi,
      label: 'WebSocket',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-500/10',
    },
  }

  return configs[transport]
}

function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

function formatTimeAgo(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// =============================================================================
// Component
// =============================================================================

interface MCPServerCardProps {
  server: MCPServerInfo
  onClick?: () => void
  isSelected?: boolean
}

export function MCPServerCard({
  server,
  onClick,
  isSelected,
}: MCPServerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const statusConfig = getStatusConfig(server.status)
  const transportConfig = getTransportConfig(server.transport)
  const StatusIcon = statusConfig.icon
  const TransportIcon = transportConfig.icon

  return (
    <div
      className={clsx(
        'bg-white dark:bg-dark-800 border rounded-lg overflow-hidden transition-all',
        statusConfig.borderColor,
        isSelected && 'ring-2 ring-primary-500',
        onClick && 'cursor-pointer hover:shadow-md',
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className={clsx('px-4 py-3 border-b', statusConfig.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{server.serverId}</h3>
              {server.serverUrl && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                  {server.serverUrl}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                statusConfig.bgColor,
                statusConfig.color,
              )}
            >
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-4 py-3 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Calls</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatNumber(server.callCount)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Error Rate</p>
          <p
            className={clsx(
              'text-lg font-semibold',
              server.errorRate > 0.1
                ? 'text-rose-600 dark:text-rose-400'
                : server.errorRate > 0.01
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {(server.errorRate * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Latency</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatLatency(server.avgLatencyMs)}
          </p>
        </div>
      </div>

      {/* Details Toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
        className="w-full px-4 py-2 border-t dark:border-dark-700 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700"
      >
        <span className="flex items-center gap-2">
          <Activity className="w-4 h-4" />
          {server.tools.length} tools
        </span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 py-3 border-t dark:border-dark-700 bg-gray-50 dark:bg-dark-900 space-y-4">
          {/* Transport & Protocol */}
          <div className="flex flex-wrap gap-2">
            <span
              className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                transportConfig.bgColor,
                transportConfig.color,
              )}
            >
              <TransportIcon className="w-3 h-3" />
              {transportConfig.label}
            </span>
            {server.protocolVersion && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300">
                v{server.protocolVersion}
              </span>
            )}
            <span className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(server.lastSeen)}
            </span>
          </div>

          {/* Latency Breakdown */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Latency Percentiles</p>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs">P50</p>
                <p className="font-medium">
                  {formatLatency(server.p50LatencyMs)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs">Avg</p>
                <p className="font-medium">
                  {formatLatency(server.avgLatencyMs)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs">P95</p>
                <p className="font-medium">
                  {formatLatency(server.p95LatencyMs)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs">P99</p>
                <p className="font-medium">
                  {formatLatency(server.p99LatencyMs)}
                </p>
              </div>
            </div>
          </div>

          {/* Tools */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Tools ({server.tools.length})
            </p>
            <div className="space-y-1">
              {server.tools.map((tool) => (
                <div
                  key={tool.toolId}
                  className="flex items-center justify-between text-sm bg-white dark:bg-dark-800 rounded px-2 py-1.5"
                >
                  <span className="font-mono text-gray-700 dark:text-gray-300">{tool.toolId}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatNumber(tool.callCount)} calls</span>
                    <span
                      className={clsx(
                        tool.successRate < 0.9
                          ? 'text-rose-600 dark:text-rose-400'
                          : tool.successRate < 0.99
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {(tool.successRate * 100).toFixed(0)}%
                    </span>
                    <span>{formatLatency(tool.avgLatencyMs)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          {server.capabilities && server.capabilities.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Capabilities</p>
              <div className="flex flex-wrap gap-1">
                {server.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="px-2 py-0.5 text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Skeleton
// =============================================================================

export function MCPServerCardSkeleton() {
  return (
    <div className="bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b dark:border-dark-700 bg-gray-50 dark:bg-dark-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-200 dark:bg-dark-700 rounded" />
            <div>
              <div className="h-4 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-3 w-32 bg-gray-200 dark:bg-dark-700 rounded mt-1" />
            </div>
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <div className="h-3 w-10 bg-gray-200 dark:bg-dark-700 rounded mb-1" />
            <div className="h-6 w-12 bg-gray-200 dark:bg-dark-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
