'use client'

/**
 * Eval Run Progress Component
 *
 * Shows real-time progress of an eval run with progress bar and case results.
 * Includes connection status indicator for real-time updates.
 */

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Pause,
  Play,
  Square,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ConnectionStatus, WorkflowStatus, WorkflowStatusPoll } from '@/lib/types'
import { ConnectionDot } from '@/components/realtime'

interface EvalRunProgressProps {
  runId: string
  status: WorkflowStatusPoll
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  isPausing?: boolean
  isResuming?: boolean
  isCancelling?: boolean
  /** Optional connection status for real-time indicator */
  connectionStatus?: ConnectionStatus
  /** Whether using WebSocket (true) or polling (false) */
  isWebSocket?: boolean
  /** Callback to trigger reconnection */
  onReconnect?: () => void
}

/**
 * Get status display info
 */
function getStatusInfo(status: WorkflowStatus) {
  switch (status) {
    case 'RUNNING':
      return {
        Icon: Loader2,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        label: 'Running',
        animate: true,
      }
    case 'COMPLETED':
      return {
        Icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        label: 'Completed',
        animate: false,
      }
    case 'FAILED':
      return {
        Icon: XCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        label: 'Failed',
        animate: false,
      }
    case 'CANCELLED':
      return {
        Icon: Square,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: 'Cancelled',
        animate: false,
      }
    case 'TERMINATED':
      return {
        Icon: XCircle,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: 'Terminated',
        animate: false,
      }
    case 'TIMED_OUT':
      return {
        Icon: Clock,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        label: 'Timed Out',
        animate: false,
      }
    default:
      return {
        Icon: AlertTriangle,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: 'Unknown',
        animate: false,
      }
  }
}

/**
 * Format duration from milliseconds
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000)
    const secs = Math.round((ms % 60000) / 1000)
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  const hours = Math.floor(ms / 3600000)
  const mins = Math.round((ms % 3600000) / 60000)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function EvalRunProgress({
  runId,
  status,
  onPause,
  onResume,
  onCancel,
  isPausing,
  isResuming,
  isCancelling,
  connectionStatus,
  isWebSocket,
  onReconnect,
}: EvalRunProgressProps) {
  const statusInfo = getStatusInfo(status.status)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTime = Date.now() // Would come from status in real impl

  // Update elapsed time for running workflows
  useEffect(() => {
    if (!status.isRunning) return

    const interval = setInterval(() => {
      setElapsedMs((prev) => prev + 1000)
    }, 1000)

    return () => clearInterval(interval)
  }, [status.isRunning])

  const progress = status.progress
  const percentComplete = progress?.percentComplete ?? 0

  return (
    <div
      className={`border rounded-lg p-5 ${statusInfo.bgColor} ${statusInfo.borderColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <statusInfo.Icon
            className={`w-6 h-6 ${statusInfo.color} ${statusInfo.animate ? 'animate-spin' : ''}`}
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-semibold ${statusInfo.color}`}>
                {statusInfo.label}
              </h3>
              {connectionStatus && status.isRunning && (
                <div
                  className="flex items-center gap-1 text-xs text-gray-500"
                  title={`${connectionStatus === 'connected' ? (isWebSocket ? 'Live updates via WebSocket' : 'Polling for updates') : connectionStatus}`}
                >
                  <ConnectionDot status={connectionStatus} />
                  <span>{isWebSocket ? 'Live' : 'Polling'}</span>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 font-mono">{runId}</p>
          </div>
        </div>

        {/* Control buttons */}
        {status.isRunning && (
          <div className="flex items-center gap-2">
            {onPause && (
              <button
                onClick={onPause}
                disabled={isPausing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 disabled:opacity-50"
              >
                {isPausing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                Pause
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                disabled={isCancelling}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50"
              >
                {isCancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">
              {progress.completed} of {progress.total} cases
            </span>
            <span className="font-medium">{percentComplete}%</span>
          </div>
          <div className="w-full bg-white/50 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status.status === 'COMPLETED'
                  ? 'bg-green-500'
                  : status.status === 'FAILED'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Completed
          </p>
          <p className="text-xl font-semibold text-gray-900">
            {progress?.completed ?? 0}
          </p>
        </div>
        <div className="bg-white/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Passed
          </p>
          <p className="text-xl font-semibold text-green-600">
            {progress?.passed ?? 0}
          </p>
        </div>
        <div className="bg-white/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Failed
          </p>
          <p className="text-xl font-semibold text-red-600">
            {progress?.failed ?? 0}
          </p>
        </div>
        <div className="bg-white/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Elapsed
          </p>
          <p className="text-xl font-semibold text-gray-900">
            {formatDuration(elapsedMs)}
          </p>
        </div>
      </div>

      {/* Summary (when completed) */}
      {status.summary && status.isComplete && (
        <div className="mt-4 pt-4 border-t border-green-200">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Average Score</span>
            <span
              className={`text-lg font-bold ${
                status.summary.avgScore >= 0.8
                  ? 'text-green-600'
                  : status.summary.avgScore >= 0.6
                    ? 'text-yellow-600'
                    : 'text-red-600'
              }`}
            >
              {(status.summary.avgScore * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {status.error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{status.error}</p>
        </div>
      )}
    </div>
  )
}

export default EvalRunProgress
