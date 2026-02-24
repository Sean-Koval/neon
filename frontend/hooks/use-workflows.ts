'use client'

/**
 * Workflow Hooks
 *
 * React hooks for Temporal workflow management.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

/**
 * Workflow status
 */
export type WorkflowStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TERMINATED'
  | 'TIMED_OUT'

/**
 * Workflow summary
 */
export interface WorkflowSummary {
  workflowId: string
  runId: string
  status: WorkflowStatus
  startTime: string
  closeTime: string | null
  type: string
}

/**
 * Workflow progress
 */
export interface WorkflowProgress {
  iteration: number
  maxIterations: number
  status: string
}

/**
 * Hook for listing workflows via tRPC router
 */
export function useWorkflows(options?: {
  status?: WorkflowStatus
  type?: string
  limit?: number
}) {
  return trpc.workflows.list.useQuery(
    {
      status: options?.status as
        | 'RUNNING'
        | 'COMPLETED'
        | 'FAILED'
        | 'CANCELLED'
        | undefined,
      type: options?.type,
      limit: options?.limit ?? 50,
    },
    {
      staleTime: 5000,
      refetchInterval: 10000,
      select: (data: unknown) => {
        const items = Array.isArray(data)
          ? data
          : ((data as { workflows?: WorkflowSummary[] })?.workflows ?? [])
        return items as WorkflowSummary[]
      },
    },
  )
}

/**
 * Hook for getting a single workflow via tRPC router
 */
export function useWorkflow(workflowId: string) {
  return trpc.workflows.get.useQuery(
    { workflowId },
    {
      enabled: !!workflowId,
      staleTime: 5000,
      refetchInterval: 5000,
    },
  )
}

/**
 * Hook for getting workflow progress via tRPC router
 */
export function useWorkflowProgress(workflowId: string) {
  return trpc.workflows.progress.useQuery(
    { workflowId },
    {
      enabled: !!workflowId,
      staleTime: 2000,
      refetchInterval: 3000,
      select: (data: unknown): WorkflowProgress => {
        if (data && typeof data === 'object') {
          const d = data as Record<string, unknown>
          return {
            iteration: (d.iteration as number) ?? 0,
            maxIterations: (d.maxIterations as number) ?? 0,
            status: (d.status as string) ?? 'unknown',
          }
        }
        return { iteration: 0, maxIterations: 0, status: 'unknown' }
      },
    },
  )
}

/**
 * Hook for starting an agent run
 */
export function useStartAgentRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      agentId: string
      agentVersion?: string
      input: Record<string, unknown>
      maxIterations?: number
      requireApproval?: boolean
    }) => {
      const response = await fetch(`${API_URL}/api/workflows/agent-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        throw new Error('Failed to start agent run')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

/**
 * Hook for starting an evaluation run
 */
export function useStartEvalRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      datasetId?: string
      traceIds?: string[]
      scoreConfigIds: string[]
      agentId?: string
      agentVersion?: string
    }) => {
      const response = await fetch(`${API_URL}/api/workflows/eval-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        throw new Error('Failed to start eval run')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

/**
 * Hook for approving a workflow
 */
export function useApproveWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      workflowId: string
      approved: boolean
      reason?: string
    }) => {
      const response = await fetch(
        `${API_URL}/api/workflows/${input.workflowId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approved: input.approved,
            reason: input.reason,
          }),
        },
      )

      if (!response.ok) {
        throw new Error('Failed to send approval')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workflow', variables.workflowId],
      })
    },
  })
}

/**
 * Hook for cancelling a workflow
 */
export function useCancelWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (workflowId: string) => {
      const response = await fetch(
        `${API_URL}/api/workflows/${workflowId}/cancel`,
        {
          method: 'POST',
        },
      )

      if (!response.ok) {
        throw new Error('Failed to cancel workflow')
      }

      return response.json()
    },
    onSuccess: (_, workflowId) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}
