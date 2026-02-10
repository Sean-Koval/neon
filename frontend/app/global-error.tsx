'use client'

/**
 * Global Error Boundary (Root Layout)
 *
 * Catches errors in the root layout.
 * Must render its own html and body tags since the root layout is broken.
 */

import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Global error (root layout):', error)
    }
  }, [error])

  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
          <div className="text-center max-w-md">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-500/20 mb-6">
              <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              Application Error
            </h1>

            {/* Message */}
            <p className="text-gray-600 mb-8">
              An unexpected error occurred. Please try refreshing the page.
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-rose-600 text-white hover:bg-rose-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                <Home className="w-4 h-4" />
                Dashboard
              </a>
            </div>

            {/* Debug info in development */}
            {process.env.NODE_ENV === 'development' && error.stack && (
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
      </body>
    </html>
  )
}
