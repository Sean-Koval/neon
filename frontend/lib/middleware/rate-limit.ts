/**
 * Rate Limiting Middleware for API Routes
 *
 * Wraps Next.js API route handlers with rate limiting.
 * Uses the in-memory sliding window rate limiter.
 *
 * Returns 429 Too Many Requests with standard rate limit headers
 * when the limit is exceeded.
 *
 * @module lib/middleware/rate-limit
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  type RateLimitConfig,
  READ_LIMIT,
  WRITE_LIMIT,
  rateLimiter,
} from '@/lib/rate-limit'

/**
 * Extract a client identifier from the request for rate limiting.
 * Uses x-forwarded-for, x-real-ip, or falls back to 'anonymous'.
 */
function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-api-key') ||
    'anonymous'
  )
}

/**
 * Higher-order function that wraps an API route handler with rate limiting.
 *
 * @param handler - The route handler function
 * @param config - Rate limit configuration (defaults based on HTTP method)
 *
 * @example
 * ```ts
 * export const GET = withRateLimit(async (request) => {
 *   return NextResponse.json({ data: 'ok' })
 * })
 *
 * // With custom config:
 * export const POST = withRateLimit(async (request) => {
 *   return NextResponse.json({ created: true })
 * }, BATCH_LIMIT)
 * ```
 */
export function withRateLimit<Args extends unknown[]>(
  handler: (request: NextRequest, ...args: Args) => Promise<NextResponse>,
  config?: RateLimitConfig,
): (request: NextRequest, ...args: Args) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    ...args: Args
  ): Promise<NextResponse> => {
    // Skip rate limiting if disabled via env
    if (process.env.RATE_LIMIT_DISABLED === 'true') {
      return handler(request, ...args)
    }

    // Determine config based on HTTP method if not provided
    const effectiveConfig =
      config ??
      (request.method === 'GET' || request.method === 'HEAD'
        ? READ_LIMIT
        : WRITE_LIMIT)

    const clientKey = getClientKey(request)
    const routeKey = `${clientKey}:${request.nextUrl.pathname}`
    const result = rateLimiter.check(routeKey, effectiveConfig)

    // Always add rate limit headers
    const headers = {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(result.reset),
    }

    if (!result.success) {
      const retryAfter = Math.max(1, result.reset - Math.floor(Date.now() / 1000))
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(retryAfter),
          },
        },
      )
    }

    // Execute the handler and add rate limit headers to the response
    const response = await handler(request, ...args)

    // Add headers to successful response
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value)
    }

    return response
  }
}
