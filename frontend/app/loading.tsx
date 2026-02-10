/**
 * Dashboard Loading State
 *
 * Displayed while the dashboard page is loading. Uses skeleton UI
 * to prevent flash of unstyled content (FOUC).
 */

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
          <div className="h-5 w-48 bg-gray-100 dark:bg-dark-800 rounded mt-2 animate-pulse" />
        </div>
        <div className="h-10 w-24 bg-gray-200 dark:bg-dark-700 rounded-lg animate-pulse" />
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-4 animate-pulse">
        <div className="h-10 w-32 bg-gray-100 dark:bg-dark-800 rounded-lg" />
        <div className="h-10 w-40 bg-gray-100 dark:bg-dark-800 rounded-lg" />
        <div className="h-10 w-28 bg-gray-100 dark:bg-dark-800 rounded-lg" />
      </div>

      {/* Stats grid skeleton */}
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

      {/* Chart card skeleton */}
      <div className="card overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-dark-700 bg-gradient-to-r from-gray-50 dark:from-dark-900 to-white dark:to-dark-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-dark-800 animate-pulse">
                <div className="w-5 h-5" />
              </div>
              <div className="animate-pulse">
                <div className="h-5 w-32 bg-gray-200 dark:bg-dark-700 rounded mb-1" />
                <div className="h-4 w-24 bg-gray-100 dark:bg-dark-800 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-2 animate-pulse">
              <div className="h-9 w-36 bg-gray-100 dark:bg-dark-800 rounded-lg" />
              <div className="h-9 w-20 bg-gray-100 dark:bg-dark-800 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="h-[300px] bg-gray-50 dark:bg-dark-900 rounded-lg animate-pulse flex items-end justify-around p-4 gap-2">
            {[40, 65, 55, 80, 70, 85, 75, 60, 72].map((h, i) => (
              <div
                key={i}
                className="bg-gray-200 dark:bg-dark-700 rounded-t w-8"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Recent runs skeleton */}
      <div className="card overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-dark-700">
          <div className="h-5 w-28 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
        </div>
        <div className="divide-y divide-gray-100 dark:divide-dark-700">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div>
                    <div className="h-4 w-32 bg-gray-200 dark:bg-dark-700 rounded mb-2" />
                    <div className="h-3 w-24 bg-gray-100 dark:bg-dark-800 rounded" />
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  <div className="h-6 w-20 bg-gray-100 dark:bg-dark-800 rounded-full" />
                  <div className="h-4 w-20 bg-gray-100 dark:bg-dark-800 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
