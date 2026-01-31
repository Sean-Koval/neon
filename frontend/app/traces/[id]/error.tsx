'use client'

/**
 * Trace Detail Error Boundary
 *
 * Handles errors that occur while loading or rendering a specific trace.
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function TraceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Trace detail error:', error)
    }
  }, [error])

  // Check if it's a not found error
  const isNotFound = error.message.toLowerCase().includes('not found') ||
    error.message.includes('404')

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title={isNotFound ? 'Trace not found' : 'Failed to load trace'}
      showBack={true}
      showHome={true}
    />
  )
}
