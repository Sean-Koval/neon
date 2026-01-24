'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { initializeApiClient } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'

/**
 * Inner component that initializes the API client after auth is ready.
 * This ensures the API client has access to the auth context's getApiKey.
 */
function ApiClientInitializer({ children }: { children: React.ReactNode }) {
  const { getApiKey } = useAuth()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    initializeApiClient(getApiKey)
    setIsInitialized(true)
  }, [getApiKey])

  // Don't render until API client is initialized
  if (!isInitialized) {
    return null
  }

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Don't retry on auth errors
              if (error instanceof Error && error.message.includes('401')) {
                return false
              }
              return failureCount < 3
            },
          },
        },
      }),
  )

  return (
    <AuthProvider>
      <ApiClientInitializer>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ApiClientInitializer>
    </AuthProvider>
  )
}
