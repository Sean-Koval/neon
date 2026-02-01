'use client'

/**
 * Error Fallback Component
 *
 * Reusable error display with retry functionality.
 * Used by error.tsx error boundaries throughout the app.
 */

import { clsx } from 'clsx'
import { AlertCircle, ChevronLeft, Home, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ErrorFallbackProps {
  /** Error object or message */
  error: Error | string
  /** Reset function to retry the failed operation */
  reset?: () => void
  /** Error title */
  title?: string
  /** Custom action button */
  action?: React.ReactNode
  /** Show back button */
  showBack?: boolean
  /** Show home button */
  showHome?: boolean
  /** Variant for different contexts */
  variant?: 'page' | 'inline' | 'card'
  /** Additional class names */
  className?: string
}

export function ErrorFallback({
  error,
  reset,
  title = 'Something went wrong',
  action,
  showBack = false,
  showHome = true,
  variant = 'page',
  className,
}: ErrorFallbackProps) {
  const router = useRouter()
  const errorMessage = error instanceof Error ? error.message : error

  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('ErrorFallback:', error)
  }

  const isNetworkError =
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('fetch') ||
    errorMessage.toLowerCase().includes('failed to load')

  const userFriendlyMessage = isNetworkError
    ? 'Unable to connect. Please check your internet connection and try again.'
    : errorMessage

  if (variant === 'inline') {
    return (
      <div
        className={clsx(
          'flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-lg',
          className,
        )}
      >
        <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
        <p className="text-sm text-rose-700 flex-1">{userFriendlyMessage}</p>
        {reset && (
          <button
            onClick={reset}
            className="text-sm font-medium text-rose-600 hover:text-rose-800 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={clsx('card p-6 text-center', className)}>
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 mb-4">
          <AlertCircle className="w-6 h-6 text-rose-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{userFriendlyMessage}</p>
        {reset && (
          <button
            onClick={reset}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        )}
      </div>
    )
  }

  // Full page variant
  return (
    <div
      className={clsx(
        'min-h-[50vh] flex flex-col items-center justify-center px-4 py-16',
        className,
      )}
    >
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 mb-6">
          <AlertCircle className="w-8 h-8 text-rose-600" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{title}</h1>

        {/* Message */}
        <p className="text-gray-600 mb-8">{userFriendlyMessage}</p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {action || (
            <>
              {reset && (
                <button
                  onClick={reset}
                  className="btn btn-primary inline-flex items-center gap-2 w-full sm:w-auto"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try again
                </button>
              )}
              {showBack && (
                <button
                  onClick={() => router.back()}
                  className="btn btn-secondary inline-flex items-center gap-2 w-full sm:w-auto"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Go back
                </button>
              )}
              {showHome && (
                <button
                  onClick={() => router.push('/')}
                  className="btn btn-ghost inline-flex items-center gap-2 w-full sm:w-auto"
                >
                  <Home className="w-4 h-4" />
                  Dashboard
                </button>
              )}
            </>
          )}
        </div>

        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' &&
          error instanceof Error &&
          error.stack && (
            <details className="mt-8 text-left">
              <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                Error details
              </summary>
              <pre className="mt-2 p-4 bg-gray-100 rounded-lg text-xs text-gray-700 overflow-auto max-h-48">
                {error.stack}
              </pre>
            </details>
          )}
      </div>
    </div>
  )
}

/**
 * Network-specific error fallback
 */
export function NetworkErrorFallback({
  reset,
  className,
}: {
  reset?: () => void
  className?: string
}) {
  return (
    <ErrorFallback
      error="Unable to connect to the server"
      reset={reset}
      title="Connection Error"
      showBack={false}
      className={className}
    />
  )
}

/**
 * Not found fallback (for 404-like errors)
 */
export function NotFoundFallback({
  resource = 'resource',
  className,
}: {
  resource?: string
  className?: string
}) {
  const router = useRouter()

  return (
    <div
      className={clsx(
        'min-h-[50vh] flex flex-col items-center justify-center px-4 py-16',
        className,
      )}
    >
      <div className="text-center max-w-md">
        <div className="text-6xl font-bold text-gray-200 mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {resource.charAt(0).toUpperCase() + resource.slice(1)} not found
        </h1>
        <p className="text-gray-600 mb-8">
          The {resource} you're looking for doesn't exist or has been removed.
        </p>
        <button
          onClick={() => router.push('/')}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
