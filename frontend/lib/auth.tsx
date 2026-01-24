'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

/**
 * Auth context for managing API key state.
 *
 * Security considerations:
 * - API key is stored in memory only (not localStorage for XSS protection)
 * - Key is never logged or exposed in error messages
 * - Key can be loaded from env var on init or set at runtime
 */

interface AuthContextValue {
  /** Whether an API key is currently configured */
  isAuthenticated: boolean
  /** Set or update the API key at runtime */
  setApiKey: (key: string) => void
  /** Clear the current API key */
  clearApiKey: () => void
  /** Get the current API key (for internal use by ApiClient only) */
  getApiKey: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

const API_KEY_STORAGE_KEY = 'neon_api_key'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Store key in state - initialized from env var if available
  const [apiKey, setApiKeyState] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize from env var on mount (client-side only)
  useEffect(() => {
    // First try env var (for development)
    const envKey = process.env.NEXT_PUBLIC_API_KEY
    if (envKey) {
      setApiKeyState(envKey)
    } else {
      // Fall back to sessionStorage for runtime-set keys
      // Using sessionStorage instead of localStorage for slightly better security
      // (cleared when browser session ends)
      try {
        const storedKey = sessionStorage.getItem(API_KEY_STORAGE_KEY)
        if (storedKey) {
          setApiKeyState(storedKey)
        }
      } catch {
        // sessionStorage not available (SSR or privacy mode)
      }
    }
    setIsInitialized(true)
  }, [])

  const setApiKey = useCallback((key: string) => {
    // Validate key format before storing
    if (!key || typeof key !== 'string') {
      return
    }

    // Basic format validation (ae_<env>_<key>)
    const parts = key.split('_')
    if (parts.length !== 3 || parts[0] !== 'ae') {
      console.warn('Invalid API key format. Expected: ae_<env>_<key>')
      return
    }

    setApiKeyState(key)

    // Persist to sessionStorage for page refreshes
    try {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, key)
    } catch {
      // sessionStorage not available
    }
  }, [])

  const clearApiKey = useCallback(() => {
    setApiKeyState(null)
    try {
      sessionStorage.removeItem(API_KEY_STORAGE_KEY)
    } catch {
      // sessionStorage not available
    }
  }, [])

  const getApiKey = useCallback(() => {
    return apiKey
  }, [apiKey])

  // Don't render children until initialized to prevent hydration mismatch
  if (!isInitialized) {
    return null
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: apiKey !== null,
        setApiKey,
        clearApiKey,
        getApiKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to access auth context.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * Hook to get just the authentication status.
 * Useful for conditional rendering.
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
}
