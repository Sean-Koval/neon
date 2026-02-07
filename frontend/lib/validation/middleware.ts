/**
 * Request Body Validation Middleware
 *
 * Provides a helper to validate request bodies against Zod schemas.
 * Returns parsed data on success, or a 400 response with details on failure.
 *
 * @module lib/validation/middleware
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Result of body validation — either parsed data or a 400 error response.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse }

/**
 * Validate a request body against a Zod schema.
 *
 * @param schema - Zod schema to validate against
 * @param body - The parsed JSON body from the request
 * @returns Parsed data on success, or a NextResponse with validation errors
 *
 * @example
 * ```ts
 * const result = validateBody(createRunSchema, body)
 * if (!result.success) return result.response
 * const data = result.data // fully typed
 * ```
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))

    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Validation failed',
          details: errors,
        },
        { status: 400 },
      ),
    }
  }

  return { success: true, data: parsed.data }
}
