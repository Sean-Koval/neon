'use client'

import { clsx } from 'clsx'
import {
  Activity,
  GitCompare,
  LayoutDashboard,
  Settings,
  Workflow,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PreloadLink } from './ui/preload-link'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Eval Runs', href: '/eval-runs', icon: Workflow },
  { name: 'Traces', href: '/traces', icon: Activity },
  { name: 'Compare', href: '/compare', icon: GitCompare },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 bg-dark-900 flex flex-col">
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
            <p className="text-[10px] text-dark-500 font-medium tracking-wider uppercase">
              Agent Evaluation
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

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
                  isActive ? 'text-primary-400' : 'text-dark-500',
                )}
              />
              {item.name}
            </PreloadLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-800">
        <div className="flex items-center justify-between">
          <span className="text-xs text-dark-500">v0.1.0</span>
          <span className="text-[10px] text-dark-600 font-medium">
            Temporal + ClickHouse
          </span>
        </div>
      </div>
    </div>
  )
}
