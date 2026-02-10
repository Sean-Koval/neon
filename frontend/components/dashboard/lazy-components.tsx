'use client'

/**
 * Lazy-loaded dashboard components
 *
 * Heavy dashboard components are dynamically imported to reduce initial bundle size.
 * This is especially important for the ScoreTrends component which includes recharts.
 */

import dynamic from 'next/dynamic'
import { ScoreTrendsLoadingSkeleton } from '../charts/lazy-charts'

// =============================================================================
// Dashboard Stats Loading Skeleton
// =============================================================================

export function StatCardsLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="card p-5 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-10 w-10 bg-gray-100 dark:bg-dark-800 rounded-xl" />
            <div className="h-5 w-16 bg-gray-100 dark:bg-dark-800 rounded-full" />
          </div>
          <div className="h-8 w-20 bg-gray-100 dark:bg-dark-800 rounded mb-2" />
          <div className="h-4 w-32 bg-gray-100 dark:bg-dark-800 rounded" />
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// Lazy-loaded Components
// =============================================================================

// Lazy load ScoreTrends - this is the heaviest dashboard component
export const LazyScoreTrends = dynamic(
  () => import('./score-trends').then((mod) => mod.ScoreTrends),
  {
    loading: () => <ScoreTrendsLoadingSkeleton />,
    ssr: false, // Charts don't need SSR and this reduces server load
  },
)

// Lazy load StatCards - moderate size but benefits from code splitting
export const LazyDashboardStatCards = dynamic(
  () => import('./stat-cards').then((mod) => mod.DashboardStatCards),
  {
    loading: () => <StatCardsLoadingSkeleton />,
    ssr: true, // Stats can benefit from SSR for initial paint
  },
)

// =============================================================================
// Tool Metrics Loading Skeleton
// =============================================================================

export function ToolMetricsLoadingSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-32 bg-gray-200 dark:bg-dark-700 rounded" />
        <div className="h-8 w-8 bg-gray-200 dark:bg-dark-700 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-100 dark:bg-dark-800 rounded-lg p-3 text-center">
            <div className="h-8 w-16 bg-gray-200 dark:bg-dark-700 rounded mx-auto mb-1" />
            <div className="h-3 w-12 bg-gray-200 dark:bg-dark-700 rounded mx-auto" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-4 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
            <div className="flex gap-4">
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Lazy load ToolMetricsCard - includes its own data fetching
export const LazyToolMetricsCard = dynamic(
  () => import('./tool-metrics').then((mod) => mod.ToolMetricsCard),
  {
    loading: () => <ToolMetricsLoadingSkeleton />,
    ssr: false, // Data fetching happens client-side
  },
)
