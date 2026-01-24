/**
 * React Query hooks for run comparison operations.
 */

import {
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { CompareResponse } from '@/lib/types'

// Default regression threshold
const DEFAULT_THRESHOLD = 0.05

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Compare two eval runs and identify regressions.
 *
 * @param baselineId - The baseline run ID to compare against
 * @param candidateId - The candidate run ID being evaluated
 * @param threshold - Minimum score drop to count as regression (default: 0.05)
 */
export function useCompare(
  baselineId: string,
  candidateId: string,
  threshold = DEFAULT_THRESHOLD,
  options?: Omit<
    UseQueryOptions<CompareResponse, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.compare.comparison(baselineId, candidateId, threshold),
    queryFn: () => api.compareRuns(baselineId, candidateId, threshold),
    staleTime: 5 * 60 * 1000, // 5 minutes - comparisons are stable
    // Only fetch when both IDs are provided
    enabled: !!baselineId && !!candidateId,
    ...options,
  })
}
