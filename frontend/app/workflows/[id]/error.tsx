'use client'

/**
 * Workflow Detail Error Boundary
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function WorkflowDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Workflow detail error:', error)
    }
  }, [error])

  const isNotFound = error.message.toLowerCase().includes('not found') ||
    error.message.includes('404')

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title={isNotFound ? 'Workflow not found' : 'Failed to load workflow'}
      showBack={true}
      showHome={true}
    />
  )
}
