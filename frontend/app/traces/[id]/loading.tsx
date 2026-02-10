/**
 * Trace Detail Loading State
 *
 * Uses the same TraceLoadingSkeleton component as the page
 * for consistent loading experience.
 */

export default function TraceDetailLoading() {
  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-900">
      {/* Header skeleton */}
      <header className="bg-white dark:bg-dark-800 border-b dark:border-dark-700 px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
          <div className="flex-1">
            <div className="h-6 w-48 bg-gray-200 dark:bg-dark-700 rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-gray-100 dark:bg-dark-800 rounded animate-pulse" />
          </div>
          <div className="w-10 h-10 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-20 bg-gray-100 dark:bg-dark-800 rounded-full animate-pulse" />
          <div className="h-8 w-24 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
          <div className="h-8 w-28 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
          <div className="h-8 w-28 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-hidden">
        {/* Timeline skeleton */}
        <div className="border rounded-lg overflow-hidden">
          {/* Timeline header */}
          <div className="flex items-center bg-gray-100 dark:bg-dark-800 border-b px-3 py-2">
            <div className="h-4 w-16 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
          </div>

          {/* Timeline rows */}
          <div className="divide-y divide-gray-100 dark:divide-dark-700">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex items-center animate-pulse">
                <div className="min-w-[280px] px-3 py-3 border-r flex items-center gap-2">
                  <div className="w-5 h-5 bg-gray-200 dark:bg-dark-700 rounded" />
                  <div className="w-2 h-2 bg-gray-200 dark:bg-dark-700 rounded-full" />
                  <div className="w-4 h-4 bg-gray-200 dark:bg-dark-700 rounded" />
                  <div
                    className="h-4 bg-gray-200 dark:bg-dark-700 rounded"
                    style={{ width: `${60 + (i % 3) * 20}px` }}
                  />
                </div>
                <div className="flex-1 relative h-10 bg-gray-50/50 dark:bg-dark-900/50">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-4 bg-gray-200 dark:bg-dark-700 rounded"
                    style={{
                      left: `${(i - 1) * 10}%`,
                      width: `${20 + (i % 4) * 10}%`,
                    }}
                  />
                </div>
                <div className="w-20 text-right pr-3">
                  <div className="h-4 w-12 bg-gray-200 dark:bg-dark-700 rounded ml-auto" />
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-3 px-3 py-2 border-t bg-gray-50 dark:bg-dark-900">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-1.5 animate-pulse">
                <div className="w-2.5 h-2.5 bg-gray-200 dark:bg-dark-700 rounded-sm" />
                <div className="h-3 w-10 bg-gray-200 dark:bg-dark-700 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
