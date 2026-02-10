'use client'

import { Command } from 'cmdk'
import {
  Activity,
  Bot,
  FileText,
  FlaskConical,
  GitCompare,
  GraduationCap,
  LayoutDashboard,
  Search,
  Settings,
  TestTubes,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

interface CommandItem {
  name: string
  href: string
  icon: LucideIcon
  group: 'navigation' | 'actions' | 'search'
}

const commands: CommandItem[] = [
  // Navigation
  { name: 'Command Center', href: '/', icon: LayoutDashboard, group: 'navigation' },
  { name: 'Agents', href: '/agents', icon: Bot, group: 'navigation' },
  { name: 'Traces', href: '/traces', icon: Activity, group: 'navigation' },
  { name: 'Suites', href: '/suites', icon: FlaskConical, group: 'navigation' },
  { name: 'Eval Runs', href: '/eval-runs', icon: Zap, group: 'navigation' },
  { name: 'Compare', href: '/compare', icon: GitCompare, group: 'navigation' },
  { name: 'Experiments', href: '/experiments', icon: TestTubes, group: 'navigation' },
  { name: 'Prompts', href: '/prompts', icon: FileText, group: 'navigation' },
  { name: 'Training', href: '/training', icon: GraduationCap, group: 'navigation' },
  { name: 'Settings', href: '/settings', icon: Settings, group: 'navigation' },
  // Actions
  { name: 'Start eval run', href: '/eval-runs', icon: Zap, group: 'actions' },
  { name: 'Create experiment', href: '/experiments', icon: TestTubes, group: 'actions' },
  { name: 'Compare runs', href: '/compare', icon: GitCompare, group: 'actions' },
  // Search
  { name: 'Search traces...', href: '/traces', icon: Search, group: 'search' },
  { name: 'Search agents...', href: '/agents', icon: Search, group: 'search' },
  { name: 'Search prompts...', href: '/prompts', icon: Search, group: 'search' },
]

const groupHeadingClass =
  '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-content-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold'

const itemClass =
  'flex items-center gap-3 px-3 py-2.5 text-sm text-content-secondary rounded-lg cursor-pointer data-[selected=true]:bg-primary-500/10 data-[selected=true]:text-content-primary'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false)
      setSearchQuery('')
      router.push(href)
    },
    [router],
  )

  const handleSearchSelect = useCallback(
    (href: string) => {
      setOpen(false)
      const query = searchQuery.trim()
      setSearchQuery('')
      if (query) {
        router.push(`${href}?search=${encodeURIComponent(query)}`)
      } else {
        router.push(href)
        // Focus the search input on the target page after navigation
        requestAnimationFrame(() => {
          const searchInput = document.querySelector<HTMLInputElement>(
            '[data-search-input]',
          )
          searchInput?.focus()
        })
      }
    },
    [router, searchQuery],
  )

  // Cmd+K / Ctrl+K to toggle palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) setSearchQuery('')
      }}
      label="Command palette"
      className="fixed inset-0 z-50"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        onKeyDown={() => {}}
      />

      {/* Dialog */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50">
        <div className="bg-surface-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search className="w-5 h-5 text-content-muted shrink-0" />
            <Command.Input
              placeholder="Type a command or search..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="w-full py-3.5 text-base text-content-primary placeholder:text-content-muted bg-transparent outline-none"
            />
          </div>

          {/* Results */}
          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-content-muted">
              No results found.
            </Command.Empty>

            {/* Navigation */}
            <Command.Group heading="Navigation" className={groupHeadingClass}>
              {commands
                .filter((c) => c.group === 'navigation')
                .map((cmd) => (
                  <Command.Item
                    key={`nav-${cmd.name}`}
                    value={cmd.name}
                    onSelect={() => handleSelect(cmd.href)}
                    className={itemClass}
                  >
                    <cmd.icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{cmd.name}</span>
                  </Command.Item>
                ))}
            </Command.Group>

            {/* Actions */}
            <Command.Group heading="Actions" className={groupHeadingClass}>
              {commands
                .filter((c) => c.group === 'actions')
                .map((cmd) => (
                  <Command.Item
                    key={`action-${cmd.name}`}
                    value={cmd.name}
                    onSelect={() => handleSelect(cmd.href)}
                    className={itemClass}
                  >
                    <cmd.icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{cmd.name}</span>
                  </Command.Item>
                ))}
            </Command.Group>

            {/* Search */}
            <Command.Group heading="Search" className={groupHeadingClass}>
              {commands
                .filter((c) => c.group === 'search')
                .map((cmd) => (
                  <Command.Item
                    key={`search-${cmd.name}`}
                    value={cmd.name}
                    onSelect={() => handleSearchSelect(cmd.href)}
                    className={itemClass}
                  >
                    <cmd.icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{cmd.name}</span>
                  </Command.Item>
                ))}
            </Command.Group>
          </Command.List>

          {/* Footer hints */}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[11px] text-content-muted">
            <span>↑↓ Navigate</span>
            <span>·</span>
            <span>↵ Select</span>
            <span>·</span>
            <span>esc Close</span>
          </div>
        </div>
      </div>
    </Command.Dialog>
  )
}
