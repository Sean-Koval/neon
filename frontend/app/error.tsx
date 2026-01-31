'use client'

/**
 * Global Error Boundary
 *
 * Catches unhandled errors at the app level.
 * This is the last line of defense for error handling.
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Global error boundary caught:', error)
    }

    // In production, you might want to report to an error tracking service
    // reportError(error)
  }, [error])

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Something went wrong"
      showBack={false}
      showHome={true}
    />
  )
}
