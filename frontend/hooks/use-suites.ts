/**
 * React Query hooks for eval suite operations.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { EvalSuite, EvalSuiteCreate, EvalSuiteUpdate } from '@/lib/types';

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all eval suites.
 */
export function useSuites(
  options?: Omit<
    UseQueryOptions<EvalSuite[], Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.suites.list(),
    queryFn: async () => {
      const response = await api.getSuites();
      return response.items;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch a single eval suite with its cases.
 */
export function useSuite(
  id: string,
  options?: Omit<
    UseQueryOptions<EvalSuite, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.suites.detail(id),
    queryFn: () => api.getSuite(id),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!id,
    ...options,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

interface UseCreateSuiteOptions {
  onSuccess?: (data: EvalSuite) => void;
  onError?: (error: Error) => void;
}

/**
 * Create a new eval suite.
 */
export function useCreateSuite(options?: UseCreateSuiteOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EvalSuiteCreate) => api.createSuite(data),
    onSuccess: (newSuite) => {
      // Invalidate the suites list to trigger a refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.suites.lists() });

      // Set the new suite in the cache
      queryClient.setQueryData(
        queryKeys.suites.detail(newSuite.id),
        newSuite
      );

      options?.onSuccess?.(newSuite);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}

interface UseUpdateSuiteOptions {
  onSuccess?: (data: EvalSuite) => void;
  onError?: (error: Error) => void;
}

/**
 * Update an existing eval suite.
 */
export function useUpdateSuite(options?: UseUpdateSuiteOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EvalSuiteUpdate }) =>
      api.updateSuite(id, data),
    onSuccess: (updatedSuite, variables) => {
      // Update the suite detail cache
      queryClient.setQueryData(
        queryKeys.suites.detail(variables.id),
        updatedSuite
      );

      // Invalidate the suites list
      queryClient.invalidateQueries({ queryKey: queryKeys.suites.lists() });

      options?.onSuccess?.(updatedSuite);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}

interface UseDeleteSuiteOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Delete an eval suite.
 */
export function useDeleteSuite(options?: UseDeleteSuiteOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteSuite(id),
    onSuccess: (_data, id) => {
      // Remove the suite from the cache
      queryClient.removeQueries({ queryKey: queryKeys.suites.detail(id) });

      // Invalidate the suites list
      queryClient.invalidateQueries({ queryKey: queryKeys.suites.lists() });

      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
    // Optimistic update: remove from list immediately
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.suites.lists() });

      // Snapshot the previous value
      const previousSuites = queryClient.getQueryData<EvalSuite[]>(
        queryKeys.suites.list()
      );

      // Optimistically update the list
      if (previousSuites) {
        queryClient.setQueryData(
          queryKeys.suites.list(),
          previousSuites.filter((suite) => suite.id !== id)
        );
      }

      return { previousSuites };
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.suites.lists() });
    },
  });
}
