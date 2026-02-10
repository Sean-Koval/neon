'use client'

/**
 * Workflow Status Component
 *
 * Shows real-time status of Temporal workflows.
 */

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Pause,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Workflow status type
 */
type WorkflowStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TERMINATED'
  | 'TIMED_OUT'
  | 'awaiting_approval'

/**
 * Workflow progress
 */
interface WorkflowProgress {
  iteration: number
  maxIterations: number
  status: string
}

interface WorkflowStatusProps {
  workflowId: string
  status: WorkflowStatus
  progress?: WorkflowProgress
  startTime: string
  closeTime?: string | null
  workflowType?: string
  onRefresh?: () => void
  onApprove?: () => void
  onCancel?: () => void
}

/**
 * Get status info
 */
function getStatusInfo(status: WorkflowStatus) {
  switch (status) {
    case 'RUNNING':
      return {
        Icon: Loader2,
        color: 'text-blue-500',
        bgColor: 'bg-blue-50 dark:bg-blue-500/10',
        label: 'Running',
        animate: true,
      }
    case 'COMPLETED':
      return {
        Icon: CheckCircle,
        color: 'text-green-500',
        bgColor: 'bg-green-50 dark:bg-emerald-500/10',
        label: 'Completed',
        animate: false,
      }
    case 'FAILED':
      return {
        Icon: XCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        label: 'Failed',
        animate: false,
      }
    case 'CANCELLED':
    case 'TERMINATED':
      return {
        Icon: XCircle,
        color: 'text-gray-500 dark:text-gray-400',
        bgColor: 'bg-gray-50 dark:bg-dark-900',
        label: status === 'CANCELLED' ? 'Cancelled' : 'Terminated',
        animate: false,
      }
    case 'TIMED_OUT':
      return {
        Icon: Clock,
        color: 'text-orange-500',
        bgColor: 'bg-orange-50 dark:bg-orange-500/10',
        label: 'Timed Out',
        animate: false,
      }
    case 'awaiting_approval':
      return {
        Icon: Pause,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-amber-500/10',
        label: 'Awaiting Approval',
        animate: false,
      }
    default:
      return {
        Icon: AlertTriangle,
        color: 'text-gray-500 dark:text-gray-400',
        bgColor: 'bg-gray-50 dark:bg-dark-900',
        label: 'Unknown',
        animate: false,
      }
  }
}

/**
 * Format duration
 */
function formatDuration(startTime: string, endTime?: string | null): string {
  const start = new Date(startTime).getTime()
  const end = endTime ? new Date(endTime).getTime() : Date.now()
  const durationMs = end - start

  if (durationMs < 1000) return '<1s'
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`
  if (durationMs < 3600000) return `${Math.round(durationMs / 60000)}m`
  return `${(durationMs / 3600000).toFixed(1)}h`
}

/**
 * Workflow Status Component
 */
export function WorkflowStatus({
  workflowId,
  status,
  progress,
  startTime,
  closeTime,
  workflowType,
  onRefresh,
  onApprove,
  onCancel,
}: WorkflowStatusProps) {
  const statusInfo = getStatusInfo(status)
  const [elapsed, setElapsed] = useState(formatDuration(startTime, closeTime))

  // Update elapsed time for running workflows
  useEffect(() => {
    if (status !== 'RUNNING' && status !== 'awaiting_approval') return

    const interval = setInterval(() => {
      setElapsed(formatDuration(startTime, closeTime))
    }, 1000)

    return () => clearInterval(interval)
  }, [status, startTime, closeTime])

  return (
    <div className="border dark:border-dark-700 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <statusInfo.Icon
            className={cn(
              'w-5 h-5',
              statusInfo.color,
              statusInfo.animate && 'animate-spin',
            )}
          />
          <span className={cn('font-medium', statusInfo.color)}>
            {statusInfo.label}
          </span>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Workflow ID</span>
          <span className="font-mono text-xs truncate max-w-[200px]">
            {workflowId}
          </span>
        </div>

        {workflowType && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Type</span>
            <span>{workflowType}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Duration</span>
          <span>{elapsed}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Started</span>
          <span>{new Date(startTime).toLocaleString()}</span>
        </div>

        {closeTime && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Ended</span>
            <span>{new Date(closeTime).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Progress */}
      {progress && status === 'RUNNING' && (
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-500 dark:text-gray-400">Progress</span>
            <span>
              {progress.iteration} / {progress.maxIterations}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-dark-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{
                width: `${(progress.iteration / progress.maxIterations) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Approval Actions */}
      {status === 'awaiting_approval' && onApprove && onCancel && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
          >
            Approve
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 px-4 bg-gray-200 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 font-medium"
          >
            Reject
          </button>
        </div>
      )}

      {/* Cancel Action */}
      {status === 'RUNNING' && onCancel && (
        <div className="mt-4">
          <button
            onClick={onCancel}
            className="w-full py-2 px-4 bg-gray-200 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 font-medium"
          >
            Cancel Workflow
          </button>
        </div>
      )}
    </div>
  )
}

export default WorkflowStatus
