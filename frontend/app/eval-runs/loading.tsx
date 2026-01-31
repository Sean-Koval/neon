/**
 * Eval Runs List Loading State
 */

export default function EvalRunsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-48 bg-gray-100 rounded mt-2 animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-primary-100 rounded-lg animate-pulse" />
      </div>

      {/* Filters */}
      <div className="flex gap-4 animate-pulse">
        <div className="h-10 w-32 bg-gray-100 rounded-lg" />
        <div className="h-10 w-40 bg-gray-100 rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="card overflow-hidden">
        {/* Table header */}
        <div className="border-b bg-gray-50 px-4 py-3 flex gap-4">
          {['Suite', 'Status', 'Score', 'Cases', 'Time'].map((col) => (
            <div
              key={col}
              className="h-4 bg-gray-200 rounded animate-pulse flex-1"
            />
          ))}
        </div>
        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="border-b px-4 py-4 flex gap-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded flex-1" />
            <div className="h-5 w-20 bg-gray-100 rounded-full" />
            <div className="h-5 w-14 bg-gray-100 rounded" />
            <div className="h-5 w-16 bg-gray-100 rounded" />
            <div className="h-5 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
