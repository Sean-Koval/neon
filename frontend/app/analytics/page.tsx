'use client'

/**
 * Analytics Page
 *
 * Shows usage analytics, cost tracking, and performance metrics.
 */

import { Calendar, DollarSign, Hash, TrendingUp, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { trpc } from '@/lib/trpc'

/**
 * Date range options
 */
const DATE_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

/**
 * Format currency
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

/**
 * Format large numbers
 */
function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toFixed(0)
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState(7)

  const endDate = useMemo(() => new Date().toISOString().split('T')[0], [])
  const startDate = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() - dateRange)
    return date.toISOString().split('T')[0]
  }, [dateRange])

  // Fetch analytics summary from tRPC
  const { data: summaryData } = trpc.analytics.summary.useQuery(
    { startDate: startDate ?? '', endDate: endDate ?? '' },
    { staleTime: 60 * 1000 },
  )

  // Fetch daily stats from tRPC
  const { data: dailyStatsData } = trpc.analytics.dailyStats.useQuery(
    { startDate: startDate ?? '', endDate: endDate ?? '' },
    { staleTime: 60 * 1000 },
  )

  // Fetch model/cost breakdown from tRPC
  const { data: costData } = trpc.analytics.costBreakdown.useQuery(
    { startDate: startDate ?? '', endDate: endDate ?? '' },
    { staleTime: 60 * 1000 },
  )

  // Normalize API responses into the shapes the UI expects
  const summary = useMemo(() => {
    if (!summaryData) return undefined
    return {
      total_traces: summaryData.total_traces ?? 0,
      total_errors: summaryData.total_errors ?? 0,
      error_rate: summaryData.error_rate ?? 0,
      total_tokens: summaryData.total_tokens ?? 0,
      total_cost_usd: summaryData.total_cost_usd ?? 0,
      total_scores: summaryData.total_scores ?? 0,
      avg_score: summaryData.avg_score ?? 0,
      top_models: (costData?.models ?? summaryData.top_models ?? []) as Array<{
        model: string
        calls: number
        cost: number
      }>,
    }
  }, [summaryData, costData])

  const dailyStats = useMemo(() => {
    if (!dailyStatsData) return undefined
    if (Array.isArray(dailyStatsData)) return dailyStatsData
    if (dailyStatsData.stats) return dailyStatsData.stats
    return undefined
  }, [dailyStatsData])

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300']

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-gray-500">Usage metrics and cost tracking</p>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="px-3 py-2 border rounded-lg"
          >
            {DATE_RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Total Traces</span>
          </div>
          <div className="text-2xl font-bold">
            {formatNumber(summary?.total_traces || 0)}
          </div>
          <div className="text-sm text-red-500">
            {summary?.error_rate.toFixed(1)}% error rate
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Hash className="w-4 h-4" />
            <span className="text-sm">Total Tokens</span>
          </div>
          <div className="text-2xl font-bold">
            {formatNumber(summary?.total_tokens || 0)}
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total Cost</span>
          </div>
          <div className="text-2xl font-bold">
            {formatCurrency(summary?.total_cost_usd || 0)}
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Avg Score</span>
          </div>
          <div className="text-2xl font-bold">
            {((summary?.avg_score || 0) * 100).toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500">
            {summary?.total_scores || 0} scores
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Traces over time */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium mb-4">Traces Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="traces"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost over time */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium mb-4">Cost Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="cost" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Model breakdown */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium mb-4">Model Usage</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary?.top_models}
                  dataKey="calls"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ model, percent }) =>
                    `${model.split('-').pop()} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {summary?.top_models.map((entry, index) => (
                    <Cell
                      key={entry.model}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium mb-4">Cost by Model</h3>
          <div className="space-y-4">
            {summary?.top_models.map((model, index) => (
              <div key={model.model}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{model.model}</span>
                  <span className="font-medium">
                    {formatCurrency(model.cost)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${(model.cost / (summary?.total_cost_usd || 1)) * 100}%`,
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
