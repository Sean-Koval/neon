'use client'

import { signOut, useSession } from 'next-auth/react'
import { useCallback } from 'react'

/**
 * Auth hook that wraps NextAuth's useSession.
 *
 * Provides a stable interface for components that need auth state.
 * Preserves backward compatibility with the previous AuthProvider API.
 */

interface AuthContextValue {
  /** Whether the user has an active session */
  isAuthenticated: boolean
  /** Whether the session is still loading */
  isLoading: boolean
  /** Current user info */
  user: {
    id: string
    email: string
    name?: string | null
    image?: string | null
  } | null
  /** Current workspace ID from the session */
  workspaceId: string | null
  /** Current organization ID from the session */
  organizationId: string | null
  /** Sign out the current user */
  logout: () => void
}

export function useAuth(): AuthContextValue {
  const { data: session, status } = useSession()

  const logout = useCallback(() => {
    signOut({ callbackUrl: '/login' })
  }, [])

  return {
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    user: session?.user
      ? {
          id: session.user.id || '',
          email: session.user.email || '',
          name: session.user.name,
          image: session.user.image,
        }
      : null,
    workspaceId: (session as any)?.workspaceId || null,
    organizationId: (session as any)?.organizationId || null,
    logout,
  }
}

/**
 * Hook to get just the authentication status.
 * Useful for conditional rendering.
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
}
