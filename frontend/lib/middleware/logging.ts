/**
 * Request Logging Middleware
 *
 * Logs structured request/response information for every API call.
 * Generates a unique requestId per request and adds it to response headers.
 *
 * @module lib/middleware/logging
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'

/**
 * Higher-order function that wraps a route handler with request logging.
 * Logs request start (method, path, query) and completion (status, duration).
 * Adds x-request-id header to the response.
 *
 * @example
 * ```ts
 * export const GET = withLogging(async (request) => {
 *   return NextResponse.json({ ok: true })
 * })
 * ```
 */
export function withLogging(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<NextResponse>,
): (request: NextRequest, ...args: unknown[]) => Promise<NextResponse> {
  return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    const requestId =
      request.headers.get('x-request-id') || crypto.randomUUID()
    const method = request.method
    const path = request.nextUrl.pathname
    const query = request.nextUrl.search || undefined

    const log = createLogger({ requestId, method, path })

    log.info({ query }, 'Request started')

    const start = performance.now()

    try {
      const response = await handler(request, ...args)
      const duration = Math.round(performance.now() - start)

      log.info(
        { status: response.status, durationMs: duration },
        'Request completed',
      )

      // Add request ID to response headers
      response.headers.set('x-request-id', requestId)
      return response
    } catch (error) {
      const duration = Math.round(performance.now() - start)

      log.error(
        {
          err: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
          durationMs: duration,
        },
        'Request failed with unhandled error',
      )

      const errorResponse = NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      )
      errorResponse.headers.set('x-request-id', requestId)
      return errorResponse
    }
  }
}
