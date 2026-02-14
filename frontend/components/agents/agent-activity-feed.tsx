'use client'

import {
  AlertTriangle,
  CheckCircle,
  Rocket,
  Settings,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'

interface AgentActivityFeedProps {
  agentId: string
}

const eventIcons = {
  eval_completed: { icon: CheckCircle, color: 'text-emerald-500' },
  eval_failed: { icon: XCircle, color: 'text-rose-500' },
  deployment: { icon: Rocket, color: 'text-primary-500 dark:text-primary-400' },
  alert: { icon: AlertTriangle, color: 'text-amber-500' },
  config_change: { icon: Settings, color: 'text-zinc-500' },
} as const

function relativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function AgentActivityFeed({ agentId }: AgentActivityFeedProps) {
  const { data } = trpc.agents.getRecentActivity.useQuery({ agentId })

  const events = data?.events ?? []

  return (
    <div className="bg-surface-card border border-border rounded-xl p-6">
      <h3 className="text-content-primary font-semibold mb-4">
        Recent Activity
      </h3>
      {events.length === 0 ? (
        <p className="text-sm text-content-muted italic">No recent activity</p>
      ) : (
        <div className="space-y-1">
          {events.map((event) => {
            const config = eventIcons[event.type] || eventIcons.eval_completed
            const Icon = config.icon
            const href = event.traceId ? `/traces/${event.traceId}` : '#'

            return (
              <Link
                key={event.id}
                href={href}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700/50 transition-colors"
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                <span className="text-sm text-content-primary flex-1 truncate">
                  {event.description}
                </span>
                <span className="text-xs text-content-muted flex-shrink-0">
                  {relativeTime(event.timestamp)}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
