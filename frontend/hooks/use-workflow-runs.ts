/**
 * React Query hooks for Temporal workflow run operations.
 *
 * Provides hooks for:
 * - Starting new eval runs via Temporal
 * - Polling workflow status in real-time
 * - Controlling workflows (pause/resume/cancel)
 */

import {
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import type {
  StartEvalRunRequest,
  StartEvalRunResponse,
  WorkflowControlAction,
  WorkflowControlResponse,
  WorkflowStatus,
  WorkflowStatusPoll,
  WorkflowStatusResponse,
} from '@/lib/types'

// Polling interval for active workflows (in milliseconds)
const ACTIVE_WORKFLOW_POLL_INTERVAL = 2000 // 2 seconds

// Query keys for workflow runs
export const workflowQueryKeys = {
  all: ['workflow-runs'] as const,
  lists: () => [...workflowQueryKeys.all, 'list'] as const,
  list: (filters?: { limit?: number; status?: WorkflowStatus }) =>
    [...workflowQueryKeys.lists(), filters] as const,
  details: () => [...workflowQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowQueryKeys.details(), id] as const,
  status: (id: string) => [...workflowQueryKeys.all, 'status', id] as const,
}

/**
 * Check if a workflow is in an active (non-terminal) state.
 */
function isActiveWorkflow(status: WorkflowStatus | undefined): boolean {
  return status === 'RUNNING'
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch list of workflow runs.
 */
export function useWorkflowRuns(
  filters?: { limit?: number; status?: WorkflowStatus },
  options?: Omit<
    UseQueryOptions<WorkflowStatusResponse[], Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: workflowQueryKeys.list(filters),
    queryFn: async () => {
      const response = await api.listWorkflowRuns(filters)
      return response.items
    },
    staleTime: 10 * 1000, // 10 seconds
    ...options,
  })
}

/**
 * Fetch detailed status for a workflow run.
 */
export function useWorkflowRun(
  id: string,
  options?: Omit<
    UseQueryOptions<WorkflowStatusResponse, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: workflowQueryKeys.detail(id),
    queryFn: () => api.getWorkflowRun(id),
    staleTime: 5 * 1000, // 5 seconds
    enabled: !!id,
    // Poll while the workflow is active
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return isActiveWorkflow(status) ? ACTIVE_WORKFLOW_POLL_INTERVAL : false
    },
    ...options,
  })
}

/**
 * Fetch lightweight status for a workflow (optimized for polling).
 */
export function useWorkflowRunStatus(
  id: string,
  options?: Omit<
    UseQueryOptions<WorkflowStatusPoll, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: workflowQueryKeys.status(id),
    queryFn: () => api.getWorkflowRunStatus(id),
    staleTime: 2 * 1000, // 2 seconds
    enabled: !!id,
    // Poll while the workflow is active
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.isRunning ? ACTIVE_WORKFLOW_POLL_INTERVAL : false
    },
    ...options,
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

interface UseStartWorkflowRunOptions {
  onSuccess?: (data: StartEvalRunResponse) => void
  onError?: (error: Error) => void
}

/**
 * Start a new eval run via Temporal workflow.
 */
export function useStartWorkflowRun(options?: UseStartWorkflowRunOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: StartEvalRunRequest) => api.startWorkflowRun(request),
    onSuccess: (data) => {
      // Invalidate workflow runs list
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.lists() })

      options?.onSuccess?.(data)
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

interface UseControlWorkflowRunOptions {
  onSuccess?: (data: WorkflowControlResponse) => void
  onError?: (error: Error) => void
}

/**
 * Control a running workflow (pause/resume/cancel).
 */
export function useControlWorkflowRun(options?: UseControlWorkflowRunOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: WorkflowControlAction }) =>
      api.controlWorkflowRun(id, action),
    onSuccess: (data, { id }) => {
      // Invalidate specific workflow
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.status(id),
      })

      // Also invalidate the list
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.lists() })

      options?.onSuccess?.(data)
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

/**
 * Cancel a running workflow.
 */
export function useCancelWorkflowRun(options?: UseControlWorkflowRunOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.cancelWorkflowRun(id),
    onSuccess: (data, id) => {
      // Invalidate specific workflow
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.status(id),
      })

      // Also invalidate the list
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.lists() })

      options?.onSuccess?.(data)
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

/**
 * Pause a running workflow.
 */
export function usePauseWorkflowRun(options?: UseControlWorkflowRunOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.pauseWorkflowRun(id),
    onSuccess: (data, id) => {
      // Invalidate specific workflow
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.status(id),
      })

      options?.onSuccess?.(data)
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

/**
 * Resume a paused workflow.
 */
export function useResumeWorkflowRun(options?: UseControlWorkflowRunOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.resumeWorkflowRun(id),
    onSuccess: (data, id) => {
      // Invalidate specific workflow
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.status(id),
      })

      options?.onSuccess?.(data)
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

// =============================================================================
// Derived State Helpers
// =============================================================================

/**
 * Compute progress percentage from workflow status.
 */
export function getProgressPercentage(status: WorkflowStatusPoll): number {
  if (status.progress) {
    return status.progress.percentComplete
  }
  if (status.isComplete) {
    return 100
  }
  return 0
}

/**
 * Get human-readable status text.
 */
export function getStatusText(status: WorkflowStatus): string {
  switch (status) {
    case 'RUNNING':
      return 'Running'
    case 'COMPLETED':
      return 'Completed'
    case 'FAILED':
      return 'Failed'
    case 'CANCELLED':
      return 'Cancelled'
    case 'TERMINATED':
      return 'Terminated'
    case 'TIMED_OUT':
      return 'Timed Out'
    default:
      return 'Unknown'
  }
}

/**
 * Check if workflow can be controlled (paused/resumed/cancelled).
 */
export function canControlWorkflow(status: WorkflowStatus): boolean {
  return status === 'RUNNING'
}
