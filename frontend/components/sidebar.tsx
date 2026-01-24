'use client'

import { clsx } from 'clsx'
import {
  FileText,
  GitCompare,
  LayoutDashboard,
  Play,
  Settings,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Suites', href: '/suites', icon: FileText },
  { name: 'Runs', href: '/runs', icon: Play },
  { name: 'Compare', href: '/compare', icon: GitCompare },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900">AgentEval</h1>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <item.icon
                className={clsx(
                  'w-5 h-5 mr-3',
                  isActive ? 'text-primary-600' : 'text-gray-400',
                )}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500">Version 0.1.0</div>
      </div>
    </div>
  )
}
