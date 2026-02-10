'use client'

/**
 * MCP Observability Dashboard
 *
 * Comprehensive observability for Model Context Protocol (MCP) server interactions.
 * Shows server health, topology, and tool usage analytics.
 */

import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle,
  Download,
  GitBranch,
  RefreshCcw,
  Server,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import {
  MCPServerCard,
  MCPServerCardSkeleton,
  MCPServerTopology,
  MCPServerTopologySkeleton,
  MCPToolUsageTable,
  MCPToolUsageTableSkeleton,
} from '@/components/mcp'
import { type MCPServerInfo, useMCPHealth } from '@/hooks/use-mcp-health'

// =============================================================================
// Types
// =============================================================================

type ViewTab = 'servers' | 'topology' | 'tools'

const DATE_RANGES = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
]

// =============================================================================
// Main Page Component
// =============================================================================

export default function MCPDashboardPage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('servers')
  const [dateRange, setDateRange] = useState(7)
  const [selectedServer, setSelectedServer] = useState<MCPServerInfo | null>(
    null,
  )

  // Fetch MCP health data
  const { servers, topology, summary, isLoading, isError, error, refetch } =
    useMCPHealth({
      days: dateRange,
      polling: true,
      pollInterval: 30000,
    })

  // Handle server selection
  const handleServerSelect = (server: MCPServerInfo) => {
    setSelectedServer(
      server.serverId === selectedServer?.serverId ? null : server,
    )
  }

  // Export data
  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      dateRange: `${dateRange} days`,
      summary,
      servers: servers.map((s) => ({
        serverId: s.serverId,
        status: s.status,
        callCount: s.callCount,
        errorRate: s.errorRate,
        avgLatencyMs: s.avgLatencyMs,
        tools: s.tools.map((t) => ({
          toolId: t.toolId,
          callCount: t.callCount,
          successRate: t.successRate,
          avgLatencyMs: t.avgLatencyMs,
        })),
      })),
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mcp-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Tab configuration
  const tabs = [
    { id: 'servers' as ViewTab, label: 'Servers', icon: Server },
    { id: 'topology' as ViewTab, label: 'Topology', icon: GitBranch },
    { id: 'tools' as ViewTab, label: 'Tools', icon: Activity },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            MCP Observability
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor Model Context Protocol server health and performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(Number(e.target.value))}
              className="px-3 py-2 border dark:border-dark-700 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 dark:bg-dark-800 dark:text-gray-100"
            >
              {DATE_RANGES.map((range) => (
                <option key={range.days} value={range.days}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 border dark:border-dark-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCcw
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isLoading || servers.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Error State */}
      {isError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
          <p className="text-rose-800 font-medium">Error loading MCP data</p>
          <p className="text-rose-600 text-sm mt-1">
            {error?.message || 'An unexpected error occurred'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-sm text-rose-700 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Summary Stats */}
      {!isLoading && (
        <div className="grid grid-cols-6 gap-4 mb-6">
          <div className="bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <Server className="w-4 h-4" />
              <span className="text-xs font-medium">Servers</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summary.totalServers}
            </div>
          </div>
          <div className="bg-white dark:bg-dark-800 border rounded-lg p-4 border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Healthy</span>
            </div>
            <div className="text-2xl font-bold text-emerald-700">
              {summary.healthyServers}
            </div>
          </div>
          <div className="bg-white dark:bg-dark-800 border rounded-lg p-4 border-amber-200">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Degraded</span>
            </div>
            <div className="text-2xl font-bold text-amber-700">
              {summary.degradedServers}
            </div>
          </div>
          <div className="bg-white dark:bg-dark-800 border rounded-lg p-4 border-rose-200">
            <div className="flex items-center gap-2 text-rose-600 mb-1">
              <XCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Unhealthy</span>
            </div>
            <div className="text-2xl font-bold text-rose-700">
              {summary.unhealthyServers}
            </div>
          </div>
          <div className="bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Total Calls
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summary.totalCalls >= 1000
                ? `${(summary.totalCalls / 1000).toFixed(1)}K`
                : summary.totalCalls}
            </div>
          </div>
          <div className="bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Error Rate
            </div>
            <div
              className={`text-2xl font-bold ${
                summary.overallErrorRate > 0.1
                  ? 'text-rose-600'
                  : summary.overallErrorRate > 0.01
                    ? 'text-amber-600'
                    : 'text-emerald-600'
              }`}
            >
              {(summary.overallErrorRate * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-dark-700 mb-6">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-dark-600'
                }
              `}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {/* Servers Tab */}
        {activeTab === 'servers' &&
          (isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <MCPServerCardSkeleton key={i} />
              ))}
            </div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
              <Server className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-lg font-medium">No MCP servers found</p>
              <p className="text-sm">
                MCP server data will appear here once you start tracing MCP
                calls
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {servers.map((server) => (
                <MCPServerCard
                  key={server.serverId}
                  server={server}
                  onClick={() => handleServerSelect(server)}
                  isSelected={selectedServer?.serverId === server.serverId}
                />
              ))}
            </div>
          ))}

        {/* Topology Tab */}
        {activeTab === 'topology' && (
          <div className="bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              MCP Server Topology
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Visualizes the network of MCP servers and their connections to
              agents. Node color indicates health status, size indicates call
              volume.
            </p>
            {isLoading ? (
              <MCPServerTopologySkeleton height={500} />
            ) : (
              <MCPServerTopology
                topology={topology}
                height={500}
                onNodeClick={(node) => {
                  const server = servers.find((s) => s.serverId === node.id)
                  if (server) {
                    setActiveTab('servers')
                    handleServerSelect(server)
                  }
                }}
              />
            )}
          </div>
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <div className="bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Tool Usage Analytics
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Detailed statistics for each MCP tool across all servers. Click a
              row to see detailed execution history.
            </p>
            {isLoading ? (
              <MCPToolUsageTableSkeleton />
            ) : (
              <MCPToolUsageTable
                servers={servers}
                selectedServerId={selectedServer?.serverId}
              />
            )}
          </div>
        )}
      </div>

      {/* Selected Server Sidebar */}
      {selectedServer && (
        <div className="fixed right-0 top-0 bottom-0 w-96 bg-white dark:bg-dark-800 border-l dark:border-dark-700 shadow-lg overflow-y-auto z-50">
          <div className="p-4 border-b dark:border-dark-700 bg-gray-50 dark:bg-dark-900 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Server Details</h3>
            <button
              type="button"
              onClick={() => setSelectedServer(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
            >
              &times;
            </button>
          </div>
          <div className="p-4">
            <MCPServerCard server={selectedServer} isSelected={false} />
          </div>
        </div>
      )}
    </div>
  )
}
