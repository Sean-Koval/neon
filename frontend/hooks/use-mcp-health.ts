/**
 * MCP Health Hook
 *
 * React hooks for MCP server health monitoring and analytics.
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type MCPServerInfo as APIMCPServerInfo, mcpApi } from '@/lib/api'

// =============================================================================
// Types
// =============================================================================

export type MCPTransport = 'stdio' | 'http' | 'websocket'

export type MCPServerStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export interface MCPServerInfo {
  /** Server identifier */
  serverId: string
  /** Server URL or path */
  serverUrl?: string
  /** Transport type */
  transport: MCPTransport
  /** Protocol version */
  protocolVersion?: string
  /** Server capabilities */
  capabilities?: string[]
  /** Health status */
  status: MCPServerStatus
  /** Total call count in time window */
  callCount: number
  /** Error count in time window */
  errorCount: number
  /** Error rate (0-1) */
  errorRate: number
  /** Average latency in ms */
  avgLatencyMs: number
  /** P50 latency in ms */
  p50LatencyMs: number
  /** P95 latency in ms */
  p95LatencyMs: number
  /** P99 latency in ms */
  p99LatencyMs: number
  /** Last activity timestamp */
  lastSeen: Date
  /** Tools provided by this server */
  tools: MCPToolInfo[]
}

export interface MCPToolInfo {
  /** Tool identifier */
  toolId: string
  /** Tool name */
  name: string
  /** Tool description */
  description?: string
  /** Call count */
  callCount: number
  /** Error count */
  errorCount: number
  /** Average latency in ms */
  avgLatencyMs: number
  /** Success rate (0-1) */
  successRate: number
}

export interface MCPTopologyNode {
  /** Node identifier (serverId or agentId) */
  id: string
  /** Node type */
  type: 'agent' | 'server' | 'tool'
  /** Display label */
  label: string
  /** Health status */
  status: MCPServerStatus
  /** Metrics */
  metrics: {
    callCount: number
    errorRate: number
    avgLatencyMs: number
  }
}

export interface MCPTopologyEdge {
  /** Source node ID */
  source: string
  /** Target node ID */
  target: string
  /** Edge label (tool name or relationship) */
  label?: string
  /** Call count */
  callCount: number
  /** Average latency */
  avgLatencyMs: number
}

export interface MCPTopology {
  nodes: MCPTopologyNode[]
  edges: MCPTopologyEdge[]
}

export interface MCPHealthSummary {
  /** Total number of MCP servers */
  totalServers: number
  /** Number of healthy servers */
  healthyServers: number
  /** Number of degraded servers */
  degradedServers: number
  /** Number of unhealthy servers */
  unhealthyServers: number
  /** Total MCP calls in time window */
  totalCalls: number
  /** Total errors in time window */
  totalErrors: number
  /** Overall error rate */
  overallErrorRate: number
  /** Average latency across all servers */
  avgLatencyMs: number
}

// =============================================================================
// Query Keys
// =============================================================================

export const mcpHealthKeys = {
  all: ['mcp-health'] as const,
  servers: (params?: { startDate: string; endDate: string }) =>
    [...mcpHealthKeys.all, 'servers', params] as const,
  topology: (params?: { startDate: string; endDate: string }) =>
    [...mcpHealthKeys.all, 'topology', params] as const,
}

// =============================================================================
// Transform API response to hook types
// =============================================================================

function transformServerInfo(server: APIMCPServerInfo): MCPServerInfo {
  return {
    ...server,
    lastSeen: new Date(server.lastSeen),
  }
}

// =============================================================================
// Hook
// =============================================================================

export interface UseMCPHealthOptions {
  /** Number of days to look back */
  days?: number
  /** Whether to poll for updates */
  polling?: boolean
  /** Poll interval in ms */
  pollInterval?: number
}

export interface UseMCPHealthResult {
  /** List of MCP servers with health info */
  servers: MCPServerInfo[]
  /** Server topology graph */
  topology: MCPTopology
  /** Health summary */
  summary: MCPHealthSummary
  /** Loading state */
  isLoading: boolean
  /** Error state */
  isError: boolean
  /** Error object */
  error: Error | null
  /** Refetch function */
  refetch: () => void
}

export function useMCPHealth(
  options: UseMCPHealthOptions = {},
): UseMCPHealthResult {
  const { days = 7, polling = false, pollInterval = 30000 } = options

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    }
  }, [days])

  // Fetch MCP server health
  const {
    data: serverHealthData,
    isLoading: isLoadingHealth,
    isError: isErrorHealth,
    error: errorHealth,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: mcpHealthKeys.servers({ startDate, endDate }),
    queryFn: () => mcpApi.getServerHealth({ startDate, endDate }),
    refetchInterval: polling ? pollInterval : false,
    staleTime: 60000, // 1 minute
    placeholderData: { servers: [] },
  })

  // Fetch MCP topology
  const {
    data: topologyData,
    isLoading: isLoadingTopology,
    isError: isErrorTopology,
    error: errorTopology,
    refetch: refetchTopology,
  } = useQuery({
    queryKey: mcpHealthKeys.topology({ startDate, endDate }),
    queryFn: () => mcpApi.getTopology({ startDate, endDate }),
    refetchInterval: polling ? pollInterval : false,
    staleTime: 60000,
    placeholderData: { nodes: [], edges: [] },
  })

  // Transform API responses (no mock fallback)
  const servers = useMemo<MCPServerInfo[]>(() => {
    const apiServers = serverHealthData?.servers || []
    return apiServers.map(transformServerInfo)
  }, [serverHealthData])

  const topology = useMemo<MCPTopology>(() => {
    const apiTopology = topologyData
    if (!apiTopology || apiTopology.nodes.length === 0) {
      return { nodes: [], edges: [] }
    }
    return apiTopology as MCPTopology
  }, [topologyData])

  // Compute summary
  const summary = useMemo<MCPHealthSummary>(() => {
    if (servers.length === 0) {
      return {
        totalServers: 0,
        healthyServers: 0,
        degradedServers: 0,
        unhealthyServers: 0,
        totalCalls: 0,
        totalErrors: 0,
        overallErrorRate: 0,
        avgLatencyMs: 0,
      }
    }

    const totalCalls = servers.reduce(
      (sum: number, s: MCPServerInfo) => sum + s.callCount,
      0,
    )
    const totalErrors = servers.reduce(
      (sum: number, s: MCPServerInfo) => sum + s.errorCount,
      0,
    )
    const totalLatency = servers.reduce(
      (sum: number, s: MCPServerInfo) => sum + s.avgLatencyMs * s.callCount,
      0,
    )

    return {
      totalServers: servers.length,
      healthyServers: servers.filter(
        (s: MCPServerInfo) => s.status === 'healthy',
      ).length,
      degradedServers: servers.filter(
        (s: MCPServerInfo) => s.status === 'degraded',
      ).length,
      unhealthyServers: servers.filter(
        (s: MCPServerInfo) => s.status === 'unhealthy',
      ).length,
      totalCalls,
      totalErrors,
      overallErrorRate: totalCalls > 0 ? totalErrors / totalCalls : 0,
      avgLatencyMs: totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0,
    }
  }, [servers])

  // Combined refetch
  const refetch = () => {
    refetchHealth()
    refetchTopology()
  }

  return {
    servers,
    topology,
    summary,
    isLoading: isLoadingHealth || isLoadingTopology,
    isError: isErrorHealth || isErrorTopology,
    error: (errorHealth || errorTopology) as Error | null,
    refetch,
  }
}

// =============================================================================
// Additional Hooks
// =============================================================================

/**
 * Hook for MCP server details
 */
export function useMCPServerDetails(
  serverId: string,
  options: UseMCPHealthOptions = {},
) {
  const { servers, isLoading, isError, error, refetch } = useMCPHealth(options)

  const server = useMemo(() => {
    return servers.find((s) => s.serverId === serverId) || null
  }, [servers, serverId])

  return {
    server,
    isLoading,
    isError,
    error,
    refetch,
  }
}

/**
 * Hook for MCP tool analytics
 */
export function useMCPToolAnalytics(
  serverId?: string,
  options: UseMCPHealthOptions = {},
) {
  const { servers, isLoading, isError, error, refetch } = useMCPHealth(options)

  const tools = useMemo(() => {
    if (serverId) {
      const server = servers.find((s) => s.serverId === serverId)
      return server?.tools || []
    }
    // Return all tools from all servers
    return servers.flatMap((s) =>
      s.tools.map((t) => ({ ...t, serverId: s.serverId })),
    )
  }, [servers, serverId])

  return {
    tools,
    isLoading,
    isError,
    error,
    refetch,
  }
}
