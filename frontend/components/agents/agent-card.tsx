'use client'

import { Activity, ArrowDown, ArrowUp, Minus, Zap } from 'lucide-react'
import Link from 'next/link'

export interface AgentCardData {
  id: string
  name: string
  version: string
  environments: string[]
  health: 'healthy' | 'degraded' | 'failing'
  avgScore: number
  scoreTrend: 'up' | 'down' | 'flat'
  tracesPerDay: number
  errorRate: number
  p50Latency: number
}

const envBadgeStyles: Record<string, string> = {
  dev: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  staging: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  prod: 'bg-green-500/10 text-green-400 border-green-500/30',
}

const healthStyles: Record<string, { dot: string; label: string }> = {
  healthy: { dot: 'bg-green-400', label: 'Healthy' },
  degraded: { dot: 'bg-yellow-400', label: 'Degraded' },
  failing: { dot: 'bg-red-400', label: 'Failing' },
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <ArrowUp className="w-3 h-3 text-green-400" />
  if (trend === 'down') return <ArrowDown className="w-3 h-3 text-red-400" />
  return <Minus className="w-3 h-3 text-slate-400" />
}

export function AgentCard({ agent }: { agent: AgentCardData }) {
  const health = healthStyles[agent.health]

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-6 hover:border-primary-500/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-lg">{agent.name}</h3>
          <p className="text-dark-400 text-sm">v{agent.version}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${health.dot}`} />
          <span className="text-xs text-dark-400">{health.label}</span>
        </div>
      </div>

      {/* Environment Badges */}
      <div className="flex gap-2 mb-4">
        {['dev', 'staging', 'prod'].map((env) => {
          const isActive = agent.environments.includes(env)
          return (
            <span
              key={env}
              className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded border ${
                isActive
                  ? envBadgeStyles[env]
                  : 'bg-dark-800 text-dark-600 border-dark-700'
              }`}
            >
              {env}
            </span>
          )
        })}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[10px] text-dark-500 uppercase tracking-wider">Avg Score</p>
          <div className="flex items-center gap-1">
            <span className="text-white font-medium">{(agent.avgScore * 100).toFixed(0)}%</span>
            <TrendIcon trend={agent.scoreTrend} />
          </div>
        </div>
        <div>
          <p className="text-[10px] text-dark-500 uppercase tracking-wider">Traces/Day</p>
          <span className="text-white font-medium">{agent.tracesPerDay.toLocaleString()}</span>
        </div>
        <div>
          <p className="text-[10px] text-dark-500 uppercase tracking-wider">Error Rate</p>
          <span className={`font-medium ${agent.errorRate > 5 ? 'text-red-400' : 'text-white'}`}>
            {agent.errorRate.toFixed(1)}%
          </span>
        </div>
        <div>
          <p className="text-[10px] text-dark-500 uppercase tracking-wider">P50 Latency</p>
          <span className="text-white font-medium">{agent.p50Latency.toFixed(0)}ms</span>
        </div>
      </div>

      {/* Quick Links */}
      <div className="flex gap-2 pt-3 border-t border-dark-700/50">
        <Link
          href={`/traces?agent_id=${agent.id}`}
          className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
        >
          <Activity className="w-3 h-3" />
          Traces
        </Link>
        <Link
          href={`/eval-runs?agent_id=${agent.id}`}
          className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 transition-colors"
        >
          <Zap className="w-3 h-3" />
          Evals
        </Link>
      </div>
    </div>
  )
}
