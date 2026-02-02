'use client'

/**
 * Traces List Page
 *
 * Shows all traces with filtering and search.
 */

import {
  CheckCircle,
  ChevronRight,
  Clock,
  Filter,
  GitCompare,
  MessageSquare,
  RefreshCw,
  Search,
  Wrench,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { type TraceFilters, useTraces } from '@/hooks/use-traces'

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function TracesPage() {
  const [filters, setFilters] = useState<TraceFilters>({
    limit: 50,
  })
  const [searchQuery, setSearchQuery] = useState('')

  const { data: traces, isLoading, refetch } = useTraces(filters)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Traces</h1>
          <p className="text-gray-500">
            View and analyze agent execution traces
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/traces/diff"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <GitCompare className="w-4 h-4" />
            Compare
          </Link>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search traces..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setFilters((f) => ({ ...f, search: e.target.value || undefined }))
            }}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Status filter */}
        <select
          value={filters.status || ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: (e.target.value as 'ok' | 'error') || undefined,
            }))
          }
          className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="ok">Success</option>
          <option value="error">Error</option>
        </select>

        {/* Date range would go here */}
        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          More Filters
        </button>
      </div>

      {/* Traces Table */}
      <div className="border rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center bg-gray-50 px-4 py-3 border-b text-sm font-medium text-gray-500">
          <div className="flex-1">Trace</div>
          <div className="w-24 text-center">Status</div>
          <div className="w-24 text-right">Duration</div>
          <div className="w-20 text-center">
            <MessageSquare className="w-4 h-4 inline" />
          </div>
          <div className="w-20 text-center">
            <Wrench className="w-4 h-4 inline" />
          </div>
          <div className="w-32 text-right">Time</div>
          <div className="w-8" />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading traces...
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!traces || traces.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Clock className="w-8 h-8 mb-2" />
            <p>No traces found</p>
            <p className="text-sm">Traces will appear here when agents run</p>
          </div>
        )}

        {/* Trace rows */}
        {traces?.map((trace) => (
          <Link
            key={trace.trace_id}
            href={`/traces/${trace.trace_id}`}
            className="flex items-center px-4 py-3 border-b hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{trace.name}</div>
              <div className="text-sm text-gray-500 truncate">
                {trace.trace_id}
              </div>
            </div>

            <div className="w-24 flex justify-center">
              {trace.status === 'ok' ? (
                <span className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  OK
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-600 text-sm">
                  <XCircle className="w-4 h-4" />
                  Error
                </span>
              )}
            </div>

            <div className="w-24 text-right text-sm">
              {formatDuration(trace.duration_ms)}
            </div>

            <div className="w-20 text-center text-sm text-gray-500">
              {trace.llm_calls}
            </div>

            <div className="w-20 text-center text-sm text-gray-500">
              {trace.tool_calls}
            </div>

            <div className="w-32 text-right text-sm text-gray-500">
              {formatRelativeTime(trace.timestamp)}
            </div>

            <div className="w-8 flex justify-center">
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {traces && traces.length >= (filters.limit || 50) && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() =>
              setFilters((f) => ({
                ...f,
                offset: (f.offset || 0) + (f.limit || 50),
              }))
            }
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
