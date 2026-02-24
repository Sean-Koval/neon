'use client'

/**
 * Skill Evaluation Hooks
 *
 * React hooks for fetching and managing skill evaluation data.
 * Uses API endpoints for all data queries.
 */

import { useQuery } from '@tanstack/react-query'
import { skillApi } from '@/lib/api'

// =============================================================================
// Types
// =============================================================================

export interface SkillEvalSummary {
  skillId: string
  skillName: string
  totalEvals: number
  passRate: number
  avgScore: number
  avgLatencyMs: number
  lastEvalDate: Date
  trend: 'improving' | 'stable' | 'regressing'
  regressionCount: number
}

export interface SkillEvalHistory {
  skillId: string
  evaluations: Array<{
    id: string
    version: string
    timestamp: Date
    passRate: number
    avgScore: number
    avgLatencyMs: number
    isRegression: boolean
  }>
}

export interface SkillTestCaseResult {
  id: string
  name: string
  passed: boolean
  scores: Array<{
    name: string
    value: number
    reason?: string
  }>
  latencyMs: number
  error?: string
}

export interface SkillEvalDetail {
  skillId: string
  skillName: string
  version: string
  timestamp: Date
  passRate: number
  avgScore: number
  avgLatencyMs: number
  testResults: SkillTestCaseResult[]
  isRegression: boolean
  baselineScore?: number
}

export interface SkillRegression {
  skillId: string
  skillName: string
  severity: 'high' | 'medium' | 'low'
  delta: number
  baselineScore: number
  currentScore: number
  detectedAt: Date
  affectedTests: number
}

// =============================================================================
// Query Keys
// =============================================================================

export const skillEvalKeys = {
  all: ['skill-eval'] as const,
  summaries: (projectId?: string) =>
    [...skillEvalKeys.all, 'summaries', projectId] as const,
  history: (skillId: string, limit: number) =>
    [...skillEvalKeys.all, 'history', skillId, limit] as const,
  detail: (evalId: string) => [...skillEvalKeys.all, 'detail', evalId] as const,
  regressions: (projectId?: string) =>
    [...skillEvalKeys.all, 'regressions', projectId] as const,
}

// No mock data — all hooks fetch from API endpoints via skillApi.

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch all skill evaluation summaries
 */
export function useSkillEvalSummaries(projectId?: string) {
  return useQuery({
    queryKey: skillEvalKeys.summaries(projectId),
    queryFn: async (): Promise<SkillEvalSummary[]> => {
      const apiData = await skillApi.getSummaries({ projectId })
      return apiData.map((s) => ({
        ...s,
        lastEvalDate: new Date(s.lastEvalDate),
      }))
    },
    staleTime: 30 * 1000,
  })
}

/**
 * Fetch evaluation history for a specific skill
 */
export function useSkillEvalHistory(skillId: string, limit = 20) {
  return useQuery({
    queryKey: skillEvalKeys.history(skillId, limit),
    queryFn: async (): Promise<SkillEvalHistory> => {
      const apiData = await skillApi.getHistory(skillId, { limit })

      if (apiData) {
        return {
          skillId: apiData.skillId,
          evaluations: apiData.evaluations.map((e) => ({
            ...e,
            timestamp: new Date(e.timestamp),
          })),
        }
      }

      return { skillId, evaluations: [] }
    },
    staleTime: 60 * 1000,
  })
}

/**
 * Fetch details for a specific skill evaluation
 */
export function useSkillEvalDetail(evalId: string) {
  return useQuery({
    queryKey: skillEvalKeys.detail(evalId),
    queryFn: async (): Promise<SkillEvalDetail | null> => {
      const apiData = await skillApi.getDetail(evalId)

      if (apiData) {
        return {
          ...apiData,
          timestamp: new Date(apiData.timestamp),
        }
      }

      return null
    },
    staleTime: 60 * 1000,
  })
}

/**
 * Fetch regression alerts for skills
 */
export function useSkillRegressions(projectId?: string) {
  return useQuery({
    queryKey: skillEvalKeys.regressions(projectId),
    queryFn: async (): Promise<SkillRegression[]> => {
      const apiData = await skillApi.getRegressions({ projectId })
      return apiData.map((r) => ({
        ...r,
        detectedAt: new Date(r.detectedAt),
      }))
    },
    staleTime: 60 * 1000,
  })
}
