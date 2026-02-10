/**
 * Trace Skeleton Components
 *
 * Reusable skeleton loaders for trace list and detail views.
 */

import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export function TraceListHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-5 w-40 mt-2" />
      </div>
      <Skeleton className="h-10 w-24" variant="rounded" />
    </div>
  )
}

export function TraceFiltersSkeleton() {
  return (
    <div className="flex gap-4 animate-pulse">
      <Skeleton className="h-10 w-64" variant="rounded" animation="none" />
      <Skeleton className="h-10 w-32" variant="rounded" animation="none" />
      <Skeleton className="h-10 w-28" variant="rounded" animation="none" />
    </div>
  )
}

export function TraceTableSkeleton({ rows = 8 }: { rows?: number }) {
  return <SkeletonTable rows={rows} columns={5} />
}

export function TraceListSkeleton() {
  return (
    <div className="space-y-6">
      <TraceListHeaderSkeleton />
      <TraceFiltersSkeleton />
      <TraceTableSkeleton />
    </div>
  )
}

export function TraceDetailHeaderSkeleton() {
  return (
    <header className="bg-white dark:bg-dark-800 border-b px-6 py-4">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="w-10 h-10" variant="rounded" />
        <div className="flex-1">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="w-10 h-10" variant="rounded" />
      </div>

      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-20" variant="circular" animation="pulse" />
        <Skeleton className="h-8 w-24" variant="rounded" animation="pulse" />
        <Skeleton className="h-8 w-28" variant="rounded" animation="pulse" />
        <Skeleton className="h-8 w-28" variant="rounded" animation="pulse" />
      </div>
    </header>
  )
}

export function TraceTimelineSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Timeline header */}
      <div className="flex items-center bg-gray-100 dark:bg-dark-800 border-b px-3 py-2">
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Timeline rows */}
      <div className="divide-y divide-gray-100 dark:divide-dark-700">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center animate-pulse">
            <div className="min-w-[280px] px-3 py-3 border-r flex items-center gap-2">
              <Skeleton className="w-5 h-5" animation="none" />
              <Skeleton
                className="w-2 h-2"
                variant="circular"
                animation="none"
              />
              <Skeleton className="w-4 h-4" animation="none" />
              <Skeleton
                className="h-4"
                style={{ width: `${60 + (i % 3) * 20}px` }}
                animation="none"
              />
            </div>
            <div className="flex-1 relative h-10 bg-gray-50/50">
              <Skeleton
                className="absolute top-1/2 -translate-y-1/2 h-4"
                style={{
                  left: `${(i - 1) * 10}%`,
                  width: `${20 + (i % 4) * 10}%`,
                }}
                animation="none"
              />
            </div>
            <div className="w-20 text-right pr-3">
              <Skeleton className="h-4 w-12 ml-auto" animation="none" />
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-3 py-2 border-t bg-gray-50 dark:bg-dark-900">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5 animate-pulse">
            <Skeleton className="w-2.5 h-2.5" animation="none" />
            <Skeleton className="h-3 w-10" animation="none" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TraceDetailSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-900">
      <TraceDetailHeaderSkeleton />
      <div className="flex-1 p-6 overflow-hidden">
        <TraceTimelineSkeleton />
      </div>
    </div>
  )
}
