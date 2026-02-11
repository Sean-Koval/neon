'use client'

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  DollarSign,
  Lightbulb,
  RefreshCw,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { LazyScoreTrends } from '@/components/dashboard/lazy-components'
import { useAlerts } from '@/hooks/use-alerts'
import { useDashboard } from '@/hooks/use-dashboard'
import { CONFIG } from '@/lib/config'
import { safeFormatDistance } from '@/lib/format-date'
import { trpc } from '@/lib/trpc'

// =============================================================================
// Constants
// =============================================================================

const STATUS_DOTS: Record<string, string> = {
  healthy: 'text-emerald-500',
  degraded: 'text-amber-500',
  failing: 'text-rose-500',
  staging: 'text-content-muted',
}

const RUN_STATUS_ICON = {
  completed: { icon: CheckCircle, color: 'text-emerald-500' },
  failed: { icon: AlertCircle, color: 'text-rose-500' },
  running: { icon: Zap, color: 'text-accent-500' },
} as const

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// =============================================================================
// Command Center Page
// =============================================================================

type Environment = 'production' | 'staging'

export default function CommandCenter() {
  const { stats, recentRuns, isLoadingRuns, isLoadingStats, refresh } =
    useDashboard()
  const { data: alertsData, error: alertsError } = useAlerts()
  const alerts = alertsError ? [] : (alertsData?.alerts ?? [])
  const { data: agentsData, isLoading: isLoadingAgents } =
    trpc.agents.list.useQuery()
  const [environment, setEnvironment] = useState<Environment>('production')

  const agents = agentsData ?? []
  const healthyCount = agents.filter((a) => a.health === 'healthy').length
  const failingCount = agents.filter(
    (a) => a.health === 'failing' || a.health === 'degraded',
  ).length

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />

      {/* 1. Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 dark:from-surface-card dark:via-surface-card dark:to-surface-raised p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-content-primary">
                Command Center
              </h1>
              <EnvironmentSelector
                value={environment}
                onChange={setEnvironment}
              />
            </div>
            <p className="text-sm text-content-secondary max-w-2xl">
              Monitor agent quality, stability, and cost in one place. Trends
              and alerts are tuned for fast scanning.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-border bg-surface-card px-3 py-1 text-xs font-medium text-content-secondary">
              Live dashboard
            </span>
            <button
              type="button"
              onClick={refresh}
              className="btn btn-secondary"
              title="Refresh dashboard"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Agents Active"
          value={isLoadingAgents ? '...' : `${healthyCount} / ${agents.length}`}
          subtitle={
            isLoadingAgents
              ? 'Loading...'
              : failingCount > 0
                ? `${failingCount} need attention`
                : 'All healthy'
          }
          icon={
            <Activity className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          }
          tone="neutral"
        />
        <KpiCard
          label="Pass Rate"
          value={
            isLoadingStats || !stats
              ? '...'
              : `${stats.passedPercentage.toFixed(1)}%`
          }
          subtitle={
            isLoadingStats || !stats
              ? 'Loading...'
              : `${stats.totalRuns} total runs`
          }
          icon={
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          }
          tone={
            !stats
              ? 'neutral'
              : stats.passedPercentage >= 90
                ? 'positive'
                : stats.passedPercentage >= 70
                  ? 'neutral'
                  : 'negative'
          }
        />
        <KpiCard
          label="Failed Runs"
          value={isLoadingStats || !stats ? '...' : `${stats.failedRuns}`}
          subtitle={
            isLoadingStats || !stats
              ? 'Loading...'
              : `${stats.failedPercentage.toFixed(1)}% failure rate`
          }
          icon={
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          }
          tone={
            !stats
              ? 'neutral'
              : stats.failedRuns === 0
                ? 'positive'
                : 'negative'
          }
        />
        <KpiCard
          label="Avg Score"
          value={
            isLoadingStats || !stats
              ? '...'
              : `${(stats.averageScore * 100).toFixed(1)}%`
          }
          subtitle={
            isLoadingStats || !stats
              ? 'Loading...'
              : stats.avgDurationMs
                ? `Avg ${formatDuration(stats.avgDurationMs)}`
                : 'Across all runs'
          }
          icon={
            <DollarSign className="w-4 h-4 text-accent-600 dark:text-accent-400" />
          }
          tone={
            !stats
              ? 'neutral'
              : stats.averageScore >= 0.8
                ? 'positive'
                : 'neutral'
          }
        />
      </div>

      {/* 3. Alerts + AI Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Active Alerts */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-content-primary mb-4">
            Active Alerts
          </h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-content-muted py-6 text-center">
              No active alerts
            </p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => {
                const isCritical = alert.severity === 'critical'
                const Icon = isCritical ? AlertCircle : AlertTriangle
                const iconColor = isCritical
                  ? 'text-rose-500'
                  : 'text-amber-500'
                return (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3"
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-content-primary truncate">
                        {alert.suiteName}
                      </p>
                      <p className="text-xs text-content-muted truncate">
                        {alert.details}
                      </p>
                    </div>
                    <span className="text-xs text-content-muted flex-shrink-0">
                      {safeFormatDistance(alert.detectedAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-border">
            <Link
              href="/alerts"
              className="text-sm font-medium text-primary-500 hover:text-accent-500 transition-colors"
            >
              View all alerts →
            </Link>
          </div>
        </div>

        {/* AI Insights */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-content-primary mb-4">
            AI Insights
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-raised flex items-center justify-center mb-3">
              <Lightbulb className="w-6 h-6 text-content-muted" />
            </div>
            <p className="text-sm text-content-muted max-w-xs">
              AI insights will appear here when pattern detection is enabled.
              This feature will analyze agent behavior and suggest improvements.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Agent Health Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border bg-surface-raised/60">
          <h2 className="text-sm font-semibold text-content-primary">
            Agent Health
          </h2>
          <Link
            href="/agents"
            className="text-sm font-medium text-primary-500 hover:text-accent-500 transition-colors"
          >
            View All →
          </Link>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-content-muted uppercase tracking-wide bg-surface-raised/50">
              <th className="text-left px-5 py-3 font-medium">Agent</th>
              <th className="text-left px-5 py-3 font-medium">Version</th>
              <th className="text-left px-5 py-3 font-medium">Status</th>
              <th className="text-right px-5 py-3 font-medium">Error Rate</th>
              <th className="text-right px-5 py-3 font-medium">Latency</th>
              <th className="text-right px-5 py-3 font-medium">Traces</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoadingAgents ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center">
                  <p className="text-sm text-content-muted animate-pulse">
                    Loading agents...
                  </p>
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center">
                  <p className="text-sm text-content-muted">
                    No agents discovered yet. Agents appear when they send
                    traces.
                  </p>
                </td>
              </tr>
            ) : (
              agents.slice(0, 6).map((agent) => (
                <tr
                  key={agent.id}
                  className="hover:bg-surface-raised/60 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/agents/${agent.id}`}
                      className="text-sm font-medium text-content-primary hover:text-primary-500 transition-colors"
                    >
                      {agent.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-content-secondary">
                    v{agent.version}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-content-secondary">
                      <span
                        className={
                          STATUS_DOTS[agent.health] ?? 'text-content-muted'
                        }
                      >
                        ●
                      </span>
                      <span className="capitalize font-medium">
                        {agent.health}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-right font-medium">
                    <span
                      className={
                        agent.errorRate > 5
                          ? 'text-rose-600 dark:text-rose-400'
                          : agent.errorRate > 2
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-content-primary'
                      }
                    >
                      {agent.errorRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-content-secondary text-right">
                    {formatDuration(agent.p50Latency)}
                  </td>
                  <td className="px-5 py-3 text-sm text-content-secondary text-right">
                    {agent.traceCount.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Bottom row: Score Trends + Running */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Score Trends */}
        <LazyScoreTrends
          defaultTimeRange="7d"
          showSuiteFilter={false}
          compact={true}
          threshold={CONFIG.DASHBOARD_SCORE_THRESHOLD}
        />

        {/* Running / Active Work */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-content-primary mb-4">
            Running
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-raised flex items-center justify-center mb-3">
              <Zap className="w-6 h-6 text-content-muted" />
            </div>
            <p className="text-sm font-medium text-content-secondary mb-1">
              No active work
            </p>
            <p className="text-sm text-content-muted max-w-xs mb-4">
              Start an evaluation run or experiment to see progress here.
            </p>
            <Link href="/eval-runs" className="btn btn-primary text-sm">
              Go to Eval Runs
            </Link>
          </div>
        </div>
      </div>

      {/* 6. Recent Activity (from real eval runs) */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-content-primary mb-4">
          Recent Activity
        </h2>
        {isLoadingRuns ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 animate-pulse"
              >
                <div className="w-4 h-4 bg-surface-card rounded-full" />
                <div className="flex-1 h-4 bg-surface-card rounded" />
                <div className="w-20 h-3 bg-surface-card rounded" />
              </div>
            ))}
          </div>
        ) : recentRuns.length === 0 ? (
          <p className="text-sm text-content-muted py-6 text-center">
            No recent eval runs. Activity will appear here when evaluation runs
            are executed.
          </p>
        ) : (
          <div className="space-y-2">
            {recentRuns.slice(0, 6).map((run) => {
              const statusKey =
                run.status === 'completed'
                  ? 'completed'
                  : run.status === 'failed'
                    ? 'failed'
                    : 'running'
              const cfg = RUN_STATUS_ICON[statusKey]
              const Icon = cfg.icon
              return (
                <div
                  key={run.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5"
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                  <p className="text-sm text-content-secondary flex-1 min-w-0 truncate">
                    <span className="font-medium">{run.suite_name}</span>
                    {' — '}
                    {run.status === 'completed'
                      ? `${run.summary?.passed ?? 0}/${run.summary?.total_cases ?? 0} passed`
                      : run.status === 'failed'
                        ? 'run failed'
                        : 'in progress'}
                  </p>
                  <span className="text-xs text-content-muted flex-shrink-0">
                    {safeFormatDistance(run.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// KPI Card Component
// =============================================================================

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  subtitle: string
  icon: React.ReactNode
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const subtitleTone =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-content-muted'

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/25 hover:shadow-lg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-content-muted uppercase tracking-wide">
          {label}
        </p>
        <div className="rounded-lg border border-border bg-surface-raised/70 p-2">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-content-primary">{value}</p>
      <p className={`text-xs mt-1 ${subtitleTone}`}>{subtitle}</p>
    </div>
  )
}

// =============================================================================
// Environment Selector
// =============================================================================

const ENV_CONFIG: Record<Environment, { label: string; dot: string }> = {
  production: { label: 'Production', dot: 'bg-emerald-500' },
  staging: { label: 'Staging', dot: 'bg-amber-500' },
}

function EnvironmentSelector({
  value,
  onChange,
}: {
  value: Environment
  onChange: (env: Environment) => void
}) {
  const [open, setOpen] = useState(false)
  const config = ENV_CONFIG[value]
  const triggerTone =
    value === 'production'
      ? 'border-emerald-300/80 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
      : 'border-amber-300/80 bg-amber-50 text-amber-800 hover:bg-amber-100/80 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/20'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-semibold shadow-sm transition-colors ${triggerTone}`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        {config.label}
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default border-none bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-50 w-44 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden">
            {(Object.keys(ENV_CONFIG) as Environment[]).map((env) => {
              const cfg = ENV_CONFIG[env]
              const isActive = env === value
              return (
                <button
                  key={env}
                  type="button"
                  onClick={() => {
                    onChange(env)
                    setOpen(false)
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary-500/10 text-content-primary'
                      : 'text-content-secondary hover:bg-surface-overlay'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
