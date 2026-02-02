/**
 * React Query hooks for human feedback/RLHF operations.
 */

import {
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type {
  ComparisonPair,
  ComparisonPairList,
  FeedbackCreate,
  FeedbackFilter,
  FeedbackItem,
  FeedbackList,
  PreferenceChoice,
} from '@/lib/types'

// =============================================================================
// API Functions
// =============================================================================

async function getFeedback(filter?: FeedbackFilter): Promise<FeedbackList> {
  const params = new URLSearchParams()
  if (filter?.type) params.set('type', filter.type)
  if (filter?.user_id) params.set('user_id', filter.user_id)
  if (filter?.session_id) params.set('session_id', filter.session_id)
  if (filter?.limit) params.set('limit', String(filter.limit))
  if (filter?.offset) params.set('offset', String(filter.offset))

  const query = params.toString()
  const response = await fetch(`/api/feedback${query ? `?${query}` : ''}`)

  if (!response.ok) {
    throw new Error('Failed to fetch feedback')
  }

  return response.json()
}

async function submitFeedback(
  data: FeedbackCreate,
): Promise<{ id: string; item: FeedbackItem }> {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to submit feedback')
  }

  return response.json()
}

async function getComparisons(options?: {
  limit?: number
  offset?: number
  tag?: string
}): Promise<ComparisonPairList> {
  const params = new URLSearchParams()
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))
  if (options?.tag) params.set('tag', options.tag)

  const query = params.toString()
  const response = await fetch(
    `/api/feedback/comparisons${query ? `?${query}` : ''}`,
  )

  if (!response.ok) {
    throw new Error('Failed to fetch comparisons')
  }

  return response.json()
}

// =============================================================================
// Query Keys
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
 * Fetch feedback items with optional filters.
 */
export function useFeedback(
  filter?: FeedbackFilter,
  options?: Omit<UseQueryOptions<FeedbackList, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: feedbackQueryKeys.list(filter),
    queryFn: () => getFeedback(filter),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  })
}

/**
 * Fetch comparison pairs for feedback collection.
 */
export function useComparisons(
  options?: {
    limit?: number
    offset?: number
    tag?: string
  },
  queryOptions?: Omit<
    UseQueryOptions<ComparisonPairList, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: feedbackQueryKeys.comparisons.list(options),
    queryFn: () => getComparisons(options),
    staleTime: 60 * 1000, // 1 minute
    ...queryOptions,
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

interface UseSubmitFeedbackOptions {
  onSuccess?: (data: { id: string; item: FeedbackItem }) => void
  onError?: (error: Error) => void
}

/**
 * Submit human feedback (preference or correction).
 */
export function useSubmitFeedback(options?: UseSubmitFeedbackOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitFeedback,
    onSuccess: (data) => {
      // Invalidate feedback list to include the new feedback
      queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.lists() })
      options?.onSuccess?.(data)
    },
    onError: (error) => {
      options?.onError?.(error)
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

  const comparisons = data?.items ?? []
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
    error: error ?? null,
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
