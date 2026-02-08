'use client'

import { useCallback, useState } from 'react'

/**
 * Hook that persists filter state to localStorage.
 *
 * Reads the initial value from localStorage (falling back to defaultValue),
 * and saves to localStorage on every change.
 */
export function usePersistedFilters<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return defaultValue
      return JSON.parse(raw) as T
    } catch {
      return defaultValue
    }
  })

  const setPersisted = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Ignore storage errors (quota exceeded, etc.)
        }
        return next
      })
    },
    [key],
  )

  return [state, setPersisted]
}
