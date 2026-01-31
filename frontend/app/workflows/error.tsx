'use client'

/**
 * Workflows Error Boundary
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function WorkflowsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Workflows error:', error)
    }
  }, [error])

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Failed to load workflows"
      showBack={false}
      showHome={true}
    />
  )
}
