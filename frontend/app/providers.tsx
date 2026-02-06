'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { type ReactNode, useCallback, useState } from 'react'
import { ErrorBoundary } from '@/components/error-boundary'
import { ToastProvider, useToast } from '@/components/toast'
import { AuthProvider } from '@/lib/auth'
import { queryKeys } from '@/lib/query-keys'
import { workflowQueryKeys } from '@/hooks/use-workflow-runs'

// Query error handler that can be used with toast
function useQueryErrorHandler() {
  const { addToast } = useToast()

  return useCallback(
    (error: Error) => {
      console.error('Query error:', error)
      addToast(
        error.message || 'An error occurred while fetching data',
        'error',
      )
    },
    [addToast],
  )
}

// Mutation error handler that can be used with toast
function useMutationErrorHandler() {
  const { addToast } = useToast()

  return useCallback(
    (error: Error) => {
      console.error('Mutation error:', error)
      addToast(error.message || 'An error occurred while saving data', 'error')
    },
    [addToast],
  )
}

// Export hooks for use in components
export { useQueryErrorHandler, useMutationErrorHandler }

// Create query client with default options and per-query-type cache settings
function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Default: data is fresh for 30 seconds
        staleTime: 30 * 1000,
        // Cache data for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Smart retry: don't retry on auth errors, otherwise retry up to 3 times
        retry: (failureCount, error) => {
          if (error instanceof Error && error.message.includes('401')) {
            return false
          }
          return failureCount < 3
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Don't refetch on window focus (can be noisy for dashboard apps)
        refetchOnWindowFocus: false,
        // Refetch on reconnect
        refetchOnReconnect: true,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
        retryDelay: 1000,
      },
    },
  })

  // Runs change frequently (active evals) - keep stale time short
  client.setQueryDefaults(queryKeys.runs.all, {
    staleTime: 15 * 1000, // 15 seconds
  })

  // Workflow run statuses are polled in real-time - very short stale time
  client.setQueryDefaults(workflowQueryKeys.all, {
    staleTime: 10 * 1000, // 10 seconds
  })

  // Suites and config are mostly static - cache longer
  client.setQueryDefaults(queryKeys.suites.all, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })

  // Comparisons are computed and don't change - cache aggressively
  client.setQueryDefaults(queryKeys.compare.all, {
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  })

  return client
}

interface QueryProviderProps {
  children: ReactNode
}

function QueryProvider({ children }: QueryProviderProps) {
  // Use useState to create the query client once per component lifecycle
  // This prevents creating a new client on every render
  const [queryClient] = useState(() => createQueryClient())

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        {/* React Query Devtools - only visible in development */}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="bottom-left"
          />
        )}
      </QueryClientProvider>
    </AuthProvider>
  )
}

interface QueryErrorBoundaryProps {
  children: ReactNode
}

function QueryErrorBoundary({ children }: QueryErrorBoundaryProps) {
  return (
    <ErrorBoundary
      onError={(error) => {
        // Log query-related errors for monitoring
        console.error('Query ErrorBoundary caught:', error)
      }}
      fallback={
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
          <h2 className="mb-2 text-xl font-semibold text-gray-900">
            Failed to load data
          </h2>
          <p className="mb-4 text-gray-600">
            There was a problem loading the requested data.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Reload page
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ToastProvider>
      <QueryProvider>
        <QueryErrorBoundary>{children}</QueryErrorBoundary>
      </QueryProvider>
    </ToastProvider>
  )
}
