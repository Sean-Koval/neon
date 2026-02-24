'use client'

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Brain,
  CheckCircle,
  ChevronDown,
  DollarSign,
  FlaskConical,
  Lightbulb,
  RefreshCw,
  Rocket,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { LazyScoreTrends } from '@/components/dashboard/lazy-components'
import { useActivityFeed } from '@/hooks/use-activity-feed'
import { useAgentHealth } from '@/hooks/use-agent-health'
import { useAlerts } from '@/hooks/use-alerts'
import { useDashboard } from '@/hooks/use-dashboard'
import { type RunningWorkItem, useRunningWork } from '@/hooks/use-running-work'
import { CONFIG } from '@/lib/config'
import { safeFormatDistance } from '@/lib/format-date'
import type { ActivityEvent } from '@/types/activity'

// =============================================================================
// Running Work Helpers
// =============================================================================

const RUNNING_TYPE_ICON: Record<
  RunningWorkItem['type'],
  { icon: typeof Zap; label: string }
> = {
  eval: { icon: Zap, label: 'Eval Run' },
  experiment: { icon: FlaskConical, label: 'Experiment' },
  training: { icon: Brain, label: 'Training' },
}

// =============================================================================
// Constants
// =============================================================================

const STATUS_DOTS: Record<string, string> = {
  healthy: 'text-emerald-500',
  degraded: 'text-amber-500',
  failing: 'text-rose-500',
  staging: 'text-content-muted',
}

const ACTIVITY_ICON: Record<
  ActivityEvent['type'],
  { icon: typeof CheckCircle; color: string }
> = {
  'eval-complete': { icon: CheckCircle, color: 'text-emerald-500' },
  deploy: { icon: Rocket, color: 'text-primary-500' },
  optimization: { icon: Zap, color: 'text-accent-500' },
  alert: { icon: AlertTriangle, color: 'text-amber-500' },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// =============================================================================
// Command Center Page
// =============================================================================

type Environment = 'production' | 'staging'

export default function CommandCenter() {
  const { stats, isLoadingStats, trendData, isLoadingTrend, refresh } =
    useDashboard()
  const { data: alertsData, error: alertsError } = useAlerts()
  const { data: activityData, isLoading: isLoadingActivity } = useActivityFeed()
  const alerts = alertsError ? [] : (alertsData?.alerts ?? [])
  const { agents, isLoading: isLoadingAgents } = useAgentHealth()
  const { items: runningItems, isLoading: isLoadingRunning } = useRunningWork()
  const [environment, setEnvironment] = useState<Environment>('production')

  const healthyCount = agents.filter((a) => a.status === 'healthy').length
  const failingCount = agents.filter(
    (a) => a.status === 'failing' || a.status === 'degraded',
  ).length

  // Derive per-metric sparkline data from trend data
  const sparklines = useMemo(() => {
    if (!trendData || trendData.length === 0) return null
    const points = trendData.slice(-10) // last 10 data points
    return {
      totalRuns: points.map((p) => ({ v: p.runCount })),
      passRate: points.map((p) => ({ v: p.score * 100 })),
      failedRuns: points.map((p) => ({ v: (1 - p.score) * p.runCount })),
      avgScore: points.map((p) => ({ v: p.score * 100 })),
    }
  }, [trendData])

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
          sparklineData={sparklines?.totalRuns}
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
          sparklineData={sparklines?.passRate}
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
          sparklineData={sparklines?.failedRuns}
          sparklineInvert
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
          sparklineData={sparklines?.avgScore}
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
              <th className="text-right px-5 py-3 font-medium">Pass Rate</th>
              <th className="text-right px-5 py-3 font-medium">Error Rate</th>
              <th className="text-right px-5 py-3 font-medium">Latency</th>
              <th className="text-right px-5 py-3 font-medium">Cost</th>
              <th className="text-right px-5 py-3 font-medium">Traces</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoadingAgents ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center">
                  <p className="text-sm text-content-muted animate-pulse">
                    Loading agents...
                  </p>
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center">
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
                          STATUS_DOTS[agent.status] ?? 'text-content-muted'
                        }
                      >
                        ●
                      </span>
                      <span className="capitalize font-medium">
                        {agent.status}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-right font-medium">
                    {agent.passRate !== null ? (
                      <span
                        className={
                          agent.passRate >= 0.9
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : agent.passRate >= 0.7
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {(agent.passRate * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-content-muted">--</span>
                    )}
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
                  <td className="px-5 py-3 text-sm text-right font-medium">
                    <span
                      className={
                        agent.latencyP50 < 500
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : agent.latencyP50 < 2000
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {formatDuration(agent.latencyP50)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-content-secondary text-right">
                    ${agent.costPerCall.toFixed(2)}
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
          {isLoadingRunning ? (
            <div className="space-y-3">
              {['a', 'b', 'c'].map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-3 animate-pulse"
                >
                  <div className="w-4 h-4 bg-surface-card rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 bg-surface-card rounded w-3/4" />
                    <div className="h-1.5 bg-surface-card rounded-full w-full" />
                  </div>
                  <div className="w-16 h-3 bg-surface-card rounded flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : runningItems.length === 0 ? (
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
          ) : (
            <div className="space-y-3">
              {runningItems.map((item) => {
                const cfg = RUNNING_TYPE_ICON[item.type]
                const TypeIcon = cfg.icon
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-3 hover:bg-surface-overlay transition-colors"
                  >
                    <TypeIcon className="w-4 h-4 text-accent-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content-primary truncate">
                        {item.name}
                      </p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-surface-card overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-content-muted flex-shrink-0">
                      {item.detail}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 6. Recent Activity (merged from eval runs, deploys, etc.) */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-content-primary mb-4">
          Recent Activity
        </h2>
        {isLoadingActivity ? (
          <div className="space-y-2">
            {['a', 'b', 'c', 'd'].map((id) => (
              <div
                key={id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 animate-pulse"
              >
                <div className="w-4 h-4 bg-surface-card rounded-full" />
                <div className="flex-1 h-4 bg-surface-card rounded" />
                <div className="w-20 h-3 bg-surface-card rounded" />
              </div>
            ))}
          </div>
        ) : !activityData?.events?.length ? (
          <p className="text-sm text-content-muted py-6 text-center">
            No recent activity. Events will appear here when eval runs complete,
            prompts are deployed, or alerts fire.
          </p>
        ) : (
          <div className="space-y-2">
            {activityData.events.map((event) => {
              const cfg = ACTIVITY_ICON[event.type]
              const Icon = cfg.icon
              return (
                <Link
                  key={event.id}
                  href={event.href}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 hover:bg-surface-overlay transition-colors"
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                  <p className="text-sm text-content-secondary flex-1 min-w-0 truncate">
                    {event.description}
                  </p>
                  <span className="text-xs text-content-muted flex-shrink-0">
                    {safeFormatDistance(event.timestamp)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-border">
          <Link
            href="/traces"
            className="text-sm font-medium text-primary-500 hover:text-accent-500 transition-colors"
          >
            View all activity →
          </Link>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// KPI Card Component
// =============================================================================

function KpiSparkline({
  data,
  tone,
  invert = false,
}: {
  data: Array<{ v: number }>
  tone: 'positive' | 'negative' | 'neutral'
  invert?: boolean
}) {
  if (data.length < 2) return null

  // Determine trend direction from first to last value
  const first = data[0].v
  const last = data[data.length - 1].v
  const isUp = last > first
  const isFlat = Math.abs(last - first) < 0.01

  // Choose color: for inverted metrics (like failed runs), "up" is bad
  let color: string
  if (isFlat) {
    color = '#94a3b8' // slate-400
  } else if (invert) {
    color = isUp ? '#f43f5e' : '#10b981' // rose-500 / emerald-500
  } else {
    color = isUp ? '#10b981' : '#f43f5e' // emerald-500 / rose-500
  }

  // Override with tone if explicit
  if (tone === 'positive') color = '#10b981'
  if (tone === 'negative') color = '#f43f5e'

  return (
    <div className="w-[72px] h-[28px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  tone = 'neutral',
  sparklineData,
  sparklineInvert = false,
}: {
  label: string
  value: string
  subtitle: string
  icon: React.ReactNode
  tone?: 'positive' | 'negative' | 'neutral'
  sparklineData?: Array<{ v: number }>
  sparklineInvert?: boolean
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
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold text-content-primary">{value}</p>
          <p className={`text-xs mt-1 ${subtitleTone}`}>{subtitle}</p>
        </div>
        {sparklineData && sparklineData.length >= 2 && (
          <KpiSparkline
            data={sparklineData}
            tone={tone}
            invert={sparklineInvert}
          />
        )}
      </div>
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
