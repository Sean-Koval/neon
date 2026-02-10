/**
 * React Query hooks for experiment operations.
 */

import {
  type UseQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  Experiment,
  ExperimentStatus,
  ExperimentType,
} from '@/server/trpc/routers/experiments'

// Re-export types for convenience
export type {
  Experiment,
  ExperimentType,
  ExperimentStatus,
  ABTestConfig,
  RolloutConfig,
  ABTestProgress,
  RolloutProgress,
  ABTestResult,
  RolloutResult,
} from '@/server/trpc/routers/experiments'

export interface ExperimentsFilter {
  type?: ExperimentType
  status?: ExperimentStatus
  agentId?: string
  sort?: 'newest' | 'oldest' | 'best_improvement' | 'most_samples'
  limit?: number
}

/**
 * Fetch experiments list with optional filtering.
 */
export function useExperiments(
  filters?: ExperimentsFilter,
  options?: Omit<
    UseQueryOptions<{ items: Experiment[]; total: number }, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  const normalizedFilters = filters
    ? ({ ...filters } as Record<string, unknown>)
    : undefined

  return useQuery({
    queryKey: queryKeys.experiments.list(normalizedFilters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.type) params.set('type', filters.type)
      if (filters?.status) params.set('status', filters.status)
      if (filters?.agentId) params.set('agent_id', filters.agentId)
      if (filters?.sort) params.set('sort', filters.sort)
      if (filters?.limit) params.set('limit', String(filters.limit))

      const url = `/api/trpc/experiments.list?input=${encodeURIComponent(
        JSON.stringify(filters ?? {})
      )}`

      try {
        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          return (data.result?.data ?? { items: [], total: 0 }) as {
            items: Experiment[]
            total: number
          }
        }
      } catch {
        // Fallback
      }

      // Direct API fallback
      return { items: [] as Experiment[], total: 0 }
    },
    staleTime: 10_000,
    retry: 1,
    ...options,
  })
}

/**
 * Fetch experiments with infinite scrolling (cursor-based pagination).
 */
export function useExperimentsInfinite(filters?: ExperimentsFilter) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.experiments.lists(), 'infinite', filters ?? {}],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, unknown> = {
        ...filters,
        limit: 20,
        cursor: pageParam,
      }

      const url = `/api/trpc/experiments.list?input=${encodeURIComponent(
        JSON.stringify(params)
      )}`

      try {
        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          return (data.result?.data ?? {
            items: [],
            nextCursor: undefined,
            total: 0,
          }) as {
            items: Experiment[]
            nextCursor?: string
            total: number
          }
        }
      } catch {
        // Fallback
      }

      return {
        items: [] as Experiment[],
        nextCursor: undefined,
        total: 0,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 10_000,
    retry: 1,
    refetchInterval: (query) => {
      const pages = query.state.data?.pages
      if (!pages) return false
      const hasRunning = pages.some((p) =>
        p.items.some((e) => e.status === 'RUNNING'),
      )
      return hasRunning ? 3000 : false
    },
  })
}

/**
 * Fetch a single experiment by ID.
 */
export function useExperiment(
  id: string,
  options?: Omit<
    UseQueryOptions<Experiment | null, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: queryKeys.experiments.detail(id),
    queryFn: async () => {
      const url = `/api/trpc/experiments.get?input=${encodeURIComponent(
        JSON.stringify({ id })
      )}`

      try {
        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          return (data.result?.data ?? null) as Experiment | null
        }
      } catch {
        // Fallback
      }

      return null
    },
    enabled: !!id,
    staleTime: 5_000,
    retry: 1,
    ...options,
  })
}

/**
 * Create a new experiment.
 */
export function useCreateExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      type: ExperimentType
      agentId: string
      abTest?: {
        variantA: { agentId: string; agentVersion: string; label?: string }
        variantB: { agentId: string; agentVersion: string; label?: string }
        suiteId: string
        scorers: string[]
        sampleSize?: number
        significanceLevel?: number
      }
      rollout?: {
        baseline: { agentId: string; agentVersion: string }
        candidate: { agentId: string; agentVersion: string }
        suiteId: string
        scorers: string[]
        stages: Array<{ percentage: number; gateThreshold: number }>
        stageDurationMs?: number
      }
    }) => {
      const response = await fetch('/api/trpc/experiments.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        throw new Error('Failed to create experiment')
      }

      const data = await response.json()
      return data.result?.data as { experimentId: string; workflowId: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.experiments.lists(),
      })
    },
  })
}

/**
 * Pause an experiment.
 */
export function usePauseExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/trpc/experiments.pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('Failed to pause experiment')
      return response.json()
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.experiments.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.experiments.lists(),
      })
    },
  })
}

/**
 * Resume an experiment.
 */
export function useResumeExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/trpc/experiments.resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('Failed to resume experiment')
      return response.json()
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.experiments.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.experiments.lists(),
      })
    },
  })
}

/**
 * Abort an experiment.
 */
export function useAbortExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/trpc/experiments.abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('Failed to abort experiment')
      return response.json()
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.experiments.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.experiments.lists(),
      })
    },
  })
}

/**
 * Compute experiment summary stats from a list.
 */
export function computeExperimentStats(experiments: Experiment[]) {
  const total = experiments.length
  const running = experiments.filter((e) => e.status === 'RUNNING').length
  const completed = experiments.filter((e) => e.status === 'COMPLETED').length

  // Count experiments that completed successfully with a winner
  const withResults = experiments.filter(
    (e) => e.status === 'COMPLETED' && e.result,
  )
  const successRate =
    completed > 0 ? Math.round((withResults.length / completed) * 100) : 0

  // Average improvement from AB tests with winners
  const improvements = experiments
    .filter(
      (e) =>
        e.type === 'ab_test' &&
        e.status === 'COMPLETED' &&
        e.result &&
        'winner' in e.result &&
        e.result.winner !== 'tie',
    )
    .map((e) => {
      const result = e.result as { improvement?: number }
      return (result.improvement ?? 0) * 100
    })

  const avgImprovement =
    improvements.length > 0
      ? improvements.reduce((sum, v) => sum + v, 0) / improvements.length
      : 0

  return {
    total,
    running,
    successRate,
    avgImprovement,
  }
}
