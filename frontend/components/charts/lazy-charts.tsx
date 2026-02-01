'use client'

/**
 * Lazy-loaded chart components
 *
 * This module provides dynamically imported versions of heavy chart components
 * to reduce initial bundle size. Charts are loaded on-demand with loading skeletons.
 */

import dynamic from 'next/dynamic'

// =============================================================================
// Loading Skeletons
// =============================================================================

export function ChartLoadingSkeleton({
  height = 300,
  className = '',
}: {
  height?: number
  className?: string
}) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div
        className="bg-gray-100 rounded-lg flex items-end justify-around p-4 gap-2"
        style={{ height }}
      >
        {[40, 65, 55, 80, 70, 85, 75, 60, 72].map((h, i) => (
          <div
            key={i}
            className="bg-gray-200 rounded-t w-8 transition-all"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-3 px-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="h-3 w-8 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  )
}

export function ScoreTrendsLoadingSkeleton({
  className = '',
}: {
  className?: string
}) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      {/* Header skeleton */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 animate-pulse">
              <div className="w-5 h-5" />
            </div>
            <div className="animate-pulse">
              <div className="h-5 w-32 bg-gray-200 rounded mb-1" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2 animate-pulse">
            <div className="h-9 w-36 bg-gray-100 rounded-lg" />
            <div className="h-9 w-20 bg-gray-100 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="p-6 space-y-6">
        {/* Statistics skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3 animate-pulse">
              <div className="h-3 w-12 bg-gray-200 rounded mb-2" />
              <div className="h-6 w-16 bg-gray-200 rounded" />
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <ChartLoadingSkeleton height={300} />
      </div>
    </div>
  )
}

// =============================================================================
// Lazy-loaded Components
// =============================================================================

// Lazy load TrendChart - only imported when needed
export const LazyTrendChart = dynamic(
  () => import('./trend-chart').then((mod) => mod.TrendChart),
  {
    loading: () => <ChartLoadingSkeleton />,
    ssr: false, // Charts don't need SSR
  },
)

// Lazy load ScoreTrendChart
export const LazyScoreTrendChart = dynamic(
  () => import('./score-trend').then((mod) => mod.ScoreTrendChart),
  {
    loading: () => <ChartLoadingSkeleton />,
    ssr: false,
  },
)

// Re-export loading-safe versions of skeleton components for non-lazy contexts
export { ChartEmptyState, ChartSkeleton } from './trend-chart'
