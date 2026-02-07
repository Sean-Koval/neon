/**
 * React Query hooks for human feedback/RLHF operations.
 * Uses tRPC for type-safe API calls.
 */

'use client'

import { useCallback, useState } from 'react'
import { trpc } from '@/lib/trpc'
import type {
  ComparisonPair,
  FeedbackFilter,
  FeedbackItem,
} from '@/lib/types'

type PreferenceChoice = 'A' | 'B' | 'tie' | 'both_bad'

// =============================================================================
// Query Keys (kept for backward compatibility)
// =============================================================================

export const feedbackQueryKeys = {
  all: ['feedback'] as const,
  lists: () => [...feedbackQueryKeys.all, 'list'] as const,
  list: (filter?: FeedbackFilter) =>
    [...feedbackQueryKeys.lists(), filter ?? {}] as const,
  comparisons: {
    all: ['comparisons'] as const,
    lists: () => [...feedbackQueryKeys.comparisons.all, 'list'] as const,
    list: (options?: { limit?: number; offset?: number; tag?: string }) =>
      [...feedbackQueryKeys.comparisons.lists(), options ?? {}] as const,
  },
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch feedback items with optional filters via tRPC.
 */
export function useFeedback(
  filter?: FeedbackFilter,
  options?: { enabled?: boolean },
) {
  return trpc.feedback.list.useQuery(
    {
      type: filter?.type as 'preference' | 'correction' | undefined,
      user_id: filter?.user_id,
      session_id: filter?.session_id,
      limit: filter?.limit,
      offset: filter?.offset,
    },
    {
      staleTime: 30 * 1000, // 30 seconds
      ...options,
    },
  )
}

/**
 * Fetch comparison pairs for feedback collection via tRPC.
 */
export function useComparisons(
  options?: {
    limit?: number
    offset?: number
    tag?: string
  },
  queryOptions?: { enabled?: boolean },
) {
  return trpc.feedback.comparisons.useQuery(
    {
      tag: options?.tag,
      limit: options?.limit || 10,
      offset: options?.offset,
    },
    {
      staleTime: 60 * 1000, // 1 minute
      ...queryOptions,
    },
  )
}

// =============================================================================
// Mutation Hooks
// =============================================================================

interface UseSubmitFeedbackOptions {
  onSuccess?: (data: { id: string; item: FeedbackItem }) => void
  onError?: (error: Error) => void
}

/**
 * Submit human feedback (preference or correction) via tRPC.
 */
export function useSubmitFeedback(options?: UseSubmitFeedbackOptions) {
  const utils = trpc.useUtils()

  return trpc.feedback.create.useMutation({
    onSuccess: (data) => {
      // Invalidate feedback list to include the new feedback
      utils.feedback.list.invalidate()
      options?.onSuccess?.(data as { id: string; item: FeedbackItem })
    },
    onError: (error) => {
      options?.onError?.(new Error(error.message))
    },
  })
}

// =============================================================================
// Preference Session Hook
// =============================================================================

export interface PreferenceSession {
  /** Current comparison being evaluated */
  currentComparison: ComparisonPair | null
  /** Index of current comparison */
  currentIndex: number
  /** Total comparisons in session */
  totalComparisons: number
  /** Completed comparisons count */
  completedCount: number
  /** Session ID */
  sessionId: string
  /** Is loading comparisons */
  isLoading: boolean
  /** Error if any */
  error: Error | null
  /** Submit preference for current comparison */
  submitPreference: (
    choice: PreferenceChoice,
    reason?: string,
    confidence?: number,
  ) => Promise<void>
  /** Skip current comparison */
  skip: () => void
  /** Go to next comparison */
  next: () => void
  /** Go to previous comparison */
  previous: () => void
  /** Is submitting */
  isSubmitting: boolean
  /** Session progress (0-100) */
  progress: number
  /** Time spent on current comparison (ms) */
  timeOnCurrent: number
}

/**
 * Hook for managing a preference collection session.
 * Handles navigation, timing, and submission of preferences.
 */
export function usePreferenceSession(options?: {
  tag?: string
  limit?: number
  onComplete?: () => void
}): PreferenceSession {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [sessionId] = useState(() => crypto.randomUUID())
  const [startTime, setStartTime] = useState(Date.now())

  const { data, isLoading, error } = useComparisons({
    tag: options?.tag,
    limit: options?.limit || 20,
  })

  const submitFeedbackMutation = useSubmitFeedback()

  const comparisons = (data?.items ?? []) as ComparisonPair[]
  const currentComparison = comparisons[currentIndex] ?? null

  const resetTimer = useCallback(() => {
    setStartTime(Date.now())
  }, [])

  const submitPreference = useCallback(
    async (choice: PreferenceChoice, reason?: string, confidence?: number) => {
      if (!currentComparison) return

      const decisionTime = Date.now() - startTime

      await submitFeedbackMutation.mutateAsync({
        type: 'preference',
        preference: {
          comparison_id: currentComparison.id,
          choice,
          reason,
          confidence,
          decision_time_ms: decisionTime,
        },
        session_id: sessionId,
      })

      setCompletedCount((prev) => prev + 1)

      // Move to next if not at end
      if (currentIndex < comparisons.length - 1) {
        setCurrentIndex((prev) => prev + 1)
        resetTimer()
      } else {
        options?.onComplete?.()
      }
    },
    [
      currentComparison,
      currentIndex,
      comparisons.length,
      sessionId,
      startTime,
      submitFeedbackMutation,
      options,
      resetTimer,
    ],
  )

  const skip = useCallback(() => {
    if (currentIndex < comparisons.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      resetTimer()
    }
  }, [currentIndex, comparisons.length, resetTimer])

  const next = useCallback(() => {
    if (currentIndex < comparisons.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      resetTimer()
    }
  }, [currentIndex, comparisons.length, resetTimer])

  const previous = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
      resetTimer()
    }
  }, [currentIndex, resetTimer])

  const progress =
    comparisons.length > 0
      ? Math.round((completedCount / comparisons.length) * 100)
      : 0

  const timeOnCurrent = Date.now() - startTime

  return {
    currentComparison,
    currentIndex,
    totalComparisons: comparisons.length,
    completedCount,
    sessionId,
    isLoading,
    error: error ? new Error(error.message) : null,
    submitPreference,
    skip,
    next,
    previous,
    isSubmitting: submitFeedbackMutation.isPending,
    progress,
    timeOnCurrent,
  }
}

// =============================================================================
// Correction Hook
// =============================================================================

interface UseCorrectionOptions {
  responseId: string
  originalContent: string
  onSuccess?: () => void
}

/**
 * Hook for managing a correction submission.
 */
export function useCorrection(options: UseCorrectionOptions) {
  const [correctedContent, setCorrectedContent] = useState(
    options.originalContent,
  )
  const [changeSummary, setChangeSummary] = useState('')
  const [correctionTypes, setCorrectionTypes] = useState<string[]>([])

  const submitFeedbackMutation = useSubmitFeedback({
    onSuccess: options.onSuccess,
  })

  const hasChanges = correctedContent !== options.originalContent

  const submitCorrection = useCallback(async () => {
    if (!hasChanges) return

    await submitFeedbackMutation.mutateAsync({
      type: 'correction',
      correction: {
        response_id: options.responseId,
        original_content: options.originalContent,
        corrected_content: correctedContent,
        change_summary: changeSummary || undefined,
        correction_types:
          correctionTypes.length > 0 ? correctionTypes : undefined,
      },
    })
  }, [
    hasChanges,
    options.responseId,
    options.originalContent,
    correctedContent,
    changeSummary,
    correctionTypes,
    submitFeedbackMutation,
  ])

  const reset = useCallback(() => {
    setCorrectedContent(options.originalContent)
    setChangeSummary('')
    setCorrectionTypes([])
  }, [options.originalContent])

  return {
    correctedContent,
    setCorrectedContent,
    changeSummary,
    setChangeSummary,
    correctionTypes,
    setCorrectionTypes,
    hasChanges,
    submitCorrection,
    isSubmitting: submitFeedbackMutation.isPending,
    reset,
  }
}
