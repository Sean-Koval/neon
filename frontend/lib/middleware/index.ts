/**
 * Middleware Module
 *
 * Export all middleware utilities for use in API routes.
 */

export {
  // Types
  type AuthenticatedUser,
  type AuthResult,
  type AuthOptions,
  // Authentication
  authenticate,
  withAuth,
  requireAuth,
  getUserFromRequest,
  toAuthContext,
  // Request context
  getRequestContext,
} from './auth'

export { withLogging } from './logging'
export { withMetrics } from './metrics'
