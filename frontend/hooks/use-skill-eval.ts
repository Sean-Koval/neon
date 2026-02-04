'use client'

/**
 * Skill Evaluation Hooks
 *
 * React hooks for fetching and managing skill evaluation data.
 * Uses API endpoints with fallback to mock data for development.
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

// =============================================================================
// Mock Data (fallback for development)
// =============================================================================

function getMockSummaries(): SkillEvalSummary[] {
  return [
    {
      skillId: 'web_search',
      skillName: 'Web Search',
      totalEvals: 156,
      passRate: 0.92,
      avgScore: 0.87,
      avgLatencyMs: 1250,
      lastEvalDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
      trend: 'stable',
      regressionCount: 0,
    },
    {
      skillId: 'code_edit',
      skillName: 'Code Edit',
      totalEvals: 89,
      passRate: 0.85,
      avgScore: 0.82,
      avgLatencyMs: 890,
      lastEvalDate: new Date(Date.now() - 4 * 60 * 60 * 1000),
      trend: 'improving',
      regressionCount: 0,
    },
    {
      skillId: 'file_read',
      skillName: 'File Read',
      totalEvals: 234,
      passRate: 0.98,
      avgScore: 0.95,
      avgLatencyMs: 120,
      lastEvalDate: new Date(Date.now() - 1 * 60 * 60 * 1000),
      trend: 'stable',
      regressionCount: 0,
    },
    {
      skillId: 'api_call',
      skillName: 'API Call',
      totalEvals: 67,
      passRate: 0.72,
      avgScore: 0.68,
      avgLatencyMs: 2100,
      lastEvalDate: new Date(Date.now() - 8 * 60 * 60 * 1000),
      trend: 'regressing',
      regressionCount: 3,
    },
    {
      skillId: 'data_transform',
      skillName: 'Data Transform',
      totalEvals: 45,
      passRate: 0.91,
      avgScore: 0.88,
      avgLatencyMs: 450,
      lastEvalDate: new Date(Date.now() - 6 * 60 * 60 * 1000),
      trend: 'stable',
      regressionCount: 0,
    },
  ]
}

function getMockHistory(skillId: string, limit: number): SkillEvalHistory {
  const evaluations = Array.from({ length: limit }, (_, i) => {
    const daysAgo = limit - i - 1
    const baseScore = 0.8 + Math.random() * 0.15
    const noise = (Math.random() - 0.5) * 0.1
    return {
      id: `eval-${skillId}-${i}`,
      version: `v1.${Math.floor(i / 5)}.${i % 5}`,
      timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      passRate: Math.min(1, Math.max(0.5, baseScore + noise)),
      avgScore: Math.min(1, Math.max(0.4, baseScore + noise - 0.05)),
      avgLatencyMs: 800 + Math.floor(Math.random() * 400),
      isRegression: Math.random() < 0.1,
    }
  })
  return { skillId, evaluations }
}

function getMockDetail(_evalId: string): SkillEvalDetail {
  const testResults: SkillTestCaseResult[] = [
    {
      id: 'test-1',
      name: 'Basic query search',
      passed: true,
      scores: [
        {
          name: 'parameter_accuracy',
          value: 0.95,
          reason: 'All parameters valid',
        },
        { name: 'result_quality', value: 0.88, reason: 'patterns: 4/5' },
        { name: 'latency', value: 1.0, reason: 'Within threshold' },
      ],
      latencyMs: 950,
    },
    {
      id: 'test-2',
      name: 'Complex query with filters',
      passed: true,
      scores: [
        {
          name: 'parameter_accuracy',
          value: 0.85,
          reason: 'Missing optional param',
        },
        { name: 'result_quality', value: 0.92, reason: 'All patterns matched' },
        { name: 'latency', value: 0.9, reason: '1200ms (target: 1000ms)' },
      ],
      latencyMs: 1200,
    },
    {
      id: 'test-3',
      name: 'Edge case: empty query',
      passed: false,
      scores: [
        {
          name: 'parameter_accuracy',
          value: 0.5,
          reason: 'Missing required: query',
        },
        { name: 'result_quality', value: 0.0, reason: 'No output' },
        { name: 'latency', value: 1.0 },
      ],
      latencyMs: 50,
      error: 'ValidationError: query is required',
    },
    {
      id: 'test-4',
      name: 'Unicode query handling',
      passed: true,
      scores: [
        {
          name: 'parameter_accuracy',
          value: 1.0,
          reason: 'All parameters valid',
        },
        { name: 'result_quality', value: 0.78, reason: 'patterns: 3/4' },
        { name: 'latency', value: 0.85, reason: '1350ms (target: 1000ms)' },
      ],
      latencyMs: 1350,
    },
  ]

  return {
    skillId: 'web_search',
    skillName: 'Web Search',
    version: 'v1.2.3',
    timestamp: new Date(),
    passRate: 0.75,
    avgScore: 0.82,
    avgLatencyMs: 887,
    testResults,
    isRegression: false,
    baselineScore: 0.8,
  }
}

function getMockRegressions(): SkillRegression[] {
  return [
    {
      skillId: 'api_call',
      skillName: 'API Call',
      severity: 'high',
      delta: -0.15,
      baselineScore: 0.85,
      currentScore: 0.7,
      detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      affectedTests: 5,
    },
    {
      skillId: 'code_edit',
      skillName: 'Code Edit',
      severity: 'low',
      delta: -0.05,
      baselineScore: 0.88,
      currentScore: 0.83,
      detectedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      affectedTests: 2,
    },
  ]
}

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
      // Try API first
      const apiData = await skillApi.getSummaries({ projectId })

      if (apiData.length > 0) {
        // Transform API response to hook types
        return apiData.map((s) => ({
          ...s,
          lastEvalDate: new Date(s.lastEvalDate),
        }))
      }

      // Fallback to mock data for development
      return getMockSummaries()
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
      // Try API first
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

      // Fallback to mock data
      return getMockHistory(skillId, limit)
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
    queryFn: async (): Promise<SkillEvalDetail> => {
      // Try API first
      const apiData = await skillApi.getDetail(evalId)

      if (apiData) {
        return {
          ...apiData,
          timestamp: new Date(apiData.timestamp),
        }
      }

      // Fallback to mock data
      return getMockDetail(evalId)
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
      // Try API first
      const apiData = await skillApi.getRegressions({ projectId })

      if (apiData.length > 0) {
        return apiData.map((r) => ({
          ...r,
          detectedAt: new Date(r.detectedAt),
        }))
      }

      // Fallback to mock data
      return getMockRegressions()
    },
    staleTime: 60 * 1000,
  })
}
