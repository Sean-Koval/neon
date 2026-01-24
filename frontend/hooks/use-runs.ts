/**
 * React Query hooks for eval run operations.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  EvalResult,
  EvalRun,
  EvalRunCreate,
  RunFilters,
} from '@/lib/types'

// Polling interval for active runs (in milliseconds)
const ACTIVE_RUN_POLL_INTERVAL = 3000 // 3 seconds

/**
 * Check if a run is in an active (non-terminal) state.
 */
function isActiveRun(run: EvalRun | undefined): boolean {
  if (!run) return false
  return run.status === 'pending' || run.status === 'running'
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch eval runs with optional filters.
 */
export function useRuns(
  filters?: RunFilters,
  options?: Omit<UseQueryOptions<EvalRun[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.runs.list(filters),
    queryFn: () => api.getRuns(filters),
    staleTime: 30 * 1000, // 30 seconds - runs change more frequently
    ...options,
  })
}

/**
 * Fetch a single eval run with polling for active runs.
 * Automatically polls every 3 seconds when the run is pending or running.
 */
export function useRun(
  id: string,
  options?: Omit<UseQueryOptions<EvalRun, Error>, 'queryKey' | 'queryFn'>
) {
  const query = useQuery({
    queryKey: queryKeys.runs.detail(id),
    queryFn: () => api.getRun(id),
    staleTime: 10 * 1000, // 10 seconds
    enabled: !!id,
    // Poll while the run is active
    refetchInterval: (query) => {
      const run = query.state.data
      return isActiveRun(run) ? ACTIVE_RUN_POLL_INTERVAL : false
    },
    ...options,
  })

  return query
}

/**
 * Fetch detailed results for an eval run.
 */
export function useRunResults(
  id: string,
  options?: Omit<
    UseQueryOptions<EvalResult[], Error>,
    'queryKey' | 'queryFn'
  > & {
    failedOnly?: boolean
  }
) {
  const { failedOnly = false, ...queryOptions } = options ?? {}

  return useQuery({
    queryKey: queryKeys.runs.results(id),
    queryFn: () => api.getRunResults(id, failedOnly),
    staleTime: 60 * 1000, // 1 minute - results don't change after completion
    enabled: !!id,
    ...queryOptions,
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

interface UseTriggerRunOptions {
  onSuccess?: (data: EvalRun) => void
  onError?: (error: Error) => void
}

/**
 * Trigger a new eval run for a suite.
 */
export function useTriggerRun(options?: UseTriggerRunOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      suiteId,
      data = {},
    }: {
      suiteId: string
      data?: EvalRunCreate
    }) => api.triggerRun(suiteId, data),
    onSuccess: (newRun) => {
      // Invalidate runs list to include the new run
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.lists() })

      // Set the new run in the cache
      queryClient.setQueryData(queryKeys.runs.detail(newRun.id), newRun)

      options?.onSuccess?.(newRun)
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

interface UseCancelRunOptions {
  onSuccess?: () => void
  onError?: (error: Error) => void
}

/**
 * Cancel an active eval run.
 */
export function useCancelRun(options?: UseCancelRunOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.cancelRun(id),
    onSuccess: (_data, id) => {
      // Invalidate the specific run to get updated status
      queryClient.invalidateQueries({
        queryKey: queryKeys.runs.detail(id),
      })

      // Also invalidate the runs list
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.lists() })

      options?.onSuccess?.()
    },
    onError: (error) => {
      options?.onError?.(error)
    },
    // Optimistic update: set status to cancelled immediately
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.runs.detail(id),
      })

      // Snapshot the previous value
      const previousRun = queryClient.getQueryData<EvalRun>(
        queryKeys.runs.detail(id)
      )

      // Optimistically update the run status
      if (previousRun) {
        queryClient.setQueryData(queryKeys.runs.detail(id), {
          ...previousRun,
          status: 'cancelled' as const,
        })
      }

      return { previousRun }
    },
    onSettled: (_data, _error, id) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.runs.detail(id),
      })
    },
  })
}
