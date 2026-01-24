'use client'

import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { DashboardStatCards } from '@/components/dashboard/stat-cards'
import { useRecentRuns } from '@/hooks/use-runs'
import type { EvalRun, EvalRunStatus } from '@/lib/types'

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of your agent evaluations</p>
      </div>

      {/* Stats */}
      <DashboardStatCards />

      {/* Recent Runs */}
      <RecentRunsSection />
    </div>
  )
}

function RecentRunsSection() {
  const { data: runs, isLoading, error } = useRecentRuns(5)

  return (
    <div className="card">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Recent Runs</h2>
      </div>

      {isLoading ? (
        <RecentRunsSkeleton />
      ) : error ? (
        <RecentRunsError error={error as Error} />
      ) : runs && runs.length > 0 ? (
        <div className="divide-y divide-gray-200">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <RecentRunsEmpty />
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

function RecentRunsSkeleton() {
  return (
    <div className="divide-y divide-gray-200">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-24 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="h-6 w-20 bg-gray-200 rounded-full" />
              <div className="text-right">
                <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-16 bg-gray-200 rounded" />
              </div>
              <div className="h-3 w-16 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentRunsError({ error }: { error: Error }) {
  return (
    <div className="p-6 text-center">
      <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">Failed to load recent runs</p>
      <p className="text-xs text-gray-400 mt-1">{error.message}</p>
    </div>
  )
}

function RecentRunsEmpty() {
  return (
    <div className="p-6 text-center">
      <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-gray-600">No runs yet</p>
      <p className="text-xs text-gray-400 mt-1">Run your first evaluation to see results here</p>
    </div>
  )
}

interface RunRowProps {
  run: EvalRun
}

function RunRow({ run }: RunRowProps) {
  const passedCount = run.summary?.passed ?? 0
  const totalCount = run.summary?.total_cases ?? 0
  const score = run.summary?.avg_score

  return (
    <div className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
      <div className="flex items-center space-x-4">
        <div>
          <Link
            href={`/runs/${run.id}`}
            className="font-medium text-gray-900 hover:text-primary-600"
          >
            {run.suite_name}
          </Link>
          <p className="text-sm text-gray-500">
            {run.agent_version ? `Version: ${run.agent_version}` : 'No version'}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-6">
        <StatusBadge status={run.status} />
        <div className="text-right">
          {run.summary ? (
            <>
              <p className="font-medium text-gray-900">
                {passedCount}/{totalCount} passed
              </p>
              <p className="text-sm text-gray-500">
                Score: <ScoreValue score={score ?? 0} />
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">--</p>
          )}
        </div>
        <span className="text-sm text-gray-500 w-24 text-right">
          {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: EvalRunStatus }) {
  const statusConfig: Record<EvalRunStatus, { icon: typeof CheckCircle; color: string; bg: string }> = {
    completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
    running: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
    pending: { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100' },
    cancelled: { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-100' },
  }

  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}
    >
      <Icon className="w-3 h-3" />
      <span className="capitalize">{status}</span>
    </span>
  )
}

function ScoreValue({ score }: { score: number }) {
  const color =
    score >= 0.8 ? 'text-green-600' : score >= 0.6 ? 'text-yellow-600' : 'text-red-600'

  return <span className={`font-medium ${color}`}>{score.toFixed(2)}</span>
}
