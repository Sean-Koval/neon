/**
 * Feedback Page Loading State
 */

export default function FeedbackLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-5 w-96 bg-gray-100 rounded mt-2 animate-pulse" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-5 w-5 bg-gray-200 rounded mb-2" />
            <div className="h-8 w-16 bg-gray-200 rounded mt-2" />
            <div className="h-4 w-24 bg-gray-100 rounded mt-1" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b pb-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>

      {/* Content */}
      <div className="card p-6 space-y-6 animate-pulse">
        {/* Progress bar skeleton */}
        <div>
          <div className="flex justify-between mb-2">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
          </div>
          <div className="h-2 bg-gray-200 rounded-full" />
        </div>

        {/* Prompt skeleton */}
        <div className="h-24 bg-gray-200 rounded-lg" />

        {/* Response comparison skeleton */}
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 bg-gray-200 rounded-xl" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>

        {/* Actions skeleton */}
        <div className="flex justify-between pt-4 border-t border-gray-200">
          <div className="flex gap-2">
            <div className="h-10 w-10 bg-gray-200 rounded" />
            <div className="h-10 w-10 bg-gray-200 rounded" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-20 bg-gray-200 rounded" />
            <div className="h-10 w-24 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
