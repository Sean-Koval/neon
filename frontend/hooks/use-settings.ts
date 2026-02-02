'use client'

/**
 * Settings Hooks
 *
 * React Query hooks for settings data fetching.
 */

import { useQuery } from '@tanstack/react-query'

// Types
export interface ProjectSettings {
  projectId: string
  projectName: string
  environment: string
}

export interface LlmProvidersStatus {
  anthropic: boolean
  openai: boolean
}

export interface InfrastructureHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  clickhouse: boolean
  temporal: boolean
  clickhouseUrl?: string
  temporalAddress?: string
  timestamp: string
}

// Fetch functions
async function fetchProjectSettings(): Promise<ProjectSettings> {
  const response = await fetch('/api/settings')
  if (!response.ok) {
    throw new Error('Failed to fetch project settings')
  }
  return response.json()
}

async function fetchLlmProviders(): Promise<LlmProvidersStatus> {
  const response = await fetch('/api/settings/llm-providers')
  if (!response.ok) {
    throw new Error('Failed to fetch LLM providers status')
  }
  return response.json()
}

async function fetchInfrastructureHealth(): Promise<InfrastructureHealth> {
  const response = await fetch('/api/settings/health')
  if (!response.ok) {
    throw new Error('Failed to fetch infrastructure health')
  }
  return response.json()
}

/**
 * Hook for fetching project settings
 */
export function useProjectSettings() {
  return useQuery({
    queryKey: ['settings', 'project'],
    queryFn: fetchProjectSettings,
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook for fetching LLM providers status
 */
export function useLlmProviders() {
  return useQuery({
    queryKey: ['settings', 'llm-providers'],
    queryFn: fetchLlmProviders,
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook for fetching infrastructure health
 */
export function useInfrastructureHealth() {
  return useQuery({
    queryKey: ['settings', 'infrastructure-health'],
    queryFn: fetchInfrastructureHealth,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })
}
