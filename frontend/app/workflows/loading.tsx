/**
 * Workflows Loading State
 */

import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export default function WorkflowsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-5 w-48 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" variant="rounded" />
      </div>

      {/* Filters */}
      <div className="flex gap-4 animate-pulse">
        <Skeleton className="h-10 w-64" variant="rounded" animation="none" />
        <Skeleton className="h-10 w-32" variant="rounded" animation="none" />
      </div>

      {/* Table */}
      <SkeletonTable rows={6} columns={5} />
    </div>
  )
}
