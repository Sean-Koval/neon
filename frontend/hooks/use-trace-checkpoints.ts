'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import type { TraceCheckpointRecord } from '@/lib/traces/trace-bundle'

const API_BASE = ''

interface TraceCheckpointsResponse {
  granularity: 'checkpoint'
  checkpoints: TraceCheckpointRecord[]
}

export interface ReplayCheckpointResult {
  success: boolean
  workflowId: string
  runId: string
  checkpointId: string
  sourceTraceId: string
  mode: 'restore' | 'replay'
}

async function fetchTraceCheckpoints(
  traceId: string,
  projectId: string,
): Promise<TraceCheckpointsResponse> {
  const params = new URLSearchParams({
    project_id: projectId,
    granularity: 'checkpoint',
  })

  const response = await fetch(`${API_BASE}/api/traces/${traceId}?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch trace checkpoints')
  }

  return response.json() as Promise<TraceCheckpointsResponse>
}

export function useTraceCheckpoints(
  traceId: string,
  projectId = '00000000-0000-0000-0000-000000000001',
) {
  return useQuery({
    queryKey: ['trace', traceId, projectId, 'checkpoints'],
    queryFn: () => fetchTraceCheckpoints(traceId, projectId),
    enabled: !!traceId,
    staleTime: 60000,
  })
}

export function useReplayCheckpoint() {
  return useMutation({
    mutationFn: async ({
      checkpointId,
      mode,
    }: {
      checkpointId: string
      mode: 'restore' | 'replay'
    }) => {
      const response = await fetch(
        `${API_BASE}/api/checkpoints/${checkpointId}/replay`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mode }),
        },
      )

      const payload = (await response.json().catch(() => ({}))) as
        | ReplayCheckpointResult
        | { error?: string }

      if (!response.ok) {
        const message =
          'error' in payload && payload.error
            ? payload.error
            : 'Failed to start checkpoint replay'
        throw new Error(message)
      }

      return payload as ReplayCheckpointResult
    },
  })
}
