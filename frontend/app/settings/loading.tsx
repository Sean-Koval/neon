/**
 * Settings Page Loading State
 */

export default function SettingsLoading() {
  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="h-8 w-32 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
        <div className="h-5 w-64 bg-gray-100 dark:bg-dark-800 rounded mt-2 animate-pulse" />
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border dark:border-slate-700/80 mb-6 pb-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 w-24 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-6">
        <div className="card p-6 dark:border dark:border-slate-700/80 dark:bg-slate-900/72">
          <div className="h-6 w-40 bg-gray-200 dark:bg-dark-700 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-100 dark:bg-dark-800 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-gray-100 dark:bg-dark-800 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-gray-100 dark:bg-dark-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="card p-6 dark:border dark:border-slate-700/80 dark:bg-slate-900/72">
          <div className="h-6 w-48 bg-gray-200 dark:bg-dark-700 rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 bg-gray-100 dark:bg-dark-800 rounded animate-pulse" />
            <div className="h-20 bg-gray-100 dark:bg-dark-800 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
