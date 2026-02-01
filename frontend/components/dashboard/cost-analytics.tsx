'use client'

import { Coins, Gauge, Hash, Zap } from 'lucide-react'
import type { DashboardStats } from '@/hooks/use-runs'

interface CostStatCardProps {
  title: string
  value: string
  icon: React.ReactNode
  subtitle: string
  trend?: 'up' | 'down' | 'neutral'
}

function CostStatCard({
  title,
  value,
  icon,
  subtitle,
  trend,
}: CostStatCardProps) {
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

function CostCardSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-20 bg-gray-200 rounded" />
        <div className="h-9 w-9 bg-gray-200 rounded-lg" />
      </div>
      <div className="mt-3">
        <div className="h-9 w-24 bg-gray-200 rounded" />
      </div>
      <div className="mt-2">
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

interface CostAnalyticsCardsProps {
  stats: DashboardStats | null
  isLoading?: boolean
}

/**
 * Format cost value in USD with appropriate precision
 */
function formatCost(cost: number): string {
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(3)}`
  }
  if (cost > 0) {
    return `$${cost.toFixed(4)}`
  }
  return '$0.00'
}

/**
 * Format token count with K/M suffixes
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toLocaleString()
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
  }
  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(1)}s`
  }
  return `${Math.round(ms)}ms`
}

/**
 * Cost and token analytics cards for the dashboard
 */
export function CostAnalyticsCards({
  stats,
  isLoading,
}: CostAnalyticsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <CostCardSkeleton />
        <CostCardSkeleton />
        <CostCardSkeleton />
        <CostCardSkeleton />
      </div>
    )
  }

  const totalCost = stats?.totalCost ?? 0
  const totalTokens = stats?.totalTokens ?? 0
  const avgDuration = stats?.avgDurationMs ?? 0
  const totalRuns = stats?.totalRuns ?? 0

  // Calculate cost per run and tokens per run
  const costPerRun = totalRuns > 0 ? totalCost / totalRuns : 0
  const tokensPerRun = totalRuns > 0 ? Math.round(totalTokens / totalRuns) : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <CostStatCard
        title="Total Cost"
        value={formatCost(totalCost)}
        icon={<Coins className="w-5 h-5 text-amber-500" />}
        subtitle={`${formatCost(costPerRun)} avg per run`}
        trend="neutral"
      />
      <CostStatCard
        title="Total Tokens"
        value={formatTokens(totalTokens)}
        icon={<Hash className="w-5 h-5 text-blue-500" />}
        subtitle={`${formatTokens(tokensPerRun)} avg per run`}
        trend="neutral"
      />
      <CostStatCard
        title="Avg Duration"
        value={formatDuration(avgDuration)}
        icon={<Gauge className="w-5 h-5 text-purple-500" />}
        subtitle={
          avgDuration < 5000
            ? 'Fast execution'
            : avgDuration < 30000
              ? 'Normal speed'
              : 'Slow execution'
        }
        trend={
          avgDuration < 5000 ? 'up' : avgDuration < 30000 ? 'neutral' : 'down'
        }
      />
      <CostStatCard
        title="Efficiency"
        value={
          totalCost > 0 && totalRuns > 0
            ? `${((totalRuns / totalCost) * 0.01).toFixed(1)}`
            : '--'
        }
        icon={<Zap className="w-5 h-5 text-green-500" />}
        subtitle="runs per $0.01"
        trend="neutral"
      />
    </div>
  )
}

// Export sub-components for flexibility
export {
  CostStatCard,
  CostCardSkeleton,
  formatCost,
  formatTokens,
  formatDuration,
}
