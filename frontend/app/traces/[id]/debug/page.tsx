'use client'

/**
 * Trace Debug Page
 *
 * Interactive debugger view for a single trace. Loads trace data
 * via the existing API and renders the trace debugger component
 * with span tree, timeline, and detail panel.
 */

import { ArrowLeft, Bug, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { TraceDebugger } from '@/components/traces/debugger/trace-debugger'
import { TraceLoadingSkeleton } from '@/components/traces/trace-loading-skeleton'
import { useTrace } from '@/hooks/use-traces'

export default function TraceDebugPage() {
  const params = useParams()
  const traceId = params.id as string

  const { data, isLoading, error, refetch } = useTrace(traceId)

  if (isLoading) {
    return <TraceLoadingSkeleton />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] px-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <Bug className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Failed to load trace
        </h2>
        <p className="text-gray-500 text-center mb-4 max-w-md">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href={`/traces/${traceId}`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to trace
          </Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] px-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Trace not found
        </h2>
        <p className="text-sm text-gray-500 font-mono mb-4">{traceId}</p>
        <Link
          href="/traces"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to traces
        </Link>
      </div>
    )
  }

  const { trace, spans } = data

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link
          href={`/traces/${traceId}`}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          title="Back to trace detail"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-orange-500" />
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {trace.name}
          </h1>
        </div>

        <code className="text-xs text-gray-500 font-mono hidden sm:block">
          {trace.trace_id}
        </code>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => refetch()}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      {/* Debugger */}
      <div className="flex-1 overflow-hidden">
        <TraceDebugger spans={spans} />
      </div>
    </div>
  )
}
