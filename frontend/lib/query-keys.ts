/**
 * Query key factory for React Query cache management.
 * Provides consistent, hierarchical query keys for cache invalidation.
 */

import type { RunsFilter } from './types';

export const queryKeys = {
  // =============================================================================
  // Suites
  // =============================================================================
  suites: {
    all: ['suites'] as const,
    lists: () => [...queryKeys.suites.all, 'list'] as const,
    list: () => [...queryKeys.suites.lists()] as const,
    details: () => [...queryKeys.suites.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.suites.details(), id] as const,
  },

  // =============================================================================
  // Runs
  // =============================================================================
  runs: {
    all: ['runs'] as const,
    lists: () => [...queryKeys.runs.all, 'list'] as const,
    list: (filters?: RunsFilter) =>
      [...queryKeys.runs.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.runs.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.runs.details(), id] as const,
    results: (id: string) =>
      [...queryKeys.runs.detail(id), 'results'] as const,
  },

  // =============================================================================
  // Compare
  // =============================================================================
  compare: {
    all: ['compare'] as const,
    comparison: (baselineId: string, candidateId: string, threshold?: number) =>
      [
        ...queryKeys.compare.all,
        { baseline: baselineId, candidate: candidateId, threshold },
      ] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
