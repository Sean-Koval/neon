/**
 * Hook for fetching agent health data with auto-refresh.
 *
 * Maps the agents.list tRPC response into a strongly-typed AgentHealthRow[]
 * with 30-second polling for near-real-time dashboard updates.
 */

import { trpc } from '@/lib/trpc'

export interface AgentHealthRow {
  id: string
  name: string
  version: string
  status: 'healthy' | 'degraded' | 'failing'
  passRate: number | null
  latencyP50: number
  costPerCall: number
  lastSeen: string
  traceCount: number
  errorRate: number
}

export function useAgentHealth() {
  const { data, isLoading, error } = trpc.agents.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const agents: AgentHealthRow[] = (data ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name,
    version: agent.version,
    status: agent.health,
    passRate: agent.passRate,
    latencyP50: agent.p50Latency,
    costPerCall: agent.costPerCall,
    lastSeen: agent.lastSeen,
    traceCount: agent.traceCount,
    errorRate: agent.errorRate,
  }))

  return { agents, isLoading, error }
}
