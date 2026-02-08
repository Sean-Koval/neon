/**
 * React Query hooks for alert rules CRUD.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AlertRule, AlertState } from '@/lib/alerting/types'

interface AlertRuleWithState extends AlertRule {
  state: AlertState | null
}

interface AlertRulesResponse {
  items: AlertRuleWithState[]
  count: number
  firing: number
}

export const alertRuleQueryKeys = {
  all: ['alert-rules'] as const,
  list: () => [...alertRuleQueryKeys.all, 'list'] as const,
}

/**
 * Fetch all alert rules with their current state.
 */
export function useAlertRules() {
  return useQuery({
    queryKey: alertRuleQueryKeys.list(),
    queryFn: async (): Promise<AlertRulesResponse> => {
      const response = await fetch('/api/alerts/rules')
      if (!response.ok) {
        throw new Error('Failed to fetch alert rules')
      }
      return response.json()
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

interface CreateAlertRuleInput {
  name: string
  description?: string
  metric: string
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  threshold: number
  severity?: 'critical' | 'warning' | 'info'
  enabled?: boolean
  windowSeconds?: number
  consecutiveBreaches?: number
}

interface MutationOptions {
  onSuccess?: () => void
  onError?: (error: Error) => void
}

/**
 * Create a new alert rule.
 */
export function useCreateAlertRule(options?: MutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateAlertRuleInput) => {
      const response = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create alert rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertRuleQueryKeys.all })
      options?.onSuccess?.()
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

interface UpdateAlertRuleInput {
  id: string
  name?: string
  description?: string
  metric?: string
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  threshold?: number
  severity?: 'critical' | 'warning' | 'info'
  enabled?: boolean
  windowSeconds?: number
  consecutiveBreaches?: number
}

/**
 * Update an existing alert rule.
 */
export function useUpdateAlertRule(options?: MutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateAlertRuleInput) => {
      const response = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update alert rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertRuleQueryKeys.all })
      options?.onSuccess?.()
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}

/**
 * Delete an alert rule.
 */
export function useDeleteAlertRule(options?: MutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/alerts/rules?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to delete alert rule')
      }
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertRuleQueryKeys.all })
      options?.onSuccess?.()
    },
    onError: (error) => {
      options?.onError?.(error)
    },
  })
}
