'use client'

import { AlertTriangle, Shield, TrendingDown, TrendingUp, Zap } from 'lucide-react'

interface FailurePattern {
  name: string
  frequency: number
  category: 'root_cause' | 'contributing_factor' | 'systemic_issue'
}

interface RcaSummaryData {
  topPatterns: FailurePattern[]
  systemicIssuesCount: number
  trend: 'improving' | 'stable' | 'degrading'
  totalAnalyses: number
}

const MOCK_DATA: RcaSummaryData = {
  topPatterns: [
    { name: 'Context length overflow', frequency: 34, category: 'root_cause' },
    { name: 'Tool timeout cascades', frequency: 21, category: 'contributing_factor' },
    { name: 'Stale embedding index', frequency: 12, category: 'systemic_issue' },
  ],
  systemicIssuesCount: 4,
  trend: 'improving',
  totalAnalyses: 89,
}

const CATEGORY_ICON = {
  root_cause: Zap,
  contributing_factor: AlertTriangle,
  systemic_issue: Shield,
}

const CATEGORY_COLOR = {
  root_cause: 'text-rose-600',
  contributing_factor: 'text-amber-600',
  systemic_issue: 'text-blue-600 dark:text-blue-400',
}

const TREND_CONFIG = {
  improving: {
    label: 'Improving',
    icon: TrendingDown,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  stable: {
    label: 'Stable',
    icon: TrendingUp,
    color: 'text-gray-600 dark:text-gray-300',
    bg: 'bg-gray-50 dark:bg-dark-800',
  },
  degrading: {
    label: 'Degrading',
    icon: TrendingUp,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
}

export function RcaSummaryCard() {
  const data = MOCK_DATA
  const trendConfig = TREND_CONFIG[data.trend]
  const TrendIcon = trendConfig.icon

  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-dark-700 bg-gradient-to-r from-gray-50 dark:from-dark-900 to-white dark:to-dark-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Root Cause Analysis
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Top failure patterns from {data.totalAnalyses} analyses
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${trendConfig.bg} ${trendConfig.color}`}
          >
            <TrendIcon className="w-3 h-3" />
            {trendConfig.label}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="space-y-3">
          {data.topPatterns.map((pattern) => {
            const Icon = CATEGORY_ICON[pattern.category]
            const color = CATEGORY_COLOR[pattern.category]

            return (
              <div
                key={pattern.name}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {pattern.name}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 ml-3">
                  {pattern.frequency}
                </span>
              </div>
            )
          })}
        </div>

        <div className="pt-3 border-t border-gray-100 dark:border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Systemic issues</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {data.systemicIssuesCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
