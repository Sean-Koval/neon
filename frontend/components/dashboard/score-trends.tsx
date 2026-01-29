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
  TrendChart,
} from '@/components/charts/trend-chart'
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
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200
            ${
              value === opt.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
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
  return <Minus className="w-4 h-4 text-gray-400" />
}

function StatisticsPanel({ stats, isLoading }: StatisticsPanelProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['mean', 'stddev', 'trend', 'count'].map((key) => (
          <div key={key} className="bg-gray-50 rounded-lg p-3 animate-pulse">
            <div className="h-3 w-12 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-16 bg-gray-200 rounded" />
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
          ? 'text-emerald-600'
          : stats.mean >= 0.6
            ? 'text-amber-600'
            : 'text-rose-600',
    },
    {
      label: 'Std Deviation',
      value: stats.stdDev.toFixed(3),
      subValue: `Range: ${(stats.max - stats.min).toFixed(2)}`,
      color: stats.stdDev < 0.1 ? 'text-emerald-600' : 'text-amber-600',
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
          ? 'text-emerald-600'
          : stats.trendDirection === 'down'
            ? 'text-rose-600'
            : 'text-gray-600',
    },
    {
      label: 'Data Points',
      value: stats.count.toString(),
      subValue: `Min: ${stats.min.toFixed(2)} / Max: ${stats.max.toFixed(2)}`,
      color: 'text-gray-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-gray-50 rounded-lg p-3 border border-gray-100"
        >
          <p className="text-xs font-medium text-gray-500 mb-1">{item.label}</p>
          <div className="flex items-center gap-1.5">
            {item.icon}
            <span className={`text-lg font-semibold ${item.color}`}>
              {item.value}
            </span>
          </div>
          {item.subValue && (
            <p className="text-xs text-gray-400 mt-0.5">{item.subValue}</p>
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
    <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-rose-100 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-rose-800">
              {regressions.length} Regression{regressions.length > 1 ? 's' : ''}{' '}
              Detected
            </h4>
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 hover:bg-rose-100 rounded transition-colors"
            >
              <X className="w-4 h-4 text-rose-600" />
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {regressions.slice(0, 3).map((reg) => (
              <div
                key={reg.date}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-rose-700">{reg.date}</span>
                <span className="font-medium text-rose-800">
                  {reg.previousScore.toFixed(2)}{' '}
                  <ArrowRight className="w-3 h-3 inline" />{' '}
                  {reg.score.toFixed(2)}
                  <span className="ml-1 text-rose-600">
                    (-{reg.percentageDrop.toFixed(1)}%)
                  </span>
                </span>
              </div>
            ))}
            {regressions.length > 3 && (
              <p className="text-xs text-rose-600">
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
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
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
                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }
            `}
          >
            <span className="text-sm font-medium text-gray-700">
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
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-gray-700 truncate">
                  {suite.suiteName}
                </span>
                <TrendIcon direction={suite.trendDirection} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span
                  className={`text-lg font-semibold ${
                    suite.avgScore >= 0.8
                      ? 'text-emerald-600'
                      : suite.avgScore >= 0.6
                        ? 'text-amber-600'
                        : 'text-rose-600'
                  }`}
                >
                  {suite.avgScore.toFixed(2)}
                </span>
                <span className="text-xs text-gray-400">
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
          <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
            <button
              type="button"
              onClick={handleExportCSV}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Export as CSV
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
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
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="font-semibold text-gray-900">{point.displayDate}</h3>
            <p className="text-sm text-gray-500">
              {point.runCount} run{point.runCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Score Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Average</p>
              <p
                className={`text-xl font-bold ${
                  point.avgScore >= 0.8
                    ? 'text-emerald-600'
                    : point.avgScore >= 0.6
                      ? 'text-amber-600'
                      : 'text-rose-600'
                }`}
              >
                {point.avgScore.toFixed(3)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Min</p>
              <p className="text-xl font-bold text-gray-700">
                {point.minScore.toFixed(3)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Max</p>
              <p className="text-xl font-bold text-gray-700">
                {point.maxScore.toFixed(3)}
              </p>
            </div>
          </div>

          {point.isRegression && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span className="text-sm font-medium text-rose-700">
                  Regression detected ({(point.delta * 100).toFixed(1)}% drop)
                </span>
              </div>
            </div>
          )}

          {/* Run Links */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Individual Runs
            </h4>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {point.runIds.map((runId) => (
                <Link
                  key={runId}
                  href={`/eval-runs/${runId}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <span className="text-sm text-gray-600 font-mono truncate">
                    {runId.slice(0, 8)}...
                  </span>
                  <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
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
  threshold = 0.7,
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
            <h2 className="text-lg font-semibold text-gray-900">
              Score Trends
            </h2>
          </div>
          <div className="h-[300px] bg-rose-50 rounded-lg flex flex-col items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-rose-400 mb-3" />
            <p className="font-medium text-rose-600">Failed to load data</p>
            <p className="text-sm text-rose-500 mt-1">
              {error?.message ?? 'Unknown error'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 btn btn-secondary inline-flex items-center gap-2"
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
    <div className={`card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary-50 to-accent-50">
              <TrendingUp className="w-5 h-5 text-primary-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Score Trends
              </h2>
              <p className="text-sm text-gray-500">
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
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
          <TrendChart
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
