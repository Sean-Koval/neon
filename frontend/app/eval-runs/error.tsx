'use client'

/**
 * Eval Runs List Error Boundary
 *
 * Handles errors that occur while loading or rendering the eval runs list.
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function EvalRunsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Eval runs error:', error)
    }
  }, [error])

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Failed to load evaluation runs"
      showBack={false}
      showHome={true}
    />
  )
}
