/**
 * Metrics Middleware
 *
 * Records Prometheus metrics for every API request:
 * - neon_api_requests_total (counter with method, path, status)
 * - neon_api_request_duration_seconds (histogram with method, path)
 *
 * @module lib/middleware/metrics
 */

import { type NextRequest, NextResponse } from 'next/server'
import { apiRequestDuration, apiRequestsTotal } from '@/lib/metrics'

/**
 * Normalize API path for metric labels.
 * Replaces dynamic segments (UUIDs, IDs) with :id to avoid high cardinality.
 */
function normalizePath(path: string): string {
  return path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:id',
  )
}

/**
 * Higher-order function that wraps a route handler with metrics recording.
 *
 * @example
 * ```ts
 * export const GET = withMetrics(async (request) => {
 *   return NextResponse.json({ ok: true })
 * })
 * ```
 */
export function withMetrics(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<NextResponse>,
): (request: NextRequest, ...args: unknown[]) => Promise<NextResponse> {
  return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    const method = request.method
    const path = normalizePath(request.nextUrl.pathname)
    const end = apiRequestDuration.startTimer({ method, path })

    try {
      const response = await handler(request, ...args)
      end()
      apiRequestsTotal.inc({ method, path, status: String(response.status) })
      return response
    } catch (error) {
      end()
      apiRequestsTotal.inc({ method, path, status: '500' })
      throw error
    }
  }
}
