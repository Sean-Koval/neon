/**
 * tRPC API Route Handler
 *
 * Handles all tRPC requests via Next.js App Router catch-all route.
 * Maps to /api/trpc/* endpoints.
 */

import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/trpc/routers'
import { createContext } from '@/server/trpc/trpc'

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  })
}

export { handler as GET, handler as POST }
