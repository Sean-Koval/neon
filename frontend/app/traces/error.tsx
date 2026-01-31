'use client'

/**
 * Traces List Error Boundary
 *
 * Handles errors that occur while loading or rendering the traces list.
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function TracesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Traces error:', error)
    }
  }, [error])

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Failed to load traces"
      showBack={false}
      showHome={true}
    />
  )
}
