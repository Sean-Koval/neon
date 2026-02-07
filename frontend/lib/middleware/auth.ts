/**
 * Server-Side Authentication Middleware
 *
 * Provides JWT verification and API key validation for Next.js API routes.
 * Integrates with the multi-tenant organization/workspace model.
 *
 * Authentication Methods (checked in order):
 * 1. Bearer token (JWT) - for user sessions
 * 2. X-API-Key header - for SDK/programmatic access
 *
 * @module lib/middleware/auth
 */

import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { apiKeys, db } from '@/lib/db'
import {
  type AuthContext,
  hasWorkspacePermission,
  type WorkspacePermission,
} from '@/lib/db/permissions'
import { logger } from '@/lib/logger'

// =============================================================================
// Types
// =============================================================================

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
}

export interface AuthResult {
  user: AuthenticatedUser
  workspaceId?: string
  organizationId?: string
  apiKeyId?: string
  scopes?: string[]
}

export interface AuthOptions {
  /** Skip authentication (for public endpoints) */
  optional?: boolean
  /** Required workspace permission */
  requiredPermission?: WorkspacePermission
  /** Allow API key authentication */
  allowApiKey?: boolean
  /** Allow JWT authentication */
  allowJwt?: boolean
}

const DEFAULT_OPTIONS: AuthOptions = {
  optional: false,
  allowApiKey: true,
  allowJwt: true,
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * JWT configuration - loaded from environment variables.
 * For production, use RS256 with proper key rotation.
 */
const JWT_CONFIG = {
  /** JWT secret for HS256 (development) or public key for RS256 (production) */
  secret: process.env.JWT_SECRET,
  /** JWT issuer for validation */
  issuer: process.env.JWT_ISSUER || 'neon',
  /** JWT audience for validation */
  audience: process.env.JWT_AUDIENCE || 'neon-api',
  /** Algorithm to use */
  algorithm: (process.env.JWT_ALGORITHM as 'HS256' | 'RS256') || 'HS256',
}

// =============================================================================
// JWT Verification (using jose - Next.js compatible)
// =============================================================================

/**
 * Verify and decode a JWT token.
 * Uses jose library which is Edge-compatible (unlike jsonwebtoken).
 */
async function verifyJwt(token: string): Promise<AuthenticatedUser | null> {
  try {
    // Dynamic import of jose for edge compatibility
    const { jwtVerify } = await import('jose')

    if (!JWT_CONFIG.secret) {
      logger.error('JWT_SECRET not configured')
      return null
    }

    // Create secret key from environment variable
    const secret = new TextEncoder().encode(JWT_CONFIG.secret)

    // Verify the token
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    })

    // Extract user info from claims
    const userId = payload.sub
    const email = payload.email as string | undefined
    const name = payload.name as string | undefined

    if (!userId || !email) {
      logger.error('JWT missing required claims (sub, email)')
      return null
    }

    return {
      id: userId,
      email,
      name,
    }
  } catch (error) {
    // Log specific JWT errors for debugging
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        logger.warn('JWT token expired')
      } else if (error.message.includes('signature')) {
        logger.warn('JWT signature verification failed')
      } else {
        logger.error({ err: error.message }, 'JWT verification error')
      }
    }
    return null
  }
}

// =============================================================================
// API Key Verification
// =============================================================================

/**
 * Verify an API key and return the associated user/workspace.
 *
 * API Key format: ae_<env>_<random>
 * - ae: prefix for agent-eval
 * - env: environment (dev, staging, prod)
 * - random: 32-character random string
 */
async function verifyApiKey(apiKey: string): Promise<AuthResult | null> {
  try {
    // Validate format
    const parts = apiKey.split('_')
    if (parts.length !== 3 || parts[0] !== 'ae') {
      return null
    }

    // Hash the key for lookup (we store hashes, not raw keys)
    const crypto = await import('crypto')
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')

    // Look up the key
    const key = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
      with: {
        workspace: {
          with: {
            organization: true,
          },
        },
        createdByUser: true,
      },
    })

    if (!key) {
      return null
    }

    // Check expiration
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      logger.warn({ keyPrefix: key.keyPrefix }, 'API key expired')
      return null
    }

    // Update last used timestamp (fire and forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {})

    // Return auth result
    return {
      user: {
        id: key.createdByUser?.id || 'api-key-user',
        email: key.createdByUser?.email || 'api@neon.dev',
        name: key.createdByUser?.name,
      },
      workspaceId: key.workspaceId,
      organizationId: key.workspace?.organizationId,
      apiKeyId: key.id,
      scopes: (key.scopes as string[]) || ['read', 'write'],
    }
  } catch (error) {
    logger.error({ err: error }, 'API key verification error')
    return null
  }
}

// =============================================================================
// Main Authentication Function
// =============================================================================

/**
 * Authenticate a request and return the auth result.
 *
 * @param request - Next.js request object
 * @param options - Authentication options
 * @returns Auth result or null if authentication failed
 */
export async function authenticate(
  request: NextRequest,
  options: AuthOptions = {},
): Promise<AuthResult | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Extract authorization header
  const authHeader = request.headers.get('authorization')
  const apiKeyHeader = request.headers.get('x-api-key')

  // Try JWT Bearer token first
  if (opts.allowJwt && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const user = await verifyJwt(token)

    if (user) {
      // Get workspace from header or query
      const workspaceId =
        request.headers.get('x-workspace-id') ||
        request.nextUrl.searchParams.get('workspace_id')

      return {
        user,
        workspaceId: workspaceId || undefined,
      }
    }
  }

  // Try API key
  if (opts.allowApiKey && apiKeyHeader) {
    const result = await verifyApiKey(apiKeyHeader)
    if (result) {
      return result
    }
  }

  // Authentication failed
  return null
}

// =============================================================================
// Middleware Wrapper
// =============================================================================

/**
 * Higher-order function that wraps an API route handler with authentication.
 *
 * @example
 * ```ts
 * export const GET = withAuth(async (request, auth) => {
 *   // auth.user is guaranteed to be present
 *   return NextResponse.json({ userId: auth.user.id });
 * });
 *
 * // With optional auth:
 * export const GET = withAuth(async (request, auth) => {
 *   if (!auth) {
 *     return NextResponse.json({ public: true });
 *   }
 *   return NextResponse.json({ userId: auth.user.id });
 * }, { optional: true });
 *
 * // With permission check:
 * export const POST = withAuth(async (request, auth) => {
 *   // Only users with workspace:write_traces can reach here
 *   return NextResponse.json({ success: true });
 * }, { requiredPermission: 'workspace:write_traces' });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route context varies by route
export function withAuth<T extends AuthResult | null>(
  handler: (
    request: NextRequest,
    auth: T,
    ...args: any[]
  ) => Promise<NextResponse>,
  options: AuthOptions = {},
): (request: NextRequest, ...args: any[]) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    ...args: any[]
  ): Promise<NextResponse> => {
    const auth = await authenticate(request, options)

    // If auth is required but not present, return 401
    if (!options.optional && !auth) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Valid authentication required',
          hint: 'Provide a valid Bearer token or X-API-Key header',
        },
        { status: 401 },
      )
    }

    // If permission is required, check it
    if (options.requiredPermission && auth) {
      if (!auth.workspaceId) {
        return NextResponse.json(
          {
            error: 'Forbidden',
            message: 'Workspace context required for this operation',
            hint: 'Provide workspace_id via header or query parameter',
          },
          { status: 403 },
        )
      }

      const hasPermission = await hasWorkspacePermission(
        auth.user.id,
        auth.workspaceId,
        options.requiredPermission,
      )

      if (!hasPermission) {
        return NextResponse.json(
          {
            error: 'Forbidden',
            message: `Missing permission: ${options.requiredPermission}`,
          },
          { status: 403 },
        )
      }
    }

    // Call the actual handler, passing through route context (e.g., { params })
    return handler(request, auth as T, ...args)
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get user info from a request (for logging, etc.)
 * Returns null if not authenticated or on error.
 */
export async function getUserFromRequest(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  const auth = await authenticate(request, { optional: true })
  return auth?.user || null
}

/**
 * Require authentication and return 401 response if not authenticated.
 * Use withAuth wrapper instead for cleaner code.
 */
export async function requireAuth(
  request: NextRequest,
): Promise<AuthResult | NextResponse> {
  const auth = await authenticate(request)

  if (!auth) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Valid authentication required',
      },
      { status: 401 },
    )
  }

  return auth
}

/**
 * Build AuthContext for use with permission functions.
 */
export function toAuthContext(auth: AuthResult): AuthContext {
  return {
    userId: auth.user.id,
    organizationId: auth.organizationId,
    workspaceId: auth.workspaceId,
  }
}

// =============================================================================
// Request Context Helpers
// =============================================================================

/**
 * Extract common context from request for logging/tracing.
 */
export function getRequestContext(request: NextRequest): {
  requestId: string
  method: string
  path: string
  userAgent?: string
  ip?: string
} {
  return {
    requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
    method: request.method,
    path: request.nextUrl.pathname,
    userAgent: request.headers.get('user-agent') || undefined,
    ip:
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      undefined,
  }
}
