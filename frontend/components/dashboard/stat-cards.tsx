'use client'

import {
  Activity,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { type DashboardStats, useDashboardStats } from '@/hooks/use-runs'

interface StatCardProps {
  title: string
  value: string
  icon: React.ReactNode
  subtitle: string
  trend?: 'up' | 'down' | 'neutral'
}

function StatCard({ title, value, icon, subtitle, trend }: StatCardProps) {
  const trendColors = {
    up: 'text-emerald-600',
    down: 'text-rose-600',
    neutral: 'text-gray-500',
  }

  return (
    <div className="stat-card group">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className="p-2 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 group-hover:from-primary-50 group-hover:to-accent-50 transition-colors">
          {icon}
        </div>
      </div>
      <div className="mt-3">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
      </div>
      <div className="mt-2">
        <span
          className={`text-sm ${trend ? trendColors[trend] : 'text-gray-500'}`}
        >
          {subtitle}
        </span>
      </div>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-20 bg-gray-200 rounded" />
        <div className="h-9 w-9 bg-gray-200 rounded-lg" />
      </div>
      <div className="mt-3">
        <div className="h-9 w-16 bg-gray-200 rounded" />
      </div>
      <div className="mt-2">
        <div className="h-4 w-24 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

function StatCardsLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>
  )
}

interface StatCardsErrorProps {
  error: Error
  onRetry: () => void
}

function StatCardsError({ error, onRetry }: StatCardsErrorProps) {
  return (
    <div className="card p-6 bg-red-50 border-red-200">
      <div className="flex items-center space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">
            Failed to load stats
          </h3>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Retry
        </button>
      </div>
    </div>
  )
}

interface StatCardsContentProps {
  stats: DashboardStats
}

function StatCardsContent({ stats }: StatCardsContentProps) {
  const formatScore = (score: number) => {
    return score.toFixed(2)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        title="Total Runs"
        value={stats.totalRuns.toLocaleString()}
        icon={<Activity className="w-5 h-5 text-primary-500" />}
        subtitle={`${stats.totalRuns} evaluation${stats.totalRuns !== 1 ? 's' : ''} total`}
        trend="neutral"
      />
      <StatCard
        title="Passed"
        value={stats.passedRuns.toLocaleString()}
        icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
        subtitle={`${stats.passedPercentage}% pass rate`}
        trend={
          stats.passedPercentage >= 80
            ? 'up'
            : stats.passedPercentage >= 50
              ? 'neutral'
              : 'down'
        }
      />
      <StatCard
        title="Failed"
        value={stats.failedRuns.toLocaleString()}
        icon={<XCircle className="w-5 h-5 text-rose-500" />}
        subtitle={`${stats.failedPercentage}% failure rate`}
        trend={
          stats.failedPercentage <= 10
            ? 'up'
            : stats.failedPercentage <= 30
              ? 'neutral'
              : 'down'
        }
      />
      <StatCard
        title="Avg Score"
        value={formatScore(stats.averageScore)}
        icon={<TrendingUp className="w-5 h-5 text-accent-500" />}
        subtitle={
          stats.averageScore >= 0.8
            ? 'Excellent performance'
            : stats.averageScore >= 0.6
              ? 'Good performance'
              : 'Needs improvement'
        }
        trend={
          stats.averageScore >= 0.8
            ? 'up'
            : stats.averageScore >= 0.6
              ? 'neutral'
              : 'down'
        }
      />
    </div>
  )
}

function StatCardsEmpty() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        title="Total Runs"
        value="0"
        icon={<Activity className="w-5 h-5 text-primary-500" />}
        subtitle="No runs yet"
        trend="neutral"
      />
      <StatCard
        title="Passed"
        value="0"
        icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
        subtitle="0% pass rate"
        trend="neutral"
      />
      <StatCard
        title="Failed"
        value="0"
        icon={<XCircle className="w-5 h-5 text-rose-500" />}
        subtitle="0% failure rate"
        trend="neutral"
      />
      <StatCard
        title="Avg Score"
        value="--"
        icon={<TrendingUp className="w-5 h-5 text-accent-500" />}
        subtitle="No data available"
        trend="neutral"
      />
    </div>
  )
}

/**
 * Dashboard stat cards component
 * Fetches data from the API and displays aggregate statistics
 */
export function DashboardStatCards() {
  const { stats, isLoading, error, refetch } = useDashboardStats()

  if (isLoading) {
    return <StatCardsLoading />
  }

  if (error) {
    return <StatCardsError error={error as Error} onRetry={() => refetch()} />
  }

  if (!stats || stats.totalRuns === 0) {
    return <StatCardsEmpty />
  }

  return <StatCardsContent stats={stats} />
}

// Export individual components for flexibility
export {
  StatCard,
  StatCardSkeleton,
  StatCardsLoading,
  StatCardsError,
  StatCardsEmpty,
}
