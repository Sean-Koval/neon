'use client'

import { CONFIG } from '@/lib/config'
import { safeFormatDistance } from '@/lib/format-date'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { memo, useMemo } from 'react'
import { RegressionBanner } from '@/components/alerts/regression-banner'
import { CostAnalyticsCards } from '@/components/dashboard/cost-analytics'
import {
  type DashboardFilters,
  DashboardFiltersBar,
} from '@/components/dashboard/filters'
import {
  LazyDashboardStatCards,
  LazyScoreTrends,
  LazyToolMetricsCard,
} from '@/components/dashboard/lazy-components'
import { useAlerts } from '@/hooks/use-alerts'
import { useDashboard } from '@/hooks/use-dashboard'
import type { EvalRun, EvalRunStatus } from '@/lib/types'

export default function Dashboard() {
  const {
    filters,
    setFilters,
    recentRuns,
    suites,
    stats,
    isLoadingRuns,
    isLoadingSuites,
    isLoadingStats,
    runsError,
    page,
    hasNextPage,
    hasPrevPage,
    loadNextPage,
    loadPrevPage,
    refresh,
  } = useDashboard()

  const { data: alertsData } = useAlerts()
  const regressionAlerts = alertsData?.alerts ?? []

  // Build a set of suite IDs with active regressions for warning indicators
  const regressedSuiteIds = useMemo(() => {
    const ids = new Set<string>()
    for (const alert of regressionAlerts) {
      ids.add(alert.suiteId)
    }
    return ids
  }, [regressionAlerts])

  return (
    <div className="space-y-8">
      {/* Regression Banner */}
      <RegressionBanner alerts={regressionAlerts} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Overview of your agent evaluations</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="btn btn-secondary inline-flex items-center gap-2"
          title="Refresh dashboard"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <DashboardFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        suites={suites}
        isLoadingSuites={isLoadingSuites}
      />

      {/* Stats - Lazy loaded for code splitting */}
      <LazyDashboardStatCards />

      {/* Cost & Token Analytics */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Cost & Usage</h2>
        <CostAnalyticsCards stats={stats} isLoading={isLoadingStats} />
      </div>

      {/* Score Trends - Full Width, lazy loaded with recharts */}
      <LazyScoreTrends
        defaultTimeRange={
          filters.dateRange === '7d'
            ? '7d'
            : filters.dateRange === '30d'
              ? '30d'
              : '90d'
        }
        showSuiteFilter={true}
        threshold={CONFIG.DASHBOARD_SCORE_THRESHOLD}
      />

      {/* Tool Metrics */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Tool Execution</h2>
        <LazyToolMetricsCard
          days={
            filters.dateRange === '7d'
              ? 7
              : filters.dateRange === '30d'
                ? 30
                : 90
          }
        />
      </div>

      {/* Recent Runs */}
      <RecentRunsCard
        runs={recentRuns}
        isLoading={isLoadingRuns}
        error={runsError}
        filters={filters}
        page={page}
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
        onNextPage={loadNextPage}
        onPrevPage={loadPrevPage}
        regressedSuiteIds={regressedSuiteIds}
      />
    </div>
  )
}

interface RecentRunsCardProps {
  runs: EvalRun[]
  isLoading: boolean
  error: Error | null
  filters: DashboardFilters
  page: number
  hasNextPage: boolean
  hasPrevPage: boolean
  onNextPage: () => void
  onPrevPage: () => void
}

function RecentRunsCard({
  runs,
  isLoading,
  error,
  filters,
  page,
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
}: RecentRunsCardProps) {
  const hasFilters =
    filters.status !== 'all' ||
    filters.suiteId !== 'all' ||
    filters.dateRange !== '7d'

  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent Runs</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {hasFilters ? 'Filtered results' : 'Latest evaluation runs'}
            </p>
          </div>
          {runs.length > 0 && (
            <span className="text-sm text-gray-500">
              {runs.length} run{runs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <RecentRunsSkeleton />
      ) : error ? (
        <RecentRunsError error={error} />
      ) : runs.length > 0 ? (
        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <RecentRunsEmpty hasFilters={hasFilters} />
      )}

      <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          {(hasPrevPage || hasNextPage) && (
            <>
              <button
                type="button"
                onClick={onPrevPage}
                disabled={!hasPrevPage || isLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <span className="text-sm text-gray-500">Page {page + 1}</span>
              <button
                type="button"
                onClick={onNextPage}
                disabled={!hasNextPage || isLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        <Link
          href="/eval-runs"
          className="text-primary-600 hover:text-accent-600 text-sm font-medium transition-colors"
        >
          View all runs
        </Link>
      </div>
    </div>
  )
}

function RecentRunsSkeleton() {
  return (
    <div className="divide-y divide-gray-200">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-24 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="h-6 w-20 bg-gray-200 rounded-full" />
              <div className="text-right hidden sm:block">
                <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-16 bg-gray-200 rounded" />
              </div>
              <div className="h-3 w-16 bg-gray-200 rounded hidden lg:block" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentRunsError({ error }: { error: Error }) {
  return (
    <div className="p-6 text-center">
      <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">Failed to load recent runs</p>
      <p className="text-xs text-gray-400 mt-1">{error.message}</p>
    </div>
  )
}

interface RecentRunsEmptyProps {
  hasFilters: boolean
}

function RecentRunsEmpty({ hasFilters }: RecentRunsEmptyProps) {
  if (hasFilters) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
          <FileText className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">
          No matching runs
        </h3>
        <p className="text-sm text-gray-500">
          Try adjusting your filters to see more results.
        </p>
      </div>
    )
  }

  return (
    <div className="p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center">
        <FileText className="w-8 h-8 text-primary-500" />
      </div>
      <h3 className="text-sm font-medium text-gray-900 mb-1">No runs yet</h3>
      <p className="text-sm text-gray-500 mb-4">
        Start by creating an evaluation suite and running your first evaluation.
      </p>
      <Link
        href="/eval-runs"
        className="btn btn-primary inline-flex items-center"
      >
        View eval runs
      </Link>
    </div>
  )
}

interface RunRowProps {
  run: EvalRun
}

const RunRow = memo(function RunRow({ run }: RunRowProps) {
  const { passedCount, totalCount, score, passedColor } = useMemo(() => {
    const passed = run.summary?.passed ?? 0
    const total = run.summary?.total_cases ?? 0
    const avgScore = run.summary?.avg_score
    const color =
      passed === total
        ? 'text-green-600'
        : passed > 0
          ? 'text-yellow-600'
          : 'text-red-600'
    return {
      passedCount: passed,
      totalCount: total,
      score: avgScore,
      passedColor: color,
    }
  }, [run.summary])

  const timeAgo = useMemo(
    () => safeFormatDistance(run.created_at),
    [run.created_at],
  )

  return (
    <Link
      href={`/eval-runs/${run.id}`}
      className="block p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.location.href = `/eval-runs`
                }}
                className="font-medium text-gray-900 hover:text-primary-600 truncate cursor-pointer text-left"
              >
                {run.suite_name}
              </button>
            </div>
            <p className="text-sm text-gray-500 truncate">
              {run.agent_version ? `${run.agent_version}` : 'No version'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-6 ml-4 flex-shrink-0">
          <StatusBadge status={run.status} />
          <div className="text-right hidden sm:block">
            {run.summary ? (
              <>
                <p className="font-medium text-gray-900">
                  <span className={passedColor}>{passedCount}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-600">{totalCount}</span>
                </p>
                <p className="text-sm text-gray-500">
                  <ScoreValue score={score ?? 0} />
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">--</p>
            )}
          </div>
          <span className="text-sm text-gray-500 w-24 text-right hidden lg:block">
            {timeAgo}
          </span>
        </div>
      </div>
    </Link>
  )
})

const STATUS_CONFIG: Record<
  EvalRunStatus,
  { icon: typeof CheckCircle; color: string; bg: string; border: string }
> = {
  completed: {
    icon: CheckCircle,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  running: {
    icon: Clock,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  failed: {
    icon: XCircle,
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
  pending: {
    icon: Clock,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
  cancelled: {
    icon: AlertCircle,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
}

const StatusBadge = memo(function StatusBadge({
  status,
}: {
  status: EvalRunStatus
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
    >
      <Icon className="w-3 h-3" />
      <span className="capitalize">{status}</span>
    </span>
  )
})

const ScoreValue = memo(function ScoreValue({ score }: { score: number }) {
  const color =
    score >= 0.8
      ? 'text-emerald-600'
      : score >= 0.6
        ? 'text-amber-600'
        : 'text-rose-600'

  return <span className={`font-medium ${color}`}>{score.toFixed(2)}</span>
})
