'use client'

/**
 * Eval Run Detail Page
 *
 * Shows real-time status and results for a single eval run.
 * Uses WebSocket for live updates with polling fallback.
 */

import { format, formatDistanceToNow } from 'date-fns'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { EvalRunProgress, EvalRunResults } from '@/components/eval-runs'
import { ConnectionStatusIndicator } from '@/components/realtime'
import { useRealtimeRun } from '@/hooks/use-realtime'
import {
  useCancelWorkflowRun,
  usePauseWorkflowRun,
  useResumeWorkflowRun,
  useWorkflowRun,
  useWorkflowRunStatus,
} from '@/hooks/use-workflow-runs'

export default function EvalRunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.id as string

  // Fetch full run details
  const { data: run, isLoading, error, refetch } = useWorkflowRun(runId)

  // Fetch lightweight status for polling
  const { data: status } = useWorkflowRunStatus(runId)

  // Real-time updates via WebSocket (with polling fallback)
  const {
    status: realtimeStatus,
    connectionStatus,
    isWebSocket,
  } = useRealtimeRun(runId)

  // Control mutations
  const pauseMutation = usePauseWorkflowRun()
  const resumeMutation = useResumeWorkflowRun()
  const cancelMutation = useCancelWorkflowRun({
    onSuccess: () => {
      refetch()
    },
  })

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // Error state
  if (error || !run) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <XCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-medium mb-2">Run not found</h2>
        <p className="text-gray-500 mb-4">
          {error?.message || 'The eval run could not be loaded.'}
        </p>
        <Link href="/eval-runs" className="text-blue-600 hover:text-blue-800">
          Back to runs
        </Link>
      </div>
    )
  }

  // Use realtime status first, then polling status, then run data
  // Priority: WebSocket realtime > polling status > initial run data
  const currentStatus = realtimeStatus
    ? {
        id: run.id,
        status: realtimeStatus.status,
        isRunning: realtimeStatus.status === 'RUNNING',
        isComplete: realtimeStatus.status === 'COMPLETED',
        isFailed:
          realtimeStatus.status === 'FAILED' ||
          realtimeStatus.status === 'CANCELLED' ||
          realtimeStatus.status === 'TERMINATED',
        progress: realtimeStatus.progress,
        summary: realtimeStatus.summary,
        error: realtimeStatus.error,
      }
    : status || {
        id: run.id,
        status: run.status,
        isRunning: run.status === 'RUNNING',
        isComplete: run.status === 'COMPLETED',
        isFailed:
          run.status === 'FAILED' ||
          run.status === 'CANCELLED' ||
          run.status === 'TERMINATED',
        progress: run.progress
          ? {
              completed: run.progress.completed,
              total: run.progress.total,
              passed: run.progress.passed,
              failed: run.progress.failed,
              percentComplete:
                run.progress.total > 0
                  ? Math.round(
                      (run.progress.completed / run.progress.total) * 100,
                    )
                  : 0,
            }
          : undefined,
        summary: run.result as
          | { total: number; passed: number; failed: number; avgScore: number }
          | undefined,
        error: run.error,
      }

  // Get results from run progress
  const results = run.progress?.results || []

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Eval Run</h1>
          <p className="text-sm text-gray-500 font-mono">{runId}</p>
        </div>
        <div className="flex items-center gap-2">
          {currentStatus.isRunning && (
            <ConnectionStatusIndicator
              status={connectionStatus}
              isWebSocket={isWebSocket}
              compact
            />
          )}
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Progress card */}
      <div className="mb-6">
        <EvalRunProgress
          runId={runId}
          status={currentStatus}
          onPause={() => pauseMutation.mutate(runId)}
          onResume={() => resumeMutation.mutate(runId)}
          onCancel={() => {
            if (confirm('Are you sure you want to cancel this eval run?')) {
              cancelMutation.mutate(runId)
            }
          }}
          isPausing={pauseMutation.isPending}
          isResuming={resumeMutation.isPending}
          isCancelling={cancelMutation.isPending}
          connectionStatus={connectionStatus}
          isWebSocket={isWebSocket}
        />
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Workflow ID
          </p>
          <p className="text-sm font-mono truncate" title={run.workflowId}>
            {run.workflowId}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Started
          </p>
          <p className="text-sm">
            {format(new Date(run.startTime), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Duration
          </p>
          <p className="text-sm">
            {run.closeTime
              ? formatDistanceToNow(new Date(run.startTime), {
                  includeSeconds: true,
                })
              : 'In progress...'}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Temporal UI
          </p>
          <a
            href={`http://localhost:8080/namespaces/default/workflows/${run.workflowId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            View workflow
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Results</h2>
            <button
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              onClick={() => {
                // Export results as JSON
                const blob = new Blob([JSON.stringify(results, null, 2)], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `eval-run-${runId}-results.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>
          <EvalRunResults results={results} />
        </div>
      )}

      {/* Empty results state */}
      {results.length === 0 && currentStatus.isComplete && (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-gray-500">No results available for this run.</p>
        </div>
      )}

      {/* Waiting for results */}
      {results.length === 0 && currentStatus.isRunning && (
        <div className="border rounded-lg p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">
            Running evaluation cases...
          </p>
          <p className="text-sm text-gray-500">
            Results will appear here as cases complete
          </p>
        </div>
      )}

      {/* Error details */}
      {run.error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="font-medium text-red-800 mb-2">Error Details</h3>
          <pre className="text-sm text-red-700 whitespace-pre-wrap font-mono">
            {run.error}
          </pre>
        </div>
      )}
    </div>
  )
}
