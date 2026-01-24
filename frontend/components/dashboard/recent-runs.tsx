'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { FileText } from 'lucide-react'
import { useRecentRuns, Run } from '@/hooks/use-runs'
import { StatusBadge, ScoreBadge, PassRatioBadge } from '@/components/ui/badge'

interface RecentRunsProps {
  limit?: number
}

export function RecentRuns({ limit = 10 }: RecentRunsProps) {
  const { data: runs, isLoading, error } = useRecentRuns(limit)

  return (
    <div className="card">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Recent Runs</h2>
      </div>

      {isLoading ? (
        <RecentRunsSkeleton count={5} />
      ) : error ? (
        <div className="p-6 text-center text-red-600">
          Failed to load recent runs
        </div>
      ) : !runs || runs.length === 0 ? (
        <RecentRunsEmpty />
      ) : (
        <div className="divide-y divide-gray-200">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}

      <div className="p-4 text-center border-t border-gray-100">
        <Link
          href="/runs"
          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          View all runs
        </Link>
      </div>
    </div>
  )
}

interface RunRowProps {
  run: Run
}

function RunRow({ run }: RunRowProps) {
  const relativeTime = run.created_at
    ? formatDistanceToNow(new Date(run.created_at), { addSuffix: true })
    : 'Unknown'

  return (
    <Link
      href={`/runs/${run.id}`}
      className="block p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between">
        {/* Left: Suite name and version */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.location.href = `/suites/${run.suite_id}`
                }}
                className="font-medium text-gray-900 hover:text-primary-600 truncate cursor-pointer"
              >
                {run.suite_name}
              </span>
            </div>
            {run.version && (
              <p className="text-sm text-gray-500 truncate">{run.version}</p>
            )}
          </div>
        </div>

        {/* Right: Status, results, score, time */}
        <div className="flex items-center gap-4 ml-4 flex-shrink-0">
          <StatusBadge status={run.status} size="sm" />

          <div className="hidden sm:block">
            <PassRatioBadge passed={run.passed} total={run.total} />
          </div>

          <div className="hidden md:block">
            <ScoreBadge score={run.score} />
          </div>

          <span className="text-sm text-gray-500 w-24 text-right hidden lg:block">
            {relativeTime}
          </span>
        </div>
      </div>
    </Link>
  )
}

function RecentRunsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-200">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-20" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-6 bg-gray-200 rounded-full w-20" />
              <div className="h-4 bg-gray-100 rounded w-12 hidden sm:block" />
              <div className="h-6 bg-gray-100 rounded w-12 hidden md:block" />
              <div className="h-4 bg-gray-100 rounded w-24 hidden lg:block" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentRunsEmpty() {
  return (
    <div className="p-12 text-center">
      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-sm font-medium text-gray-900 mb-1">No runs yet</h3>
      <p className="text-sm text-gray-500 mb-4">
        Start by creating an evaluation suite and running your first evaluation.
      </p>
      <Link
        href="/suites"
        className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
      >
        Create a suite
      </Link>
    </div>
  )
}
