'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef } from 'react'

const CHORD_TIMEOUT = 500

const navigationMap: Record<string, string> = {
  c: '/',
  a: '/agents',
  t: '/traces',
  e: '/eval-runs',
  s: '/suites',
  x: '/experiments',
  p: '/prompts',
  r: '/training',
  ',': '/settings',
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useKeyboardShortcuts() {
  const router = useRouter()
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const waitingForChordRef = useRef(false)

  const clearChord = useCallback(() => {
    waitingForChordRef.current = false
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current)
      chordTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip when inside form elements
      if (isInputFocused()) return

      const meta = e.metaKey || e.ctrlKey

      // ⌘K is handled by CommandPalette — don't interfere
      if (meta && e.key === 'k') return

      // Chord: second key after `g`
      if (waitingForChordRef.current) {
        const route = navigationMap[e.key]
        clearChord()
        if (route) {
          e.preventDefault()
          router.push(route)
        }
        return
      }

      // Chord: start `g` sequence
      if (e.key === 'g' && !meta) {
        waitingForChordRef.current = true
        chordTimerRef.current = setTimeout(clearChord, CHORD_TIMEOUT)
        return
      }

      // ⌘E → Start eval run
      if (meta && e.key === 'e') {
        e.preventDefault()
        router.push('/eval-runs')
        return
      }

      // ⌘D → Compare runs
      if (meta && e.key === 'd') {
        e.preventDefault()
        router.push('/compare')
        return
      }

      // `r` → refresh page data
      if (e.key === 'r' && !meta) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('neon:refresh'))
        return
      }

      // `/` → Focus search on current page
      if (e.key === '/' && !meta) {
        const searchInput = document.querySelector<HTMLInputElement>(
          '[data-search-input]',
        )
        if (searchInput) {
          e.preventDefault()
          searchInput.focus()
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearChord()
    }
  }, [router, clearChord])
}
