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
// Mock Data Generator (for development)
// =============================================================================

function generateMockServerData(): MCPServerInfo[] {
  const servers: MCPServerInfo[] = [
    {
      serverId: 'filesystem',
      serverUrl: 'stdio://localhost/filesystem',
      transport: 'stdio',
      protocolVersion: '2024-11-05',
      capabilities: ['tools', 'prompts'],
      status: 'healthy',
      callCount: 1250,
      errorCount: 12,
      errorRate: 0.0096,
      avgLatencyMs: 45,
      p50LatencyMs: 32,
      p95LatencyMs: 120,
      p99LatencyMs: 250,
      lastSeen: new Date(Date.now() - 5000),
      tools: [
        {
          toolId: 'read_file',
          name: 'Read File',
          callCount: 800,
          errorCount: 5,
          avgLatencyMs: 35,
          successRate: 0.994,
        },
        {
          toolId: 'write_file',
          name: 'Write File',
          callCount: 300,
          errorCount: 7,
          avgLatencyMs: 55,
          successRate: 0.977,
        },
        {
          toolId: 'list_dir',
          name: 'List Directory',
          callCount: 150,
          errorCount: 0,
          avgLatencyMs: 25,
          successRate: 1.0,
        },
      ],
    },
    {
      serverId: 'web-search',
      serverUrl: 'https://api.example.com/mcp/search',
      transport: 'http',
      protocolVersion: '2024-11-05',
      capabilities: ['tools'],
      status: 'healthy',
      callCount: 450,
      errorCount: 8,
      errorRate: 0.018,
      avgLatencyMs: 850,
      p50LatencyMs: 720,
      p95LatencyMs: 1800,
      p99LatencyMs: 3200,
      lastSeen: new Date(Date.now() - 15000),
      tools: [
        {
          toolId: 'search',
          name: 'Web Search',
          callCount: 350,
          errorCount: 5,
          avgLatencyMs: 920,
          successRate: 0.986,
        },
        {
          toolId: 'fetch',
          name: 'Fetch Page',
          callCount: 100,
          errorCount: 3,
          avgLatencyMs: 650,
          successRate: 0.97,
        },
      ],
    },
    {
      serverId: 'database',
      serverUrl: 'ws://localhost:5432/mcp',
      transport: 'websocket',
      protocolVersion: '2024-11-05',
      capabilities: ['tools', 'resources'],
      status: 'degraded',
      callCount: 890,
      errorCount: 120,
      errorRate: 0.135,
      avgLatencyMs: 150,
      p50LatencyMs: 95,
      p95LatencyMs: 450,
      p99LatencyMs: 800,
      lastSeen: new Date(Date.now() - 2000),
      tools: [
        {
          toolId: 'query',
          name: 'SQL Query',
          callCount: 600,
          errorCount: 80,
          avgLatencyMs: 180,
          successRate: 0.867,
        },
        {
          toolId: 'insert',
          name: 'Insert Row',
          callCount: 200,
          errorCount: 30,
          avgLatencyMs: 120,
          successRate: 0.85,
        },
        {
          toolId: 'update',
          name: 'Update Row',
          callCount: 90,
          errorCount: 10,
          avgLatencyMs: 110,
          successRate: 0.889,
        },
      ],
    },
    {
      serverId: 'code-execution',
      transport: 'stdio',
      protocolVersion: '2024-11-05',
      capabilities: ['tools'],
      status: 'unhealthy',
      callCount: 50,
      errorCount: 35,
      errorRate: 0.7,
      avgLatencyMs: 2500,
      p50LatencyMs: 1800,
      p95LatencyMs: 5000,
      p99LatencyMs: 8000,
      lastSeen: new Date(Date.now() - 300000), // 5 minutes ago
      tools: [
        {
          toolId: 'run_python',
          name: 'Run Python',
          callCount: 30,
          errorCount: 25,
          avgLatencyMs: 3000,
          successRate: 0.167,
        },
        {
          toolId: 'run_shell',
          name: 'Run Shell',
          callCount: 20,
          errorCount: 10,
          avgLatencyMs: 1500,
          successRate: 0.5,
        },
      ],
    },
  ]

  return servers
}

function generateMockTopology(): MCPTopology {
  return {
    nodes: [
      {
        id: 'agent-main',
        type: 'agent',
        label: 'Main Agent',
        status: 'healthy',
        metrics: { callCount: 2500, errorRate: 0.05, avgLatencyMs: 200 },
      },
      {
        id: 'filesystem',
        type: 'server',
        label: 'Filesystem',
        status: 'healthy',
        metrics: { callCount: 1250, errorRate: 0.01, avgLatencyMs: 45 },
      },
      {
        id: 'web-search',
        type: 'server',
        label: 'Web Search',
        status: 'healthy',
        metrics: { callCount: 450, errorRate: 0.018, avgLatencyMs: 850 },
      },
      {
        id: 'database',
        type: 'server',
        label: 'Database',
        status: 'degraded',
        metrics: { callCount: 890, errorRate: 0.135, avgLatencyMs: 150 },
      },
    ],
    edges: [
      {
        source: 'agent-main',
        target: 'filesystem',
        label: 'file ops',
        callCount: 1250,
        avgLatencyMs: 45,
      },
      {
        source: 'agent-main',
        target: 'web-search',
        label: 'search',
        callCount: 450,
        avgLatencyMs: 850,
      },
      {
        source: 'agent-main',
        target: 'database',
        label: 'queries',
        callCount: 890,
        avgLatencyMs: 150,
      },
    ],
  }
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

  // Transform and provide mock fallback
  const servers = useMemo<MCPServerInfo[]>(() => {
    const apiServers = serverHealthData?.servers || []
    if (apiServers.length === 0) {
      // Use mock data for development/demo
      return generateMockServerData()
    }
    return apiServers.map(transformServerInfo)
  }, [serverHealthData])

  const topology = useMemo<MCPTopology>(() => {
    const apiTopology = topologyData
    if (!apiTopology || apiTopology.nodes.length === 0) {
      // Use mock data for development/demo
      return generateMockTopology()
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
