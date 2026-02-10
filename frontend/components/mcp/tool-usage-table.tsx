'use client'

/**
 * MCP Tool Usage Table
 *
 * Displays tool usage statistics across MCP servers.
 */

import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MCPServerInfo, MCPToolInfo } from '@/hooks/use-mcp-health'

// =============================================================================
// Types
// =============================================================================

interface ToolWithServer extends MCPToolInfo {
  serverId: string
  serverStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
}

type SortField =
  | 'toolId'
  | 'serverId'
  | 'callCount'
  | 'successRate'
  | 'avgLatencyMs'
type SortDirection = 'asc' | 'desc'

// =============================================================================
// Helpers
// =============================================================================

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// =============================================================================
// Component
// =============================================================================

interface MCPToolUsageTableProps {
  servers: MCPServerInfo[]
  selectedServerId?: string
  onToolClick?: (tool: ToolWithServer) => void
}

export function MCPToolUsageTable({
  servers,
  selectedServerId,
  onToolClick,
}: MCPToolUsageTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('callCount')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Flatten tools with server info
  const allTools = useMemo<ToolWithServer[]>(() => {
    return servers.flatMap((server) =>
      server.tools.map((tool) => ({
        ...tool,
        serverId: server.serverId,
        serverStatus: server.status,
      })),
    )
  }, [servers])

  // Filter and sort tools
  const displayedTools = useMemo(() => {
    let tools = allTools

    // Filter by selected server
    if (selectedServerId) {
      tools = tools.filter((t) => t.serverId === selectedServerId)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      tools = tools.filter(
        (t) =>
          t.toolId.toLowerCase().includes(query) ||
          t.name.toLowerCase().includes(query) ||
          t.serverId.toLowerCase().includes(query),
      )
    }

    // Sort
    tools = [...tools].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'toolId':
          cmp = a.toolId.localeCompare(b.toolId)
          break
        case 'serverId':
          cmp = a.serverId.localeCompare(b.serverId)
          break
        case 'callCount':
          cmp = a.callCount - b.callCount
          break
        case 'successRate':
          cmp = a.successRate - b.successRate
          break
        case 'avgLatencyMs':
          cmp = a.avgLatencyMs - b.avgLatencyMs
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return tools
  }, [allTools, selectedServerId, searchQuery, sortField, sortDirection])

  // Handle sort
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (field !== sortField) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-4 h-4 text-gray-700 dark:text-gray-300" />
    ) : (
      <ArrowDown className="w-4 h-4 text-gray-700 dark:text-gray-300" />
    )
  }

  // Calculate summary stats
  const stats = useMemo(() => {
    const tools = selectedServerId
      ? allTools.filter((t) => t.serverId === selectedServerId)
      : allTools

    if (tools.length === 0) {
      return { totalCalls: 0, avgSuccessRate: 0, avgLatency: 0 }
    }

    const totalCalls = tools.reduce((sum, t) => sum + t.callCount, 0)
    const weightedSuccessRate = tools.reduce(
      (sum, t) => sum + t.successRate * t.callCount,
      0,
    )
    const weightedLatency = tools.reduce(
      (sum, t) => sum + t.avgLatencyMs * t.callCount,
      0,
    )

    return {
      totalCalls,
      avgSuccessRate: totalCalls > 0 ? weightedSuccessRate / totalCalls : 0,
      avgLatency: totalCalls > 0 ? weightedLatency / totalCalls : 0,
    }
  }, [allTools, selectedServerId])

  return (
    <div className="space-y-4">
      {/* Header with search and stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border dark:border-dark-700 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-dark-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total Calls:</span>{' '}
            <span className="font-semibold">
              {formatNumber(stats.totalCalls)}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Avg Success:</span>{' '}
            <span
              className={clsx(
                'font-semibold',
                stats.avgSuccessRate >= 0.99
                  ? 'text-emerald-600'
                  : stats.avgSuccessRate >= 0.9
                    ? 'text-amber-600'
                    : 'text-rose-600',
              )}
            >
              {(stats.avgSuccessRate * 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Avg Latency:</span>{' '}
            <span className="font-semibold">
              {formatLatency(stats.avgLatency)}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border dark:border-dark-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-900 border-b dark:border-dark-700">
            <tr>
              <th className="px-4 py-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('toolId')}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Tool
                  <SortIcon field="toolId" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('serverId')}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Server
                  <SortIcon field="serverId" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('callCount')}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide hover:text-gray-900 dark:hover:text-gray-100 ml-auto"
                >
                  Calls
                  <SortIcon field="callCount" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('successRate')}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide hover:text-gray-900 dark:hover:text-gray-100 ml-auto"
                >
                  Success Rate
                  <SortIcon field="successRate" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('avgLatencyMs')}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide hover:text-gray-900 dark:hover:text-gray-100 ml-auto"
                >
                  Latency
                  <SortIcon field="avgLatencyMs" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-dark-700">
            {displayedTools.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No tools found
                </td>
              </tr>
            ) : (
              displayedTools.map((tool) => (
                <tr
                  key={`${tool.serverId}-${tool.toolId}`}
                  className={clsx(
                    'hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors',
                    onToolClick && 'cursor-pointer',
                  )}
                  onClick={() => onToolClick?.(tool)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-mono text-sm text-gray-900 dark:text-gray-100">
                        {tool.toolId}
                      </p>
                      {tool.name !== tool.toolId && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{tool.name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full',
                          tool.serverStatus === 'healthy'
                            ? 'bg-emerald-500'
                            : tool.serverStatus === 'degraded'
                              ? 'bg-amber-500'
                              : 'bg-rose-500',
                        )}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {tool.serverId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatNumber(tool.callCount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={clsx(
                        'text-sm font-medium',
                        tool.successRate >= 0.99
                          ? 'text-emerald-600'
                          : tool.successRate >= 0.9
                            ? 'text-amber-600'
                            : 'text-rose-600',
                      )}
                    >
                      {(tool.successRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {formatLatency(tool.avgLatencyMs)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =============================================================================
// Skeleton
// =============================================================================

export function MCPToolUsageTableSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-64 bg-gray-200 dark:bg-dark-700 rounded-lg" />
        <div className="flex items-center gap-4">
          <div className="h-5 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-5 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-5 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
      </div>
      <div className="border dark:border-dark-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-dark-900 border-b dark:border-dark-700 px-4 py-3">
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
            ))}
          </div>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-3 border-b dark:border-dark-700 last:border-0">
            <div className="flex gap-4">
              <div className="h-4 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-4 w-12 bg-gray-200 dark:bg-dark-700 rounded ml-auto" />
              <div className="h-4 w-12 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-4 w-12 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
