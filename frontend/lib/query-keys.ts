/**
 * Query key factory for React Query cache management.
 * Provides consistent, hierarchical query keys for cache invalidation.
 */

import type { RunsFilter } from './types'

export interface AgentFilter {
  environment?: string
  status?: string
  search?: string
}

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
    results: (id: string) => [...queryKeys.runs.detail(id), 'results'] as const,
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

  // =============================================================================
  // Agents
  // =============================================================================
  agents: {
    all: ['agents'] as const,
    lists: () => [...queryKeys.agents.all, 'list'] as const,
    list: (filters?: AgentFilter) =>
      [...queryKeys.agents.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.agents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.agents.details(), id] as const,
  },
  // =============================================================================
  // Experiments
  // =============================================================================
  experiments: {
    all: ['experiments'] as const,
    lists: () => [...queryKeys.experiments.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.experiments.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.experiments.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.experiments.details(), id] as const,
    progress: (id: string) =>
      [...queryKeys.experiments.detail(id), 'progress'] as const,
  },
} as const

export type QueryKeys = typeof queryKeys
