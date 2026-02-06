/**
 * tRPC Client Configuration
 *
 * Provides type-safe tRPC client and React hooks for the frontend.
 * Uses @trpc/react-query for seamless React Query integration.
 */

import { httpBatchLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@/server/trpc/routers'

/**
 * tRPC React client with full type inference from the app router.
 *
 * Usage in components:
 *   const { data } = trpc.traces.list.useQuery({ limit: 10 })
 *   const mutation = trpc.evals.triggerRun.useMutation()
 */
export const trpc = createTRPCReact<AppRouter>()

/**
 * Get the tRPC base URL for the current environment.
 */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: relative URL
    return ''
  }
  // Server-side: use localhost
  return `http://localhost:${process.env.PORT ?? 3000}`
}

/**
 * Create tRPC client links configuration.
 * Exported for use in the TRPCProvider.
 */
export function createTRPCClientLinks() {
  return [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      headers() {
        // Forward project context headers
        const headers: Record<string, string> = {}
        if (typeof window !== 'undefined') {
          const projectId = localStorage.getItem('neon-project-id')
          if (projectId) {
            headers['x-project-id'] = projectId
          }
          const orgId = localStorage.getItem('neon-organization-id')
          if (orgId) {
            headers['x-organization-id'] = orgId
          }
          const wsId = localStorage.getItem('neon-workspace-id')
          if (wsId) {
            headers['x-workspace-id'] = wsId
          }
        }
        return headers
      },
    }),
  ]
}
