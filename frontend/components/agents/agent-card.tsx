'use client'

import { Activity, Zap } from 'lucide-react'
import Link from 'next/link'

export interface AgentCardData {
  id: string
  name: string
  version: string
  environments: string[]
  health: 'healthy' | 'degraded' | 'failing'
  traceCount: number
  errorRate: number
  avgDuration: number
  p50Latency: number
  description?: string
  team?: string
}

const envBadgeStyles: Record<string, string> = {
  dev: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  staging:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  prod: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  development:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  production:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
}

const healthStyles: Record<
  string,
  { dot: string; label: string; pill: string }
> = {
  healthy: {
    dot: 'bg-emerald-500',
    label: 'Healthy',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  },
  degraded: {
    dot: 'bg-amber-500',
    label: 'Degraded',
    pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  },
  failing: {
    dot: 'bg-rose-500',
    label: 'Failing',
    pill: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function AgentCard({ agent }: { agent: AgentCardData }) {
  const health = healthStyles[agent.health]

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/25 hover:shadow-xl dark:hover:border-primary-400/35">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-primary-300/20 blur-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:hidden" />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-content-primary font-semibold text-lg">
            {agent.name}
          </h3>
          <p className="text-content-muted text-sm">v{agent.version}</p>
          {agent.team && (
            <p className="text-content-muted text-xs mt-0.5">{agent.team}</p>
          )}
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${health.pill}`}
        >
          <div className={`w-2 h-2 rounded-full ${health.dot}`} />
          <span>{health.label}</span>
        </div>
      </div>

      {agent.description && (
        <p className="text-content-muted text-sm mb-4 line-clamp-2">
          {agent.description}
        </p>
      )}

      {/* Environment Badges */}
      {agent.environments.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {agent.environments.map((env) => (
            <span
              key={env}
              className={`text-[10px] font-medium uppercase px-2.5 py-1 rounded-md border ${
                envBadgeStyles[env] ||
                'bg-surface-raised/60 text-content-muted border-border'
              }`}
            >
              {env}
            </span>
          ))}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-surface-raised p-2.5">
          <p className="text-[10px] text-content-muted uppercase tracking-wider">
            Traces
          </p>
          <span className="text-content-primary font-semibold">
            {agent.traceCount.toLocaleString()}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-2.5">
          <p className="text-[10px] text-content-muted uppercase tracking-wider">
            Error Rate
          </p>
          <span
            className={`font-semibold ${
              agent.errorRate > 5
                ? 'text-rose-600 dark:text-rose-400'
                : agent.errorRate > 2
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-content-primary'
            }`}
          >
            {agent.errorRate.toFixed(1)}%
          </span>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-2.5">
          <p className="text-[10px] text-content-muted uppercase tracking-wider">
            Avg Duration
          </p>
          <span className="text-content-primary font-semibold">
            {formatDuration(agent.avgDuration)}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-2.5">
          <p className="text-[10px] text-content-muted uppercase tracking-wider">
            P50 Latency
          </p>
          <span
            className={`font-semibold ${
              agent.p50Latency > 6000
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-content-primary'
            }`}
          >
            {formatDuration(agent.p50Latency)}
          </span>
        </div>
      </div>

      {/* Quick Links */}
      <div className="flex gap-2 pt-3 border-t border-border">
        <Link
          href={`/traces?agent_id=${agent.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-primary-500/20 bg-primary-500/10 px-2.5 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-500/15 transition-colors"
        >
          <Activity className="w-3 h-3" />
          Traces
        </Link>
        <Link
          href={`/eval-runs?agent_id=${agent.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-accent-500/20 bg-accent-500/10 px-2.5 py-1.5 text-xs font-medium text-accent-700 dark:text-accent-300 hover:bg-accent-500/15 transition-colors"
        >
          <Zap className="w-3 h-3" />
          Evals
        </Link>
      </div>
    </div>
  )
}
