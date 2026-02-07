'use client'

import { AlertCircle, ChevronRight, Clock, ListChecks, Plus, RefreshCw, Target } from 'lucide-react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { safeFormatDistance } from '@/lib/format-date'

interface Suite {
  id: string
  name: string
  description?: string
  agent_id?: string
  default_scorers?: string[]
  default_min_score?: number
  default_timeout_seconds?: number
  created_at?: string
  cases?: unknown[]
}

export default function SuitesPage() {
  const { data, isLoading, error, refetch } = trpc.suites.list.useQuery()

  const suites: Suite[] = Array.isArray(data) ? data : data?.items ?? data?.suites ?? []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evaluation Suites</h1>
          <p className="text-gray-500">Manage your test suites and evaluation configurations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="btn btn-secondary inline-flex items-center gap-2"
            title="Refresh suites"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <Link
            href="/eval-runs"
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Suite
          </Link>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <SuitesSkeleton />
      ) : error ? (
        <div className="card p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-900">Failed to load suites</p>
          <p className="text-xs text-gray-500 mt-1">{error.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 btn btn-secondary text-sm inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      ) : suites.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center">
            <ListChecks className="w-8 h-8 text-primary-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">No suites yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Create your first evaluation suite to start testing your agents.
          </p>
          <Link
            href="/eval-runs"
            className="btn btn-primary inline-flex items-center"
          >
            Get started
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suites.map((suite) => (
            <SuiteCard key={suite.id} suite={suite} />
          ))}
        </div>
      )}
    </div>
  )
}

function SuiteCard({ suite }: { suite: Suite }) {
  const scorerCount = suite.default_scorers?.length ?? 0

  return (
    <Link
      href={`/suites/${suite.id}`}
      className="card p-5 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
          {suite.name}
        </h3>
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 flex-shrink-0 mt-0.5" />
      </div>

      {suite.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{suite.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-500">
        {scorerCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Target className="w-3 h-3" />
            {scorerCount} scorer{scorerCount !== 1 ? 's' : ''}
          </span>
        )}
        {suite.default_min_score != null && (
          <span className="inline-flex items-center gap-1">
            Min: {suite.default_min_score}
          </span>
        )}
        {suite.created_at && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {safeFormatDistance(suite.created_at)}
          </span>
        )}
      </div>
    </Link>
  )
}

function SuitesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="card p-5 animate-pulse">
          <div className="h-5 w-40 bg-gray-200 rounded mb-3" />
          <div className="h-4 w-full bg-gray-200 rounded mb-2" />
          <div className="h-4 w-2/3 bg-gray-200 rounded mb-3" />
          <div className="flex gap-4">
            <div className="h-3 w-16 bg-gray-200 rounded" />
            <div className="h-3 w-12 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
