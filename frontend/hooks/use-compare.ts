/**
 * Custom hook for run comparison
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface UseCompareOptions {
  baselineId: string | undefined
  candidateId: string | undefined
  threshold: number
  enabled?: boolean
}

/**
 * Hook for fetching comparison data via GET (for URL-based comparisons)
 */
export function useComparison(options: UseCompareOptions) {
  const { baselineId, candidateId, threshold, enabled = true } = options

  return useQuery({
    queryKey: ['comparison', baselineId, candidateId, threshold],
    queryFn: () =>
      api.getComparison(baselineId as string, candidateId as string, threshold),
    enabled: enabled && !!baselineId && !!candidateId,
    staleTime: 60 * 1000, // 1 minute
  })
}

/**
 * Hook for triggering comparison via POST
 */
export function useCompareMutation() {
  return useMutation({
    mutationFn: ({
      baselineId,
      candidateId,
      threshold,
    }: {
      baselineId: string
      candidateId: string
      threshold: number
    }) => api.compareRuns(baselineId, candidateId, threshold),
  })
}

/**
 * Available threshold options for regression detection
 */
export const THRESHOLD_OPTIONS = [
  { value: 0.01, label: '1%' },
  { value: 0.05, label: '5%' },
  { value: 0.1, label: '10%' },
  { value: 0.15, label: '15%' },
  { value: 0.2, label: '20%' },
] as const
