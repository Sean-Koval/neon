/**
 * Suite Detail Loading State
 */

import {
  Skeleton,
  SkeletonChart,
  SkeletonTable,
} from '@/components/ui/skeleton'

export default function SuiteDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10" variant="rounded" />
        <div className="flex-1">
          <Skeleton className="h-7 w-56 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" variant="rounded" />
          <Skeleton className="h-10 w-20" variant="rounded" />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <Skeleton className="h-4 w-20 mb-2" animation="none" />
            <Skeleton className="h-8 w-16" animation="none" />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <SkeletonChart height={200} />
      </div>

      {/* Tests table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-32" variant="rounded" />
        </div>
        <SkeletonTable rows={6} columns={5} showHeader={false} />
      </div>
    </div>
  )
}
