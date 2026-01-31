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
            <div className="h-10 w-10 bg-gray-100 rounded-xl" />
            <div className="h-5 w-16 bg-gray-100 rounded-full" />
          </div>
          <div className="h-8 w-20 bg-gray-100 rounded mb-2" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
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
