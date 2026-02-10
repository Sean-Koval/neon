'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import type { ScoreTrendDataPoint } from '@/hooks/use-scores'

// =============================================================================
// Types
// =============================================================================

export interface TrendChartProps {
  /** Data points to display */
  data: ScoreTrendDataPoint[]
  /** Threshold line value (0-1) */
  threshold?: number
  /** Target/baseline score to show */
  baseline?: number
  /** Highlight regression points */
  highlightRegressions?: boolean
  /** Called when a data point is clicked */
  onPointClick?: (point: ScoreTrendDataPoint) => void
  /** Chart height in pixels */
  height?: number
  /** Custom className */
  className?: string
  /** Show area fill under the line */
  showArea?: boolean
  /** Color scheme */
  colorScheme?: 'primary' | 'success' | 'warning' | 'danger'
  /** Show min/max range band */
  showRange?: boolean
  /** Show grid lines */
  showGrid?: boolean
  /** Y-axis domain: 'auto' for data range, 'full' for 0-1 */
  yAxisDomain?: 'auto' | 'full'
}

export interface ChartSkeletonProps {
  height?: number
  className?: string
}

// =============================================================================
// Color Schemes
// =============================================================================

const colorSchemes = {
  primary: {
    line: '#06b6d4', // cyan-500
    area: 'url(#colorPrimary)',
    dot: '#0891b2',
    regression: '#e11d48', // rose-600
    gradient: { start: '#22d3ee', end: '#06b6d4' },
  },
  success: {
    line: '#059669', // emerald-600
    area: 'url(#colorSuccess)',
    dot: '#059669',
    regression: '#dc2626',
    gradient: { start: '#34d399', end: '#059669' },
  },
  warning: {
    line: '#d97706', // amber-600
    area: 'url(#colorWarning)',
    dot: '#d97706',
    regression: '#dc2626',
    gradient: { start: '#fbbf24', end: '#d97706' },
  },
  danger: {
    line: '#dc2626', // red-600
    area: 'url(#colorDanger)',
    dot: '#dc2626',
    regression: '#991b1b',
    gradient: { start: '#f87171', end: '#dc2626' },
  },
}

// =============================================================================
// Custom Tooltip
// =============================================================================

interface CustomTooltipProps extends TooltipProps<number, string> {
  highlightRegressions?: boolean
}

function CustomTooltip({
  active,
  payload,
  highlightRegressions,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const data = payload[0].payload as ScoreTrendDataPoint

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[160px]">
      <p className="font-medium text-gray-900 border-b border-gray-100 pb-1.5 mb-2">
        {data.displayDate}
      </p>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Average:</span>
          <span
            className={`font-semibold ${
              data.avgScore >= 0.8
                ? 'text-emerald-600'
                : data.avgScore >= 0.6
                  ? 'text-amber-600'
                  : 'text-rose-600'
            }`}
          >
            {data.avgScore.toFixed(3)}
          </span>
        </div>

        {data.minScore !== data.maxScore && (
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400">Range:</span>
            <span className="text-gray-600">
              {data.minScore.toFixed(2)} - {data.maxScore.toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Runs:</span>
          <span className="font-medium text-gray-700">{data.runCount}</span>
        </div>

        {highlightRegressions && data.isRegression && (
          <div className="pt-1.5 mt-1.5 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs font-medium text-rose-600">
                Regression: {(data.delta * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {data.delta !== 0 && !data.isRegression && (
          <div className="text-xs text-gray-400">
            {data.delta > 0 ? '+' : ''}
            {(data.delta * 100).toFixed(1)}% from previous
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Custom Dot for Regression Highlighting
// =============================================================================

interface CustomDotProps {
  cx?: number
  cy?: number
  payload?: ScoreTrendDataPoint
  highlightRegressions?: boolean
  normalColor: string
  regressionColor: string
  onClick?: (point: ScoreTrendDataPoint) => void
}

function CustomDot({
  cx,
  cy,
  payload,
  highlightRegressions,
  normalColor,
  regressionColor,
  onClick,
}: CustomDotProps) {
  if (cx === undefined || cy === undefined || !payload) return null

  const isRegression = highlightRegressions && payload.isRegression
  const color = isRegression ? regressionColor : normalColor
  const size = isRegression ? 6 : 4

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: SVG g elements don't support standard role attributes; this is a valid pattern for recharts custom rendering
    <g
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(payload)}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(payload)
        }
      }}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {isRegression && (
        <>
          {/* Outer pulse ring for regressions */}
          <circle
            cx={cx}
            cy={cy}
            r={size + 4}
            fill={regressionColor}
            fillOpacity={0.2}
            className="animate-ping"
          />
          <circle
            cx={cx}
            cy={cy}
            r={size + 2}
            fill={regressionColor}
            fillOpacity={0.3}
          />
        </>
      )}
      <circle
        cx={cx}
        cy={cy}
        r={size}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
      />
    </g>
  )
}

// =============================================================================
// Loading Skeleton
// =============================================================================

export function ChartSkeleton({
  height = 300,
  className = '',
}: ChartSkeletonProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div
        className="bg-gray-100 dark:bg-dark-800 rounded-lg flex items-end justify-around p-4 gap-2"
        style={{ height }}
      >
        {/* Animated bar placeholders */}
        {[40, 65, 55, 80, 70, 85, 75, 60, 72].map((h) => (
          <div
            key={h}
            className="bg-gray-200 dark:bg-dark-700 rounded-t w-8 transition-all"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-3 px-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div
            key={day}
            className="h-3 w-8 bg-gray-200 dark:bg-dark-700 rounded"
          />
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Empty State
// =============================================================================

export function ChartEmptyState({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-[300px] bg-gray-50 dark:bg-dark-900 rounded-lg flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 ${className}`}
    >
      <svg
        className="w-12 h-12 mb-3 text-gray-300 dark:text-dark-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
        />
      </svg>
      <p className="font-medium">No Score Data</p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
        Run evaluations to see score trends
      </p>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function TrendChart({
  data,
  threshold,
  baseline,
  highlightRegressions = true,
  onPointClick,
  height = 300,
  className = '',
  showArea = true,
  colorScheme = 'primary',
  showRange = false,
  showGrid = true,
  yAxisDomain = 'full',
}: TrendChartProps) {
  const colors = colorSchemes[colorScheme]

  // Calculate dynamic Y-axis domain if needed
  const domain = useMemo(() => {
    if (yAxisDomain === 'full') return [0, 1]
    if (data.length === 0) return [0, 1]

    const scores = data.flatMap((d) => [d.minScore, d.maxScore])
    const min = Math.floor(Math.min(...scores) * 10) / 10
    const max = Math.ceil(Math.max(...scores) * 10) / 10
    return [Math.max(0, min - 0.1), Math.min(1, max + 0.1)]
  }, [data, yAxisDomain])

  if (data.length === 0) {
    return <ChartEmptyState className={className} />
  }

  if (data.length === 1) {
    // Show a single point visualization
    return (
      <div
        className={`h-[${height}px] flex items-center justify-center ${className}`}
      >
        <div className="text-center">
          <div
            className={`text-4xl font-bold ${
              data[0].avgScore >= 0.8
                ? 'text-emerald-600'
                : data[0].avgScore >= 0.6
                  ? 'text-amber-600'
                  : 'text-rose-600'
            }`}
          >
            {data[0].avgScore.toFixed(2)}
          </div>
          <p className="text-sm text-gray-500 mt-1">{data[0].displayDate}</p>
          <p className="text-xs text-gray-400">
            {data[0].runCount} run{data[0].runCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 30, left: 0, bottom: 10 }}
        >
          {/* Gradient Definitions */}
          <defs>
            <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorWarning" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorDanger" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="rangeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.line} stopOpacity={0.15} />
              <stop offset="100%" stopColor={colors.line} stopOpacity={0.05} />
            </linearGradient>
          </defs>

          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              vertical={false}
            />
          )}

          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={{ stroke: '#e5e7eb' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickMargin={8}
          />

          <YAxis
            domain={domain}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={{ stroke: '#e5e7eb' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(value: number) => value.toFixed(2)}
            width={45}
          />

          <Tooltip
            content={
              <CustomTooltip highlightRegressions={highlightRegressions} />
            }
          />

          {/* Range band showing min/max */}
          {showRange && (
            <Area
              type="monotone"
              dataKey="maxScore"
              fill="url(#rangeGradient)"
              stroke="none"
            />
          )}

          {/* Threshold Reference Line */}
          {threshold !== undefined && (
            <ReferenceLine
              y={threshold}
              stroke="#f59e0b"
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: `Threshold (${threshold})`,
                position: 'insideTopRight',
                fill: '#f59e0b',
                fontSize: 11,
                fontWeight: 500,
              }}
            />
          )}

          {/* Baseline Reference Line */}
          {baseline !== undefined && (
            <ReferenceLine
              y={baseline}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `Baseline (${baseline})`,
                position: 'insideBottomRight',
                fill: '#10b981',
                fontSize: 10,
              }}
            />
          )}

          {/* Main Area/Line */}
          <Area
            type="monotone"
            dataKey="avgScore"
            stroke={colors.line}
            strokeWidth={2.5}
            fill={showArea ? colors.area : 'none'}
            dot={(props) => (
              <CustomDot
                {...props}
                highlightRegressions={highlightRegressions}
                normalColor={colors.dot}
                regressionColor={colors.regression}
                onClick={onPointClick}
              />
            )}
            activeDot={{
              fill: colors.dot,
              stroke: '#fff',
              strokeWidth: 2,
              r: 6,
              style: { cursor: onPointClick ? 'pointer' : 'default' },
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TrendChart
