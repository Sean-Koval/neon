'use client'

import { TrendingUp } from 'lucide-react'
import { LazyScoreTrendChart } from '@/components/charts/lazy-charts'
import { CONFIG } from '@/lib/config'
import type { DateRangeOption } from './filters'

interface TrendCardProps {
  dateRange: DateRangeOption
}

export function TrendCard({ dateRange }: TrendCardProps) {
  const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90

  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Score Trends
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Average evaluation scores over the last {days} days
            </p>
          </div>
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary-50 to-accent-50">
            <TrendingUp className="w-5 h-5 text-primary-500" />
          </div>
        </div>
      </div>
      <div className="p-6">
        <LazyScoreTrendChart days={days} maxRuns={100} threshold={CONFIG.DASHBOARD_SCORE_THRESHOLD} />
      </div>
    </div>
  )
}
