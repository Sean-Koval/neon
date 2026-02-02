'use client'

/**
 * Feedback Page Error Boundary
 *
 * Handles errors that occur while loading or rendering the feedback page.
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function FeedbackError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Feedback error:', error)
    }
  }, [error])

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Failed to load feedback"
      showBack={false}
      showHome={true}
    />
  )
}
