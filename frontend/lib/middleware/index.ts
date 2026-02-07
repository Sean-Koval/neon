/**
 * Middleware Module
 *
 * Export all middleware utilities for use in API routes.
 */

export {
  // Types
  type AuthenticatedUser,
  type AuthOptions,
  type AuthResult,
  // Authentication
  authenticate,
  // Request context
  getRequestContext,
  getUserFromRequest,
  requireAuth,
  toAuthContext,
  withAuth,
} from './auth'

export { withLogging } from './logging'
export { withMetrics } from './metrics'
