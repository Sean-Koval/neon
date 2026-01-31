'use client'

/**
 * PreloadLink Component
 *
 * A Link component that preloads the target route on hover or focus.
 * This improves perceived performance by loading page resources before
 * the user actually clicks.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps, FocusEvent, MouseEvent } from 'react'
import { useCallback, useRef } from 'react'

interface PreloadLinkProps extends ComponentProps<typeof Link> {
  /** Delay in ms before preloading starts (default: 100) */
  preloadDelay?: number
  /** Whether to preload on focus (default: true) */
  preloadOnFocus?: boolean
}

/**
 * Link component that preloads routes on hover/focus
 */
export function PreloadLink({
  href,
  children,
  preloadDelay = 100,
  preloadOnFocus = true,
  onMouseEnter,
  onFocus,
  ...props
}: PreloadLinkProps) {
  const router = useRouter()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const startPreload = useCallback(() => {
    // Clear any pending preload
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Start preloading after delay
    timeoutRef.current = setTimeout(() => {
      if (typeof href === 'string') {
        router.prefetch(href)
      } else if (href.pathname) {
        router.prefetch(href.pathname)
      }
    }, preloadDelay)
  }, [href, preloadDelay, router])

  const cancelPreload = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const handleMouseEnter = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      startPreload()
      onMouseEnter?.(e)
    },
    [startPreload, onMouseEnter],
  )

  const handleMouseLeave = useCallback(() => {
    cancelPreload()
  }, [cancelPreload])

  const handleFocus = useCallback(
    (e: FocusEvent<HTMLAnchorElement>) => {
      if (preloadOnFocus) {
        startPreload()
      }
      onFocus?.(e)
    },
    [preloadOnFocus, startPreload, onFocus],
  )

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      {...props}
    >
      {children}
    </Link>
  )
}

export default PreloadLink
