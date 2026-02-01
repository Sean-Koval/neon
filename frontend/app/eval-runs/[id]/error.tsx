'use client'

/**
 * Eval Run Detail Error Boundary
 *
 * Handles errors that occur while loading or rendering a specific eval run.
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function EvalRunDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Eval run detail error:', error)
    }
  }, [error])

  const isNotFound =
    error.message.toLowerCase().includes('not found') ||
    error.message.includes('404')

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title={
        isNotFound
          ? 'Evaluation run not found'
          : 'Failed to load evaluation run'
      }
      showBack={true}
      showHome={true}
    />
  )
}
