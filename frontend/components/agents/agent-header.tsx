'use client'

import { Activity, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

export interface AgentHeaderData {
  id: string
  name: string
  version: string
  environments: string[]
  health: 'healthy' | 'degraded' | 'failing'
  totalTraces: number
  avgScore: number
  errorRate: number
  p50Latency: number
}

const envBadgeStyles: Record<string, string> = {
  dev: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  staging:
    'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  prod: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
}

const healthConfig: Record<
  string,
  { Icon: typeof CheckCircle; color: string; label: string }
> = {
  healthy: { Icon: CheckCircle, color: 'text-green-400', label: 'Healthy' },
  degraded: {
    Icon: AlertTriangle,
    color: 'text-yellow-400',
    label: 'Degraded',
  },
  failing: { Icon: XCircle, color: 'text-red-400', label: 'Failing' },
}

export function AgentHeader({
  agent,
  onEdit,
}: {
  agent: AgentHeaderData
  onEdit?: () => void
}) {
  const health = healthConfig[agent.health]

  return (
    <div className="bg-surface-card border border-border rounded-xl p-6">
      {/* Top Row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">
            {agent.name}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-content-muted text-sm">v{agent.version}</span>
            <div className="flex items-center gap-1.5">
              <health.Icon className={`w-4 h-4 ${health.color}`} />
              <span className={`text-sm ${health.color}`}>{health.label}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="btn btn-secondary btn-sm"
            >
              Edit Metadata
            </button>
          )}

          {/* Environment Badges */}
          <div className="flex gap-2">
            {agent.environments.map((env) => (
              <span
                key={env}
                className={`text-xs font-medium uppercase px-2.5 py-1 rounded border ${
                  envBadgeStyles[env] ||
                  'bg-surface-overlay/50 text-content-muted border-border'
                }`}
              >
                {env}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border">
        <div>
          <p className="text-[10px] text-content-muted uppercase tracking-wider mb-1">
            Total Traces
          </p>
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-primary-500 dark:text-primary-400" />
            <span className="text-content-primary font-semibold text-lg">
              {agent.totalTraces.toLocaleString()}
            </span>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-content-muted uppercase tracking-wider mb-1">
            Avg Score
          </p>
          <span className="text-content-primary font-semibold text-lg">
            {(agent.avgScore * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          <p className="text-[10px] text-content-muted uppercase tracking-wider mb-1">
            Error Rate
          </p>
          <span
            className={`font-semibold text-lg ${agent.errorRate > 5 ? 'text-red-400' : 'text-content-primary'}`}
          >
            {agent.errorRate.toFixed(1)}%
          </span>
        </div>
        <div>
          <p className="text-[10px] text-content-muted uppercase tracking-wider mb-1">
            P50 Latency
          </p>
          <span className="text-content-primary font-semibold text-lg">
            {agent.p50Latency.toFixed(0)}ms
          </span>
        </div>
      </div>
    </div>
  )
}
