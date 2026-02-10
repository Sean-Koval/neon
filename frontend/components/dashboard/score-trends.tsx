'use client'

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Download,
  ExternalLink,
  Layers,
  Minus,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useState } from 'react'

import {
  ChartEmptyState,
  ChartSkeleton,
  LazyTrendChart,
} from '@/components/charts/lazy-charts'
import {
  downloadData,
  exportToCSV,
  exportToJSON,
  type RegressionPoint,
  type ScoreBySuite,
  type ScoreStatistics,
  type ScoreTrendDataPoint,
  type TimeRange,
  useScoreTrends,
} from '@/hooks/use-scores'
import { CONFIG } from '@/lib/config'

// =============================================================================
// Types
// =============================================================================

export interface ScoreTrendsProps {
  /** Default time range */
  defaultTimeRange?: TimeRange
  /** Show suite selector */
  showSuiteFilter?: boolean
  /** Threshold for the chart */
  threshold?: number
  /** Compact mode for smaller displays */
  compact?: boolean
  /** Custom class name */
  className?: string
}

// =============================================================================
// Time Range Selector
// =============================================================================

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const options: { value: TimeRange; label: string }[] = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
  ]

  return (
    <div className="flex gap-1 bg-surface-raised p-1 rounded-lg border border-border">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200
            ${
              value === opt.value
                ? 'bg-surface-card text-content-primary shadow-sm border border-border'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface-overlay'
            }
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// =============================================================================
// Statistics Panel
// =============================================================================

interface StatisticsPanelProps {
  stats: ScoreStatistics | null
  isLoading: boolean
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'stable' }) {
  if (direction === 'up') {
    return <ArrowUp className="w-4 h-4 text-emerald-500" />
  }
  if (direction === 'down') {
    return <ArrowDown className="w-4 h-4 text-rose-500" />
  }
  return <Minus className="w-4 h-4 text-content-muted" />
}

function StatisticsPanel({ stats, isLoading }: StatisticsPanelProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['mean', 'stddev', 'trend', 'count'].map((key) => (
          <div
            key={key}
            className="bg-surface-raised rounded-lg p-3 animate-pulse border border-border/70"
          >
            <div className="h-3 w-12 bg-gray-200 dark:bg-dark-700 rounded mb-2" />
            <div className="h-6 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const items = [
    {
      label: 'Mean Score',
      value: stats.mean.toFixed(3),
      subValue: `CV: ${(stats.cv * 100).toFixed(1)}%`,
      color:
        stats.mean >= 0.8
          ? 'text-emerald-600 dark:text-emerald-400'
          : stats.mean >= 0.6
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Std Deviation',
      value: stats.stdDev.toFixed(3),
      subValue: `Range: ${(stats.max - stats.min).toFixed(2)}`,
      color:
        stats.stdDev < 0.1
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Trend',
      value:
        stats.trendDirection === 'up'
          ? 'Improving'
          : stats.trendDirection === 'down'
            ? 'Declining'
            : 'Stable',
      icon: <TrendIcon direction={stats.trendDirection} />,
      color:
        stats.trendDirection === 'up'
          ? 'text-emerald-600 dark:text-emerald-400'
          : stats.trendDirection === 'down'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-content-secondary',
    },
    {
      label: 'Data Points',
      value: stats.count.toString(),
      subValue: `Min: ${stats.min.toFixed(2)} / Max: ${stats.max.toFixed(2)}`,
      color: 'text-content-secondary',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-surface-raised rounded-lg p-3 border border-border/70"
        >
          <p className="text-xs font-medium text-content-muted mb-1">
            {item.label}
          </p>
          <div className="flex items-center gap-1.5">
            {item.icon}
            <span className={`text-lg font-semibold ${item.color}`}>
              {item.value}
            </span>
          </div>
          {item.subValue && (
            <p className="text-xs text-content-muted mt-0.5">{item.subValue}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// Regressions Alert
// =============================================================================

interface RegressionsAlertProps {
  regressions: RegressionPoint[]
  onDismiss: () => void
}

function RegressionsAlert({ regressions, onDismiss }: RegressionsAlertProps) {
  if (regressions.length === 0) return null

  return (
    <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-rose-100 dark:bg-rose-500/20 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-rose-800 dark:text-rose-300">
              {regressions.length} Regression{regressions.length > 1 ? 's' : ''}{' '}
              Detected
            </h4>
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded transition-colors"
            >
              <X className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {regressions.slice(0, 3).map((reg) => (
              <div
                key={reg.date}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-rose-700 dark:text-rose-400">
                  {reg.date}
                </span>
                <span className="font-medium text-rose-800 dark:text-rose-300">
                  {reg.previousScore.toFixed(2)}{' '}
                  <ArrowRight className="w-3 h-3 inline" />{' '}
                  {reg.score.toFixed(2)}
                  <span className="ml-1 text-rose-600 dark:text-rose-400">
                    (-{reg.percentageDrop.toFixed(1)}%)
                  </span>
                </span>
              </div>
            ))}
            {regressions.length > 3 && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                +{regressions.length - 3} more regressions
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Suite Breakdown
// =============================================================================

interface SuiteBreakdownProps {
  suites: ScoreBySuite[]
  onSuiteSelect: (suiteId: string | undefined) => void
  selectedSuite?: string
}

function SuiteBreakdown({
  suites,
  onSuiteSelect,
  selectedSuite,
}: SuiteBreakdownProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (suites.length === 0) return null

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 transition-colors"
      >
        <Layers className="w-4 h-4" />
        By Suite ({suites.length})
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 animate-in slide-in-from-top-2">
          <button
            type="button"
            onClick={() => onSuiteSelect(undefined)}
            className={`
              text-left p-3 rounded-lg border transition-all
              ${
                !selectedSuite
                  ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-300'
                  : 'bg-gray-50 dark:bg-dark-900 border-gray-200 dark:border-dark-700 hover:border-gray-300 dark:hover:border-dark-600'
              }
            `}
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              All Suites
            </span>
          </button>

          {suites.map((suite) => (
            <button
              type="button"
              key={suite.suiteId}
              onClick={() => onSuiteSelect(suite.suiteId)}
              className={`
                text-left p-3 rounded-lg border transition-all
                ${
                  selectedSuite === suite.suiteId
                    ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-300'
                    : 'bg-gray-50 dark:bg-dark-900 border-gray-200 dark:border-dark-700 hover:border-gray-300 dark:hover:border-dark-600'
                }
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                  {suite.suiteName}
                </span>
                <TrendIcon direction={suite.trendDirection} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span
                  className={`text-lg font-semibold ${
                    suite.avgScore >= 0.8
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : suite.avgScore >= 0.6
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {suite.avgScore.toFixed(2)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {suite.runCount} runs
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Export Menu
// =============================================================================

interface ExportMenuProps {
  data: ScoreTrendDataPoint[]
  statistics: ScoreStatistics | null
  regressions: RegressionPoint[]
}

function ExportMenu({ data, statistics, regressions }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleExportCSV = useCallback(() => {
    const csv = exportToCSV(data, statistics)
    const date = new Date().toISOString().split('T')[0]
    downloadData(csv, `score-trends-${date}.csv`, 'text/csv')
    setIsOpen(false)
  }, [data, statistics])

  const handleExportJSON = useCallback(() => {
    const json = exportToJSON(data, statistics, regressions)
    const date = new Date().toISOString().split('T')[0]
    downloadData(json, `score-trends-${date}.json`, 'application/json')
    setIsOpen(false)
  }, [data, statistics, regressions])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-overlay rounded-lg transition-colors"
      >
        <Download className="w-4 h-4" />
        Export
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default bg-transparent border-none"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsOpen(false)
            }}
          />
          <div className="absolute right-0 top-full mt-1 w-40 bg-surface-card border border-border rounded-lg shadow-lg py-1 z-20">
            <button
              type="button"
              onClick={handleExportCSV}
              className="w-full text-left px-4 py-2 text-sm text-content-secondary hover:bg-surface-overlay transition-colors"
            >
              Export as CSV
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="w-full text-left px-4 py-2 text-sm text-content-secondary hover:bg-surface-overlay transition-colors"
            >
              Export as JSON
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// =============================================================================
// Drill-down Modal
// =============================================================================

interface DrillDownModalProps {
  point: ScoreTrendDataPoint
  onClose: () => void
}

function DrillDownModal({ point, onClose }: DrillDownModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default border-none"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <div className="relative bg-surface-card rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-content-primary">
              {point.displayDate}
            </h3>
            <p className="text-sm text-content-muted">
              {point.runCount} run{point.runCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-surface-overlay rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-content-muted" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Score Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-raised rounded-lg p-3 text-center border border-border/70">
              <p className="text-xs text-content-muted mb-1">Average</p>
              <p
                className={`text-xl font-bold ${
                  point.avgScore >= 0.8
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : point.avgScore >= 0.6
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {point.avgScore.toFixed(3)}
              </p>
            </div>
            <div className="bg-surface-raised rounded-lg p-3 text-center border border-border/70">
              <p className="text-xs text-content-muted mb-1">Min</p>
              <p className="text-xl font-bold text-content-secondary">
                {point.minScore.toFixed(3)}
              </p>
            </div>
            <div className="bg-surface-raised rounded-lg p-3 text-center border border-border/70">
              <p className="text-xs text-content-muted mb-1">Max</p>
              <p className="text-xl font-bold text-content-secondary">
                {point.maxScore.toFixed(3)}
              </p>
            </div>
          </div>

          {point.isRegression && (
            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span className="text-sm font-medium text-rose-700 dark:text-rose-400">
                  Regression detected ({(point.delta * 100).toFixed(1)}% drop)
                </span>
              </div>
            </div>
          )}

          {/* Run Links */}
          <div>
            <h4 className="text-sm font-medium text-content-secondary mb-2">
              Individual Runs
            </h4>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {point.runIds.map((runId) => (
                <Link
                  key={runId}
                  href={`/eval-runs/${runId}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-overlay transition-colors group"
                >
                  <span className="text-sm text-content-secondary font-mono truncate">
                    {runId.slice(0, 8)}...
                  </span>
                  <ExternalLink className="w-4 h-4 text-content-muted group-hover:text-primary-500 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-surface-raised rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="w-full btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ScoreTrends({
  defaultTimeRange = '30d',
  showSuiteFilter = true,
  threshold = CONFIG.DASHBOARD_SCORE_THRESHOLD,
  compact = false,
  className = '',
}: ScoreTrendsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange)
  const [selectedSuite, setSelectedSuite] = useState<string | undefined>()
  const [showRegressions, setShowRegressions] = useState(true)
  const [drillDownPoint, setDrillDownPoint] =
    useState<ScoreTrendDataPoint | null>(null)

  const {
    data,
    regressions,
    statistics,
    bySuite,
    isLoading,
    isError,
    error,
    refetch,
  } = useScoreTrends({
    timeRange,
    suiteId: selectedSuite,
    regressionThreshold: 0.05,
    includeStats: !compact,
  })

  const handlePointClick = useCallback((point: ScoreTrendDataPoint) => {
    setDrillDownPoint(point)
  }, [])

  if (isError) {
    return (
      <div className={`card ${className}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-content-primary">
              Score Trends
            </h2>
          </div>
          <div className="h-[300px] bg-rose-50 dark:bg-rose-500/10 rounded-lg flex flex-col items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-rose-400 mb-3" />
            <p className="font-medium text-rose-600 dark:text-rose-400">
              Failed to load data
            </p>
            <p className="text-sm text-rose-500 mt-1">
              {error?.message ?? 'Unknown error'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 btn btn-secondary"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`card overflow-hidden relative ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400/70 via-accent-400/60 to-primary-400/70" />
      {/* Header */}
      <div className="p-6 border-b border-border bg-gradient-to-r from-surface-raised to-surface-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg border border-border bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-900/30 dark:to-accent-900/30">
              <TrendingUp className="w-5 h-5 text-primary-500 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-content-primary">
                Score Trends
              </h2>
              <p className="text-sm text-content-muted">
                {selectedSuite ? 'Filtered by suite' : 'All evaluations'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <ExportMenu
              data={data}
              statistics={statistics}
              regressions={regressions}
            />
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 text-content-muted hover:text-content-primary hover:bg-surface-overlay rounded-lg transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Regressions Alert */}
        {showRegressions && regressions.length > 0 && (
          <RegressionsAlert
            regressions={regressions}
            onDismiss={() => setShowRegressions(false)}
          />
        )}

        {/* Statistics */}
        {!compact && (
          <StatisticsPanel stats={statistics} isLoading={isLoading} />
        )}

        {/* Chart */}
        {isLoading ? (
          <ChartSkeleton height={compact ? 200 : 300} />
        ) : data.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <LazyTrendChart
            data={data}
            threshold={threshold}
            highlightRegressions={true}
            onPointClick={handlePointClick}
            height={compact ? 200 : 300}
            showArea={true}
            colorScheme="primary"
            showGrid={true}
            yAxisDomain="full"
          />
        )}

        {/* Suite Breakdown */}
        {showSuiteFilter && !compact && (
          <SuiteBreakdown
            suites={bySuite}
            onSuiteSelect={setSelectedSuite}
            selectedSuite={selectedSuite}
          />
        )}
      </div>

      {/* Drill-down Modal */}
      {drillDownPoint && (
        <DrillDownModal
          point={drillDownPoint}
          onClose={() => setDrillDownPoint(null)}
        />
      )}
    </div>
  )
}

export default ScoreTrends
