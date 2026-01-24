'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { Toaster, toast } from 'sonner'
import { QueryErrorBoundary } from '@/components/query-error-boundary'

function handleGlobalError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'
  console.error('Query error:', error)
  toast.error(message)
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 1,
        onError: handleGlobalError,
      },
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <QueryErrorBoundary>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </QueryErrorBoundary>
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      )}
    </QueryClientProvider>
  )
}
