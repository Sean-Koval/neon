/**
 * React Query hooks for regression alerts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AlertThreshold, RegressionAlert } from '@/lib/regression'

interface AlertsResponse {
  alerts: RegressionAlert[]
  thresholds: AlertThreshold[]
  warning?: string
}

export const alertQueryKeys = {
  all: ['alerts'] as const,
  list: () => [...alertQueryKeys.all, 'list'] as const,
}

/**
 * Fetch active regression alerts and thresholds.
 */
export function useAlerts() {
  return useQuery({
    queryKey: alertQueryKeys.list(),
    queryFn: async (): Promise<AlertsResponse> => {
      const response = await fetch('/api/alerts')
      if (!response.ok) {
        throw new Error('Failed to fetch alerts')
      }
      return response.json()
    },
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Auto-refresh every minute
  })
}

interface UseSaveThresholdOptions {
  onSuccess?: () => void
  onError?: (error: Error) => void
}

/**
 * Save an alert threshold for a suite.
 */
export function useSaveThreshold(options?: UseSaveThresholdOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (threshold: AlertThreshold) => {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(threshold),
      })
      if (!response.ok) {
        throw new Error('Failed to save threshold')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertQueryKeys.all })
      options?.onSuccess?.()
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}
