'use client'

/**
 * Settings Page Error Boundary
 *
 * Handles errors that occur while loading or rendering settings.
 */

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ui/error-fallback'

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Settings error:', error)
    }
  }, [error])

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Failed to load settings"
      showBack={false}
      showHome={true}
    />
  )
}
