/**
 * Workflow Detail Loading State
 */

import { Skeleton } from '@/components/ui/skeleton'

export default function WorkflowDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10" variant="rounded" />
        <div className="flex-1">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" variant="rounded" />
          <Skeleton className="h-10 w-24" variant="rounded" />
        </div>
      </div>

      {/* Status bar */}
      <div className="card p-4 flex items-center gap-6 animate-pulse">
        <div className="flex items-center gap-2">
          <Skeleton className="w-3 h-3" variant="circular" animation="none" />
          <Skeleton className="h-4 w-20" animation="none" />
        </div>
        <Skeleton className="h-4 w-24" animation="none" />
        <Skeleton className="h-4 w-32" animation="none" />
        <Skeleton className="h-4 w-28" animation="none" />
      </div>

      {/* Workflow diagram placeholder */}
      <div className="card p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="h-64 bg-gray-50 dark:bg-dark-900 rounded-lg animate-pulse flex items-center justify-center">
          <div className="flex items-center gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton
                  className="w-24 h-12"
                  variant="rounded"
                  animation="none"
                />
                {i < 4 && <Skeleton className="w-8 h-1" animation="none" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity log */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="divide-y">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
              <Skeleton
                className="w-8 h-8"
                variant="circular"
                animation="none"
              />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 mb-1" animation="none" />
                <Skeleton className="h-3 w-32" animation="none" />
              </div>
              <Skeleton className="h-4 w-20" animation="none" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
