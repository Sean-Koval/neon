'use client'

import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ShortcutEntry {
  keys: (string | { text: string; type: 'connector' })[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutEntry[]
}

const sections: ShortcutSection[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['g', { text: 'then', type: 'connector' }, 'c'], description: 'Go to Command Center' },
      { keys: ['g', { text: 'then', type: 'connector' }, 'a'], description: 'Go to Agents' },
      { keys: ['g', { text: 'then', type: 'connector' }, 't'], description: 'Go to Traces' },
      { keys: ['g', { text: 'then', type: 'connector' }, 's'], description: 'Go to Suites' },
      { keys: ['g', { text: 'then', type: 'connector' }, 'e'], description: 'Go to Eval Runs' },
      { keys: ['g', { text: 'then', type: 'connector' }, 'p'], description: 'Go to Prompts' },
      { keys: ['g', { text: 'then', type: 'connector' }, 'x'], description: 'Go to Experiments' },
      { keys: ['g', { text: 'then', type: 'connector' }, 'r'], description: 'Go to Training' },
      { keys: ['g', { text: 'then', type: 'connector' }, ','], description: 'Go to Settings' },
    ],
  },
  {
    title: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['/'], description: 'Focus search (on current page)' },
      { keys: ['?'], description: 'Show this help' },
      { keys: ['Escape'], description: 'Close modal / deselect' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['⌘', 'E'], description: 'Start new eval run' },
      { keys: ['⌘', 'X'], description: 'Create experiment' },
      { keys: ['⌘', 'D'], description: 'Compare runs' },
      { keys: ['r'], description: 'Refresh current page data' },
    ],
  },
  {
    title: 'Table / List',
    shortcuts: [
      { keys: ['j', '/', 'k'], description: 'Move down / up in list' },
      { keys: ['Enter'], description: 'Open selected item' },
      { keys: ['x'], description: 'Select / deselect item' },
    ],
  },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] bg-surface-overlay border border-border rounded-md px-2 py-0.5 text-xs font-mono text-content-secondary">
      {children}
    </kbd>
  )
}

function ShortcutKeys({ keys }: { keys: ShortcutEntry['keys'] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, i) => {
        if (typeof key === 'object' && key.type === 'connector') {
          return (
            <span key={i} className="text-content-muted text-xs">
              {key.text}
            </span>
          )
        }
        if (typeof key === 'string' && key === '/') {
          return (
            <span key={i} className="text-content-muted text-xs">
              /
            </span>
          )
        }
        return <Kbd key={i}>{key as string}</Kbd>
      })}
    </span>
  )
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    previousFocusRef.current?.focus()
  }, [])

  // Listen for `?` key to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '?' && !isInputFocused()) {
        e.preventDefault()
        previousFocusRef.current = document.activeElement as HTMLElement
        setOpen(true)
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        close()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  // Focus trap: when open, focus the dialog and trap Tab
  useEffect(() => {
    if (!open || !dialogRef.current) return
    dialogRef.current.focus()

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
        onKeyDown={() => {}}
      />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="relative w-full max-w-xl bg-surface-card border border-border rounded-xl shadow-2xl overflow-hidden outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-content-primary">
              Keyboard Shortcuts
            </h2>
            <button
              type="button"
              onClick={close}
              className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-overlay transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Shortcut sections in 2-column grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 max-h-[70vh] overflow-y-auto">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-3">
                  {section.title}
                </h3>
                <div className="space-y-2">
                  {section.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className="flex items-center justify-between gap-3"
                    >
                      <ShortcutKeys keys={shortcut.keys} />
                      <span className="text-sm text-content-secondary truncate">
                        {shortcut.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
