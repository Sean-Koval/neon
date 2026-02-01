'use client'

/**
 * Trace Hooks
 *
 * React hooks for trace data fetching.
 */

import { useQuery } from '@tanstack/react-query'

// Use local Next.js API routes (will proxy to ClickHouse)
const API_BASE = ''

/**
 * Trace filters
 */
export interface TraceFilters {
  projectId?: string
  status?: 'ok' | 'error'
  startDate?: string
  endDate?: string
  agentId?: string
  search?: string
  limit?: number
  offset?: number
}

/**
 * Trace summary
 */
export interface TraceSummary {
  trace_id: string
  name: string
  timestamp: string
  duration_ms: number
  status: string
  total_tokens: number
  tool_calls: number
  llm_calls: number
  agent_id: string | null
  agent_version: string | null
}

/**
 * Span data
 */
export interface Span {
  span_id: string
  trace_id: string
  parent_span_id: string | null
  name: string
  span_type: 'span' | 'generation' | 'tool' | 'retrieval' | 'event' | 'agent'
  timestamp: string
  end_time: string | null
  duration_ms: number
  status: 'unset' | 'ok' | 'error'
  status_message?: string
  model?: string
  input?: string
  output?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cost_usd?: number
  tool_name?: string
  tool_input?: string
  tool_output?: string
  attributes?: Record<string, string>
  children?: Span[]
}

/**
 * Trace with spans
 */
export interface TraceWithSpans {
  trace: {
    trace_id: string
    name: string
    timestamp: string
    end_time: string | null
    duration_ms: number
    status: string
    metadata: Record<string, string>
  }
  spans: Span[]
  scores: Array<{
    score_id: string
    name: string
    value: number
    source: string
  }>
}

/**
 * Fetch traces list
 */
async function fetchTraces(filters: TraceFilters): Promise<TraceSummary[]> {
  const params = new URLSearchParams()
  params.set(
    'project_id',
    filters.projectId || '00000000-0000-0000-0000-000000000001',
  )
  if (filters.status) params.set('status', filters.status)
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.agentId) params.set('agent_id', filters.agentId)
  if (filters.search) params.set('search', filters.search)
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.offset) params.set('offset', String(filters.offset))

  const response = await fetch(`${API_BASE}/api/traces?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch traces')
  }
  const data = await response.json()
  return data.items || data
}

/**
 * Fetch single trace with spans
 */
async function fetchTrace(
  traceId: string,
  projectId: string,
): Promise<TraceWithSpans> {
  const response = await fetch(
    `${API_BASE}/api/traces/${traceId}?project_id=${projectId}`,
  )
  if (!response.ok) {
    throw new Error('Failed to fetch trace')
  }
  return response.json()
}

/**
 * Hook for fetching traces list
 */
export function useTraces(filters: TraceFilters = {}) {
  return useQuery({
    queryKey: ['traces', filters],
    queryFn: () => fetchTraces(filters),
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Hook for fetching a single trace
 */
export function useTrace(
  traceId: string,
  projectId = '00000000-0000-0000-0000-000000000001',
) {
  return useQuery({
    queryKey: ['trace', traceId, projectId],
    queryFn: () => fetchTrace(traceId, projectId),
    enabled: !!traceId,
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook for searching traces
 */
export function useTraceSearch(
  query: string,
  projectId = '00000000-0000-0000-0000-000000000001',
) {
  return useQuery({
    queryKey: ['traces', 'search', query, projectId],
    queryFn: async () => {
      if (!query) return []
      const params = new URLSearchParams({
        project_id: projectId,
        query,
        limit: '20',
      })
      const response = await fetch(`${API_BASE}/api/traces/search?${params}`)
      if (!response.ok) {
        throw new Error('Failed to search traces')
      }
      return response.json()
    },
    enabled: query.length >= 2,
    staleTime: 30000,
  })
}

/**
 * Hook for trace count
 */
export function useTraceCount(
  projectId = '00000000-0000-0000-0000-000000000001',
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ['traces', 'count', projectId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ project_id: projectId })
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)

      const response = await fetch(`${API_BASE}/api/traces/count?${params}`)
      if (!response.ok) {
        throw new Error('Failed to get count')
      }
      return response.json()
    },
    staleTime: 60000,
  })
}
