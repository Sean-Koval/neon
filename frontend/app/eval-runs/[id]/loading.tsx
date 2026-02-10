/**
 * Eval Run Detail Loading State
 */

export default function EvalRunDetailLoading() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
        <div className="flex-1">
          <div className="h-7 w-32 bg-gray-200 dark:bg-dark-700 rounded animate-pulse mb-1" />
          <div className="h-4 w-48 bg-gray-100 dark:bg-dark-800 rounded animate-pulse" />
        </div>
        <div className="w-10 h-10 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
      </div>

      {/* Progress card */}
      <div className="mb-6">
        <div className="card p-6 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 dark:bg-dark-800 rounded-full" />
              <div>
                <div className="h-5 w-24 bg-gray-200 dark:bg-dark-700 rounded mb-1" />
                <div className="h-4 w-32 bg-gray-100 dark:bg-dark-800 rounded" />
              </div>
            </div>
            <div className="h-8 w-24 bg-gray-100 dark:bg-dark-800 rounded-lg" />
          </div>
          {/* Progress bar */}
          <div className="h-2 w-full bg-gray-100 dark:bg-dark-800 rounded-full mb-3" />
          <div className="flex justify-between">
            <div className="h-4 w-20 bg-gray-100 dark:bg-dark-800 rounded" />
            <div className="h-4 w-20 bg-gray-100 dark:bg-dark-800 rounded" />
          </div>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-dark-800 border rounded-lg p-4 animate-pulse">
            <div className="h-3 w-20 bg-gray-200 dark:bg-dark-700 rounded mb-2" />
            <div className="h-5 w-24 bg-gray-100 dark:bg-dark-800 rounded" />
          </div>
        ))}
      </div>

      {/* Results skeleton */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-20 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
          <div className="h-8 w-28 bg-gray-100 dark:bg-dark-800 rounded-lg animate-pulse" />
        </div>
        <div className="card overflow-hidden">
          {/* Table rows */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="border-b px-4 py-4 flex gap-4 animate-pulse"
            >
              <div className="h-5 bg-gray-200 dark:bg-dark-700 rounded flex-1" />
              <div className="h-5 w-16 bg-gray-100 dark:bg-dark-800 rounded" />
              <div className="h-5 w-20 bg-gray-100 dark:bg-dark-800 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
