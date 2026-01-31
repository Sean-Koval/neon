'use client'

/**
 * Lazy-loaded trace components
 *
 * Heavy trace visualization components are dynamically imported to reduce
 * initial bundle size. The trace timeline and span detail panel are only
 * loaded when viewing individual trace pages.
 */

import dynamic from 'next/dynamic'
import { TraceLoadingSkeleton } from './trace-loading-skeleton'

// =============================================================================
// Loading Skeletons
// =============================================================================

export function TimelineLoadingSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center bg-gray-100 border-b text-sm font-medium text-gray-600">
        <div className="min-w-[280px] max-w-[280px] px-3 py-2 border-r">
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex-1 px-3 py-2">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="w-20 text-right pr-3 py-2">
          <div className="h-4 w-14 bg-gray-200 rounded animate-pulse ml-auto" />
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center animate-pulse">
            <div className="min-w-[280px] max-w-[280px] px-3 py-3 border-r flex items-center gap-2">
              <div className="w-5 h-5 bg-gray-200 rounded" />
              <div className="w-2 h-2 bg-gray-200 rounded-full" />
              <div className="w-4 h-4 bg-gray-200 rounded" />
              <div
                className="h-4 bg-gray-200 rounded"
                style={{ width: `${60 + (i % 3) * 20}px` }}
              />
            </div>
            <div className="flex-1 relative h-10 bg-gray-50/50">
              <div
                className="absolute top-1/2 -translate-y-1/2 h-4 bg-gray-200 rounded"
                style={{
                  left: `${(i - 1) * 10}%`,
                  width: `${20 + (i % 4) * 10}%`,
                }}
              />
            </div>
            <div className="w-20 text-right pr-3">
              <div className="h-4 w-12 bg-gray-200 rounded ml-auto" />
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-3 py-2 border-t bg-gray-50">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-1.5 animate-pulse">
            <div className="w-2.5 h-2.5 bg-gray-200 rounded-sm" />
            <div className="h-3 w-8 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SpanDetailLoadingSkeleton() {
  return (
    <div className="h-full flex flex-col border-l bg-white animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gray-200 rounded" />
          <div className="h-5 w-32 bg-gray-200 rounded" />
        </div>
        <div className="w-8 h-8 bg-gray-200 rounded" />
      </div>

      {/* Status banner */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
        <div className="w-4 h-4 bg-gray-200 rounded" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <div className="h-6 w-16 bg-gray-200 rounded-full" />
        <div className="h-6 w-20 bg-gray-200 rounded" />
        <div className="h-6 w-24 bg-gray-200 rounded" />
      </div>

      {/* Content sections */}
      <div className="flex-1 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-b border-gray-100">
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="w-4 h-4 bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
            <div className="px-4 pb-4 space-y-2">
              <div className="h-4 w-full bg-gray-100 rounded" />
              <div className="h-4 w-3/4 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Lazy-loaded Components
// =============================================================================

// Lazy load TraceTimeline - the main visualization component
export const LazyTraceTimeline = dynamic(
  () => import('./trace-timeline').then((mod) => mod.TraceTimeline),
  {
    loading: () => <TimelineLoadingSkeleton />,
    ssr: false, // Interactive timeline doesn't benefit from SSR
  },
)

// Lazy load SpanDetail - detail panel with code blocks
export const LazySpanDetail = dynamic(
  () => import('./span-detail').then((mod) => mod.SpanDetail),
  {
    loading: () => <SpanDetailLoadingSkeleton />,
    ssr: false,
  },
)

// Re-export loading skeleton for page-level loading states
export { TraceLoadingSkeleton }
