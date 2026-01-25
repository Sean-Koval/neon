'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { type ScoreTrendPoint, useScoreTrend } from '@/hooks/use-runs'

interface ScoreTrendChartProps {
  days?: number
  maxRuns?: number
  threshold?: number
  className?: string
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[300px] bg-gray-100 rounded-lg flex items-end justify-around p-4 gap-2">
        {/* Animated bar placeholders */}
        {[40, 65, 55, 80, 70, 85, 75].map((height, i) => (
          <div
            key={i}
            className="bg-gray-200 rounded-t w-8"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="h-3 w-8 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  )
}

function InsufficientData() {
  return (
    <div className="h-[300px] bg-gray-50 rounded-lg flex flex-col items-center justify-center text-gray-500">
      <svg
        className="w-12 h-12 mb-3 text-gray-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <p className="font-medium">Insufficient Data</p>
      <p className="text-sm text-gray-400 mt-1">
        Run more evaluations to see score trends
      </p>
    </div>
  )
}

function CustomTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const data = payload[0].payload as ScoreTrendPoint

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="font-medium text-gray-900">{data.displayDate}</p>
      <div className="mt-1 space-y-1">
        <p className="text-sm">
          <span className="text-gray-500">Avg Score: </span>
          <span className="font-medium text-primary-600">
            {data.score.toFixed(2)}
          </span>
        </p>
        <p className="text-sm">
          <span className="text-gray-500">Runs: </span>
          <span className="font-medium">{data.runCount}</span>
        </p>
      </div>
    </div>
  )
}

export function ScoreTrendChart({
  days = 7,
  maxRuns = 10,
  threshold = 0.7,
  className = '',
}: ScoreTrendChartProps) {
  const { data, isLoading, isError, error } = useScoreTrend({ days, maxRuns })

  if (isLoading) {
    return (
      <div className={className}>
        <ChartSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className={`h-[300px] bg-red-50 rounded-lg flex flex-col items-center justify-center ${className}`}
      >
        <p className="font-medium text-red-600">Failed to load chart data</p>
        <p className="text-sm text-red-500 mt-1">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    )
  }

  if (!data || data.length < 2) {
    return (
      <div className={className}>
        <InsufficientData />
      </div>
    )
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 0, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={{ stroke: '#e5e7eb' }}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={{ stroke: '#e5e7eb' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(value: number) => value.toFixed(2)}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={threshold}
            stroke="#f59e0b"
            strokeDasharray="5 5"
            strokeWidth={2}
            label={{
              value: `Threshold (${threshold})`,
              position: 'insideTopRight',
              fill: '#f59e0b',
              fontSize: 11,
              fontWeight: 500,
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#0284c7"
            strokeWidth={2.5}
            dot={{
              fill: '#0284c7',
              stroke: '#fff',
              strokeWidth: 2,
              r: 4,
            }}
            activeDot={{
              fill: '#0284c7',
              stroke: '#fff',
              strokeWidth: 2,
              r: 6,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default ScoreTrendChart
