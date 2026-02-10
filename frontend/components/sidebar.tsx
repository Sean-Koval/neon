'use client'

import { clsx } from 'clsx'
import {
  Activity,
  Bot,
  FileText,
  FlaskConical,
  GitCompare,
  GraduationCap,
  LayoutDashboard,
  Settings,
  TestTubes,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './theme-toggle'
import { PreloadLink } from './ui/preload-link'

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Monitor',
    items: [
      { name: 'Command Center', href: '/', icon: LayoutDashboard },
      { name: 'Agents', href: '/agents', icon: Bot },
      { name: 'Traces', href: '/traces', icon: Activity },
    ],
  },
  {
    label: 'Evaluate',
    items: [
      { name: 'Suites', href: '/suites', icon: FlaskConical },
      { name: 'Eval Runs', href: '/eval-runs', icon: Zap },
      { name: 'Compare', href: '/compare', icon: GitCompare },
    ],
  },
  {
    label: 'Improve',
    items: [
      { name: 'Experiments', href: '/experiments', icon: TestTubes },
      { name: 'Prompts', href: '/prompts', icon: FileText },
      { name: 'Training', href: '/training', icon: GraduationCap },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 h-screen flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]">
      {/* Logo Section */}
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center shadow-neon group-hover:shadow-neon-lg transition-shadow">
              <Zap className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-neon-glow tracking-tight">
              Neon
            </h1>
            <p className="text-[10px] text-content-muted font-medium tracking-wider uppercase">
              Agent Evaluation
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label}>
            <div
              className={clsx(
                'text-[11px] font-semibold uppercase tracking-wider text-content-muted px-6 py-2 mb-1',
                groupIndex === 0 ? 'mt-0' : 'mt-6',
              )}
            >
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href)

                return (
                  <PreloadLink
                    key={item.name}
                    href={item.href}
                    preloadDelay={50}
                    className={clsx(
                      'nav-item',
                      isActive ? 'nav-item-active' : 'nav-item-inactive',
                    )}
                  >
                    <item.icon
                      className={clsx(
                        'w-5 h-5 mr-3 transition-colors',
                        isActive ? 'text-primary-500 dark:text-primary-400' : 'text-content-muted',
                      )}
                    />
                    {item.name}
                  </PreloadLink>
                )
              })}
            </div>
          </div>
        ))}

        {/* Divider + Settings */}
        <div className="border-t border-[var(--sidebar-border)] my-2" />
        {(() => {
          const isSettingsActive = pathname.startsWith('/settings')
          return (
            <PreloadLink
              href="/settings"
              preloadDelay={50}
              className={clsx(
                'nav-item',
                isSettingsActive ? 'nav-item-active' : 'nav-item-inactive',
              )}
            >
              <Settings
                className={clsx(
                  'w-5 h-5 mr-3 transition-colors',
                  isSettingsActive ? 'text-primary-500 dark:text-primary-400' : 'text-content-muted',
                )}
              />
              Settings
            </PreloadLink>
          )
        })()}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--sidebar-border)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-content-muted">v0.2.0</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
