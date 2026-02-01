/**
 * Suites Loading State
 */

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function SuitesLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-5 w-44 mt-2" />
        </div>
        <Skeleton className="h-10 w-28" variant="rounded" />
      </div>

      {/* Filters */}
      <div className="flex gap-4 animate-pulse">
        <Skeleton className="h-10 w-64" variant="rounded" animation="none" />
        <Skeleton className="h-10 w-32" variant="rounded" animation="none" />
      </div>

      {/* Suites grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonCard key={i}>
            <div className="space-y-3">
              <Skeleton className="h-5 w-3/4" animation="none" />
              <Skeleton className="h-4 w-full" animation="none" />
              <div className="flex justify-between pt-2">
                <Skeleton
                  className="h-6 w-16"
                  variant="rounded"
                  animation="none"
                />
                <Skeleton className="h-4 w-20" animation="none" />
              </div>
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
