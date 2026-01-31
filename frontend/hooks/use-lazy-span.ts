'use client'

/**
 * Lazy Span Hook
 *
 * React Query hook for fetching span details on demand.
 * Uses conditional fetching and caching for optimal performance.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'

// Use local Next.js API routes
const API_BASE = ''

/**
 * Span details from lazy load
 */
export interface SpanDetails {
  span_id: string
  input: string
  output: string
  tool_input: string
  tool_output: string
  model_parameters: Record<string, string>
  attributes: Record<string, string>
}

/**
 * Truncation threshold for large payloads (10KB)
 */
export const TRUNCATION_THRESHOLD = 10 * 1024

/**
 * Check if a string payload is large and should be truncated
 */
export function isLargePayload(value: string | undefined | null): boolean {
  if (!value) return false
  return value.length > TRUNCATION_THRESHOLD
}

/**
 * Truncate a large payload with indicator
 */
export function truncatePayload(
  value: string,
  maxLength = TRUNCATION_THRESHOLD,
): { truncated: string; isTruncated: boolean; originalLength: number } {
  if (value.length <= maxLength) {
    return {
      truncated: value,
      isTruncated: false,
      originalLength: value.length,
    }
  }
  return {
    truncated: value.slice(0, maxLength),
    isTruncated: true,
    originalLength: value.length,
  }
}

/**
 * Fetch span details from API
 */
async function fetchSpanDetails(
  spanId: string,
  projectId: string,
): Promise<SpanDetails> {
  const response = await fetch(
    `${API_BASE}/api/spans/${spanId}?project_id=${projectId}`,
  )
  if (!response.ok) {
    throw new Error('Failed to fetch span details')
  }
  return response.json()
}

/**
 * Hook for lazy loading span details
 *
 * @param spanId - The span ID to fetch details for
 * @param options - Configuration options
 * @returns Query result with span details
 */
export function useLazySpan(
  spanId: string | null,
  options: {
    projectId?: string
    enabled?: boolean
  } = {},
) {
  const { projectId = '00000000-0000-0000-0000-000000000001', enabled = true } =
    options

  return useQuery({
    queryKey: ['span-details', spanId, projectId],
    queryFn: () => fetchSpanDetails(spanId as string, projectId),
    enabled: enabled && !!spanId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  })
}

/**
 * Hook for prefetching span details
 *
 * @returns Function to prefetch span details
 */
export function usePrefetchSpanDetails() {
  const queryClient = useQueryClient()

  return (
    spanId: string,
    projectId = '00000000-0000-0000-0000-000000000001',
  ) => {
    queryClient.prefetchQuery({
      queryKey: ['span-details', spanId, projectId],
      queryFn: () => fetchSpanDetails(spanId, projectId),
      staleTime: 5 * 60 * 1000,
    })
  }
}

/**
 * Hook for checking if span details are cached
 *
 * @param spanId - The span ID to check
 * @param projectId - The project ID
 * @returns Whether the span details are cached
 */
export function useIsSpanCached(
  spanId: string | null,
  projectId = '00000000-0000-0000-0000-000000000001',
): boolean {
  const queryClient = useQueryClient()

  if (!spanId) return false

  const data = queryClient.getQueryData(['span-details', spanId, projectId])
  return !!data
}
