'use client'

/**
 * Component Health Dashboard
 *
 * Displays health metrics and status for all components in the system.
 */

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Gauge,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import type {
  ComponentHealth,
  ComponentMetrics,
} from '@/hooks/use-component-correlation'

// =============================================================================
// Types
// =============================================================================

export interface ComponentHealthDashboardProps {
  /** Component metrics */
  components: ComponentMetrics[]
  /** Overall health summary */
  health: ComponentHealth
  /** Called when a component is clicked */
  onComponentClick?: (component: ComponentMetrics) => void
  /** Custom className */
  className?: string
}

// =============================================================================
// Utility Functions
// =============================================================================

function getHealthIcon(status: 'healthy' | 'warning' | 'critical') {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-amber-500" />
    case 'critical':
      return <XCircle className="w-5 h-5 text-rose-500" />
  }
}

function getTrendIcon(trend: 'up' | 'down' | 'stable') {
  switch (trend) {
    case 'up':
      return <TrendingUp className="w-4 h-4 text-emerald-500" />
    case 'down':
      return <TrendingDown className="w-4 h-4 text-rose-500" />
    case 'stable':
      return <ArrowRight className="w-4 h-4 text-gray-400" />
  }
}

function getHealthColor(status: 'healthy' | 'warning' | 'critical') {
  switch (status) {
    case 'healthy':
      return 'bg-emerald-50 border-emerald-200'
    case 'warning':
      return 'bg-amber-50 border-amber-200'
    case 'critical':
      return 'bg-rose-50 border-rose-200'
  }
}

function getScoreColor(score: number) {
  if (score >= 0.8) return 'text-emerald-600'
  if (score >= 0.6) return 'text-amber-600'
  return 'text-rose-600'
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

// =============================================================================
// Summary Cards
// =============================================================================

interface SummaryCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color: string
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: SummaryCardProps) {
  return (
    <div className={`bg-white border rounded-lg p-4 ${color}`}>
      <div className="flex items-center gap-2 text-gray-500 mb-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && <div className="text-sm text-gray-500 mt-1">{subtitle}</div>}
    </div>
  )
}

// =============================================================================
// Component Card
// =============================================================================

interface ComponentCardProps {
  component: ComponentMetrics
  onClick?: () => void
}

function ComponentCard({ component, onClick }: ComponentCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left p-4 rounded-lg border transition-all
        hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500
        ${getHealthColor(component.healthStatus)}
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {getHealthIcon(component.healthStatus)}
          <span className="font-medium text-gray-900">{component.name}</span>
        </div>
        <span className="text-xs px-2 py-0.5 bg-white/50 rounded-full text-gray-600 capitalize">
          {component.type}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <span className="text-xs text-gray-500">Score</span>
          <div
            className={`text-lg font-semibold ${getScoreColor(component.avgScore)}`}
          >
            {(component.avgScore * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-500">Pass Rate</span>
          <div
            className={`text-lg font-semibold ${getScoreColor(component.passRate)}`}
          >
            {(component.passRate * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/50">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Gauge className="w-3 h-3" />
          <span>{component.evalCount} evals</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{formatLatency(component.avgLatency)}</span>
        </div>
        <div className="flex items-center gap-1">
          {getTrendIcon(component.trend)}
          <span className="text-xs text-gray-500 capitalize">
            {component.trend}
          </span>
        </div>
      </div>
    </button>
  )
}

// =============================================================================
// Issue List
// =============================================================================

interface IssueListProps {
  issues: ComponentHealth['issues']
}

function IssueList({ issues }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 bg-emerald-50 rounded-lg text-emerald-700">
        <CheckCircle2 className="w-5 h-5" />
        <span>All components are operating within healthy parameters</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {issues.map((issue, idx) => (
        <div
          key={`${issue.component}-${idx}`}
          className={`
            flex items-start gap-3 p-3 rounded-lg
            ${issue.severity === 'critical' ? 'bg-rose-50' : 'bg-amber-50'}
          `}
        >
          {issue.severity === 'critical' ? (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">{issue.component}</p>
            <p className="text-sm text-gray-600">{issue.issue}</p>
            <p className="text-xs text-gray-500 mt-1">
              {issue.metric}:{' '}
              {typeof issue.value === 'number'
                ? `${(issue.value * 100).toFixed(1)}%`
                : issue.value}{' '}
              (threshold: {(issue.threshold * 100).toFixed(0)}%)
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ComponentHealthDashboard({
  components,
  health,
  onComponentClick,
  className = '',
}: ComponentHealthDashboardProps) {
  const suites = components.filter((c) => c.type === 'suite')
  const scorers = components.filter((c) => c.type === 'scorer')

  return (
    <div className={className}>
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Overall Health"
          value={`${health.overallScore}%`}
          subtitle={
            health.overallScore >= 80
              ? 'System healthy'
              : health.overallScore >= 60
                ? 'Needs attention'
                : 'Critical issues'
          }
          icon={<Gauge className="w-4 h-4" />}
          color={
            health.overallScore >= 80
              ? 'border-emerald-200'
              : health.overallScore >= 60
                ? 'border-amber-200'
                : 'border-rose-200'
          }
        />
        <SummaryCard
          title="Healthy"
          value={health.healthyCount}
          subtitle="Components"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          color="border-emerald-200"
        />
        <SummaryCard
          title="Warning"
          value={health.warningCount}
          subtitle="Components"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
          color="border-amber-200"
        />
        <SummaryCard
          title="Critical"
          value={health.criticalCount}
          subtitle="Components"
          icon={<XCircle className="w-4 h-4 text-rose-500" />}
          color="border-rose-200"
        />
      </div>

      {/* Issues Section */}
      {health.issues.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Active Issues ({health.issues.length})
          </h3>
          <IssueList issues={health.issues} />
        </div>
      )}

      {/* Suggestions */}
      {health.suggestions.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Recommendations
          </h3>
          <ul className="space-y-1">
            {health.suggestions.map((suggestion, idx) => (
              <li
                key={idx}
                className="text-sm text-blue-800 flex items-start gap-2"
              >
                <ArrowRight className="w-3 h-3 mt-1 shrink-0" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Component Grids */}
      <div className="space-y-6">
        {/* Suites */}
        {suites.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Test Suites ({suites.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suites.map((component) => (
                <ComponentCard
                  key={component.id}
                  component={component}
                  onClick={() => onComponentClick?.(component)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Scorers */}
        {scorers.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Scorers ({scorers.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scorers.map((component) => (
                <ComponentCard
                  key={component.id}
                  component={component}
                  onClick={() => onComponentClick?.(component)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Loading Skeleton
// =============================================================================

export function ComponentHealthSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-lg p-4 h-24" />
        ))}
      </div>

      {/* Component cards skeleton */}
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-lg p-4 h-36" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default ComponentHealthDashboard
