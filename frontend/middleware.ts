/**
 * Next.js Edge Middleware
 *
 * Protects all dashboard routes by redirecting unauthenticated users to /login.
 * Public routes (login, API auth, health) are excluded.
 *
 * In development with AUTH_DEV_BYPASS=true, all routes are accessible.
 */

export { auth as middleware } from '@/auth'

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - /login (auth page)
     * - /api/auth (NextAuth routes)
     * - /api/health (health check)
     * - /api/v1/traces (trace ingestion — uses API key auth, not sessions)
     * - /_next (Next.js internals)
     * - /favicon.ico, /icons, /images (static assets)
     */
    '/((?!login|api/auth|api/health|api/v1/traces|_next|favicon\\.ico|icons|images).*)',
  ],
}
