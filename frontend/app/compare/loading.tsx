/**
 * Compare Loading State
 */

import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

export default function CompareLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-5 w-56 mt-2" />
        </div>
      </div>

      {/* Selection cards */}
      <div className="grid grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="card p-6">
            <Skeleton className="h-5 w-24 mb-4" />
            <Skeleton className="h-10 w-full" variant="rounded" />
          </div>
        ))}
      </div>

      {/* Comparison chart */}
      <div className="card p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <SkeletonChart height={300} />
      </div>

      {/* Metrics comparison */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <Skeleton className="h-4 w-24 mb-2" animation="none" />
            <div className="flex justify-between">
              <Skeleton className="h-8 w-16" animation="none" />
              <Skeleton className="h-8 w-16" animation="none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
