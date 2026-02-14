'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { AgentCardData } from './agent-card'

interface StatCard {
  key: string
  label: string
  dotColor: string
  count: number
}

export function AgentStatCards({ agents }: { agents: AgentCardData[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeStatus = searchParams.get('status') || ''

  const counts = {
    total: agents.length,
    healthy: agents.filter((a) => a.health === 'healthy').length,
    degraded: agents.filter((a) => a.health === 'degraded').length,
    failing: agents.filter((a) => a.health === 'failing').length,
    stale: agents.filter((a) => a.traceCount === 0).length,
  }

  const cards: StatCard[] = [
    {
      key: '',
      label: 'Total Agents',
      dotColor: 'bg-primary-400',
      count: counts.total,
    },
    {
      key: 'healthy',
      label: 'Healthy',
      dotColor: 'bg-emerald-400',
      count: counts.healthy,
    },
    {
      key: 'degraded',
      label: 'Degraded',
      dotColor: 'bg-amber-400',
      count: counts.degraded,
    },
    {
      key: 'failing',
      label: 'Failing',
      dotColor: 'bg-rose-400',
      count: counts.failing,
    },
    {
      key: 'stale',
      label: 'Stale',
      dotColor: 'bg-zinc-400',
      count: counts.stale,
    },
  ]

  const handleClick = (key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (key === activeStatus || key === '') {
      params.delete('status')
    } else {
      params.set('status', key)
    }
    router.push(`/agents?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          onClick={() => handleClick(card.key)}
          className={`bg-surface-card rounded-lg border p-4 text-left transition-all hover:border-primary-500/30 ${
            activeStatus === card.key
              ? 'ring-2 ring-primary border-primary-500/50'
              : 'border-border'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${card.dotColor}`} />
            <span className="text-xs text-content-muted">{card.label}</span>
          </div>
          <span className="text-2xl font-bold text-content-primary">
            {card.count}
          </span>
        </button>
      ))}
    </div>
  )
}
