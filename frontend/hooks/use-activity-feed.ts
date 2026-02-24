/**
 * React Query hook for the activity feed.
 *
 * Fetches recent activity events (eval completions, prompt deploys, etc.)
 * from the /api/activity endpoint.
 */

import { useQuery } from '@tanstack/react-query'
import type { ActivityEvent } from '@/types/activity'

export function useActivityFeed(options?: {
  agentId?: string
  limit?: number
}) {
  const { agentId, limit = 10 } = options ?? {}

  return useQuery({
    queryKey: ['activity-feed', agentId, limit],
    queryFn: async (): Promise<{ events: ActivityEvent[] }> => {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (agentId) params.set('agentId', agentId)

      const res = await fetch(`/api/activity?${params}`)
      if (!res.ok) throw new Error('Failed to fetch activity feed')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
