/**
 * Dashboard Skeleton Components
 *
 * Reusable skeleton loaders for dashboard elements.
 */

import { Skeleton, SkeletonCard, SkeletonChart } from '@/components/ui/skeleton'

export function DashboardHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-48 mt-2" />
      </div>
      <Skeleton className="h-10 w-24" variant="rounded" />
    </div>
  )
}

export function DashboardFiltersSkeleton() {
  return (
    <div className="flex gap-4 animate-pulse">
      <Skeleton className="h-10 w-32" variant="rounded" animation="none" />
      <Skeleton className="h-10 w-40" variant="rounded" animation="none" />
      <Skeleton className="h-10 w-28" variant="rounded" animation="none" />
    </div>
  )
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function ChartCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-dark-700 bg-gradient-to-r from-gray-50 dark:from-dark-900 to-white dark:to-dark-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-dark-800 animate-pulse">
              <div className="w-5 h-5" />
            </div>
            <div className="animate-pulse">
              <Skeleton className="h-5 w-32 mb-1" animation="none" />
              <Skeleton className="h-4 w-24" animation="none" />
            </div>
          </div>
          <div className="flex items-center gap-2 animate-pulse">
            <Skeleton className="h-9 w-36" variant="rounded" animation="none" />
            <Skeleton className="h-9 w-20" variant="rounded" animation="none" />
          </div>
        </div>
      </div>
      <div className="p-6">
        <SkeletonChart height={300} />
      </div>
    </div>
  )
}

export function RecentRunsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-dark-700">
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="divide-y divide-gray-100 dark:divide-dark-700">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-4 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div>
                  <Skeleton className="h-4 w-32 mb-2" animation="none" />
                  <Skeleton className="h-3 w-24" animation="none" />
                </div>
              </div>
              <div className="flex items-center space-x-6">
                <Skeleton
                  className="h-6 w-20"
                  variant="circular"
                  animation="none"
                />
                <Skeleton className="h-4 w-20" animation="none" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <DashboardHeaderSkeleton />
      <DashboardFiltersSkeleton />
      <StatsGridSkeleton />
      <ChartCardSkeleton />
      <RecentRunsSkeleton />
    </div>
  )
}
