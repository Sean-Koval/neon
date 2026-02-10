'use client'

/**
 * Trace Loading Skeleton
 *
 * Skeleton placeholder for trace detail page while loading.
 */

import { clsx } from 'clsx'

function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={clsx('animate-pulse rounded bg-gray-200 dark:bg-dark-700', className)}
      style={style}
    />
  )
}

/**
 * Header skeleton
 */
function HeaderSkeleton() {
  return (
    <div className="border-b px-4 py-4 sm:px-6">
      {/* Back button and title */}
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="w-9 h-9 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="w-9 h-9 rounded-lg" />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="ml-auto h-5 w-36" />
      </div>
    </div>
  )
}

/**
 * Timeline skeleton
 */
function TimelineSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Timeline header */}
      <div className="flex items-center bg-gray-100 dark:bg-dark-800 border-b px-3 py-2">
        <Skeleton className="h-4 w-16" />
        <div className="flex-1 mx-4">
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Span rows */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center border-b border-gray-100 dark:border-dark-700 px-3 py-2.5"
        >
          <div className="flex items-center gap-2 min-w-[200px] sm:min-w-[280px]">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="w-2 h-2 rounded-full" />
            <Skeleton className="w-4 h-4" />
            <Skeleton className="h-4 flex-1 max-w-[160px]" />
          </div>
          <div className="flex-1 relative h-8 mx-2">
            <Skeleton
              className="absolute top-1/2 -translate-y-1/2 h-3 rounded"
              style={{
                left: `${i * 5}%`,
                width: `${15 + i * 8}%`,
              }}
            />
          </div>
          <Skeleton className="w-16 h-4" />
        </div>
      ))}
    </div>
  )
}

/**
 * Scores skeleton
 */
function ScoresSkeleton() {
  return (
    <div className="mb-6">
      <Skeleton className="h-5 w-16 mb-3" />
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-24 h-14 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

/**
 * Full trace detail loading skeleton
 */
export function TraceLoadingSkeleton() {
  return (
    <div className="h-screen flex flex-col">
      <HeaderSkeleton />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <ScoresSkeleton />

          <div className="mb-3">
            <Skeleton className="h-5 w-28 mb-3" />
          </div>
          <TimelineSkeleton />
        </div>
      </div>
    </div>
  )
}

export default TraceLoadingSkeleton
