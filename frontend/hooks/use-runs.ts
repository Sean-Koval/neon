/**
 * React Query hooks for eval run operations.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  EvalResult,
  EvalRun,
  EvalRunCreate,
  RunsFilter,
} from '@/lib/types';

// Polling interval for active runs (in milliseconds)
const ACTIVE_RUN_POLL_INTERVAL = 3000; // 3 seconds

/**
 * Check if a run is in an active (non-terminal) state.
 */
function isActiveRun(run: EvalRun | undefined): boolean {
  if (!run) return false;
  return run.status === 'pending' || run.status === 'running';
}

// =============================================================================
// Dashboard Stats Types
// =============================================================================

/**
 * Aggregated dashboard statistics computed from runs.
 */
export interface DashboardStats {
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passedPercentage: number;
  failedPercentage: number;
  averageScore: number;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch eval runs with optional filters.
 */
export function useRuns(
  filters?: RunsFilter,
  options?: Omit<UseQueryOptions<EvalRun[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.runs.list(filters),
    queryFn: async () => {
      const response = await api.getRuns(filters);
      return response.items;
    },
    staleTime: 30 * 1000, // 30 seconds - runs change more frequently
    ...options,
  });
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
      const run = query.state.data;
      return isActiveRun(run) ? ACTIVE_RUN_POLL_INTERVAL : false;
    },
    ...options,
  });

  return query;
}

interface UseRunResultsOptions extends Omit<
  UseQueryOptions<EvalResult[], Error>,
  'queryKey' | 'queryFn'
> {
  failedOnly?: boolean;
}

/**
 * Fetch detailed results for an eval run.
 */
export function useRunResults(
  id: string,
  options?: UseRunResultsOptions
) {
  const { failedOnly = false, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey: queryKeys.runs.results(id),
    queryFn: () => api.getRunResults(id, { failed_only: failedOnly }),
    staleTime: 60 * 1000, // 1 minute - results don't change after completion
    enabled: !!id,
    ...queryOptions,
  });
}

// =============================================================================
// Dashboard Stats Hooks
// =============================================================================

/**
 * Compute dashboard stats from a list of runs.
 */
function computeStats(runs: EvalRun[]): DashboardStats {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      passedPercentage: 0,
      failedPercentage: 0,
      averageScore: 0,
    };
  }

  // Count runs by outcome
  // A run is "passed" if status is completed and all cases passed
  // A run is "failed" if status is failed OR completed with failures
  let passedRuns = 0;
  let failedRuns = 0;
  let totalScore = 0;
  let runsWithScores = 0;

  for (const run of runs) {
    if (run.status === 'completed' && run.summary) {
      if (run.summary.failed === 0 && run.summary.errored === 0) {
        passedRuns++;
      } else {
        failedRuns++;
      }
      totalScore += run.summary.avg_score;
      runsWithScores++;
    } else if (run.status === 'failed') {
      failedRuns++;
    }
    // pending, running, cancelled don't count as passed or failed
  }

  const totalRuns = runs.length;
  const passedPercentage = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
  const failedPercentage = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0;
  const averageScore = runsWithScores > 0 ? totalScore / runsWithScores : 0;

  return {
    totalRuns,
    passedRuns,
    failedRuns,
    passedPercentage,
    failedPercentage,
    averageScore,
  };
}

/**
 * Hook for fetching dashboard stats.
 * Fetches all runs and computes aggregate statistics.
 */
export function useDashboardStats() {
  const { data: runs, isLoading, error, refetch } = useRuns({ limit: 1000 });

  const stats = useMemo(() => {
    if (!runs) return null;
    return computeStats(runs);
  }, [runs]);

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching recent runs for the dashboard.
 * Auto-refreshes every 30 seconds to catch new runs.
 */
export function useRecentRuns(limit = 5) {
  return useQuery({
    queryKey: ['recent-runs', limit],
    queryFn: async () => {
      const response = await api.getRuns({ limit });
      return response.items;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

interface UseTriggerRunOptions {
  onSuccess?: (data: EvalRun) => void;
  onError?: (error: Error) => void;
}

/**
 * Trigger a new eval run for a suite.
 */
export function useTriggerRun(options?: UseTriggerRunOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      suiteId,
      data = {},
    }: {
      suiteId: string;
      data?: EvalRunCreate;
    }) => api.triggerRun(suiteId, data),
    onSuccess: (newRun) => {
      // Invalidate runs list to include the new run
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.lists() });

      // Set the new run in the cache
      queryClient.setQueryData(queryKeys.runs.detail(newRun.id), newRun);

      options?.onSuccess?.(newRun);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}

interface UseCancelRunOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Cancel an active eval run.
 */
export function useCancelRun(options?: UseCancelRunOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.cancelRun(id),
    onSuccess: (_data, id) => {
      // Invalidate the specific run to get updated status
      queryClient.invalidateQueries({
        queryKey: queryKeys.runs.detail(id),
      });

      // Also invalidate the runs list
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.lists() });

      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
    // Optimistic update: set status to cancelled immediately
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.runs.detail(id),
      });

      // Snapshot the previous value
      const previousRun = queryClient.getQueryData<EvalRun>(
        queryKeys.runs.detail(id)
      );

      // Optimistically update the run status
      if (previousRun) {
        queryClient.setQueryData(queryKeys.runs.detail(id), {
          ...previousRun,
          status: 'cancelled' as const,
        });
      }

      return { previousRun };
    },
    onSettled: (_data, _error, id) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.runs.detail(id),
      });
    },
  });
}
