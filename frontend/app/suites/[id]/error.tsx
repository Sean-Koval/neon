'use client'

/**
 * Suite Detail Error Boundary
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function SuiteDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Suite detail error:', error)
    }
  }, [error])

  const isNotFound =
    error.message.toLowerCase().includes('not found') ||
    error.message.includes('404')

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title={isNotFound ? 'Suite not found' : 'Failed to load suite'}
      showBack={true}
      showHome={true}
    />
  )
}
