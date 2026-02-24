'use client'

/**
 * Eval Run Progress Component (Hero Card)
 *
 * Shows real-time progress of an eval run with a prominent hero card.
 * Features: large progress bar, cases completed/total, elapsed time,
 * estimated time remaining, and animated pulse/glow for live state.
 */

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Pause,
  Square,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ConnectionDot } from '@/components/realtime'
import type {
  ConnectionStatus,
  WorkflowStatus,
  WorkflowStatusPoll,
} from '@/lib/types'

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
        color: 'text-cyan-600 dark:text-cyan-400',
        bgColor: 'bg-cyan-50 dark:bg-cyan-500/5',
        borderColor: 'border-cyan-200 dark:border-cyan-500/25',
        glowColor: 'shadow-cyan-200/50 dark:shadow-cyan-500/20',
        label: 'In Progress',
        animate: true,
      }
    case 'COMPLETED':
      return {
        Icon: CheckCircle,
        color: 'text-green-600 dark:text-emerald-400',
        bgColor: 'bg-green-50 dark:bg-emerald-500/10',
        borderColor: 'border-green-200 dark:border-emerald-500/25',
        glowColor: '',
        label: 'Completed',
        animate: false,
      }
    case 'FAILED':
      return {
        Icon: XCircle,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        borderColor: 'border-red-200 dark:border-red-500/25',
        glowColor: '',
        label: 'Failed',
        animate: false,
      }
    case 'CANCELLED':
      return {
        Icon: Square,
        color: 'text-gray-600 dark:text-gray-300',
        bgColor: 'bg-gray-50 dark:bg-dark-900',
        borderColor: 'border-gray-200 dark:border-dark-700',
        glowColor: '',
        label: 'Cancelled',
        animate: false,
      }
    case 'TERMINATED':
      return {
        Icon: XCircle,
        color: 'text-gray-600 dark:text-gray-300',
        bgColor: 'bg-gray-50 dark:bg-dark-900',
        borderColor: 'border-gray-200 dark:border-dark-700',
        glowColor: '',
        label: 'Terminated',
        animate: false,
      }
    case 'TIMED_OUT':
      return {
        Icon: Clock,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-50 dark:bg-orange-500/10',
        borderColor: 'border-orange-200 dark:border-orange-500/25',
        glowColor: '',
        label: 'Timed Out',
        animate: false,
      }
    default:
      return {
        Icon: AlertTriangle,
        color: 'text-gray-600 dark:text-gray-300',
        bgColor: 'bg-gray-50 dark:bg-dark-900',
        borderColor: 'border-gray-200 dark:border-dark-700',
        glowColor: '',
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
  status,
  onPause,
  onCancel,
  isPausing,
  isCancelling,
  connectionStatus,
  isWebSocket,
}: EvalRunProgressProps) {
  const statusInfo = getStatusInfo(status.status)
  const [elapsedMs, setElapsedMs] = useState(0)

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

  // Estimate time remaining based on elapsed time and progress
  const estimatedRemaining = useMemo(() => {
    if (!progress || progress.completed === 0 || progress.total === 0)
      return null
    if (elapsedMs < 3000) return null // Need at least 3s of data
    const ratePerMs = progress.completed / elapsedMs
    const remaining = progress.total - progress.completed
    if (ratePerMs <= 0) return null
    return Math.round(remaining / ratePerMs)
  }, [progress, elapsedMs])

  const isLive = status.isRunning

  return (
    <div
      className={`relative border-2 rounded-xl p-6 ${statusInfo.bgColor} ${statusInfo.borderColor} ${
        isLive ? `shadow-lg ${statusInfo.glowColor} animate-pulse-subtle` : ''
      }`}
      style={
        isLive
          ? {
              animation: 'hero-glow 2s ease-in-out infinite',
            }
          : undefined
      }
    >
      {/* Inline keyframes for glow animation */}
      {isLive && (
        <style>{`
          @keyframes hero-glow {
            0%, 100% { box-shadow: 0 0 12px 0 rgba(6, 182, 212, 0.15); }
            50% { box-shadow: 0 0 24px 4px rgba(6, 182, 212, 0.25); }
          }
        `}</style>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full ${statusInfo.bgColor}`}
          >
            <statusInfo.Icon
              className={`w-6 h-6 ${statusInfo.color} ${statusInfo.animate ? 'animate-spin' : ''}`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`text-lg font-bold ${statusInfo.color}`}
              >
                {statusInfo.label}
              </h3>
              {connectionStatus && isLive && (
                <div
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                  title={`${connectionStatus === 'connected' ? (isWebSocket ? 'Live updates via WebSocket' : 'Polling for updates') : connectionStatus}`}
                >
                  <ConnectionDot status={connectionStatus} />
                  <span>{isWebSocket ? 'Live' : 'Polling'}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Control buttons */}
        {isLive && (
          <div className="flex items-center gap-2">
            {onPause && (
              <button
                type="button"
                onClick={onPause}
                disabled={isPausing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-md hover:bg-amber-200 dark:hover:bg-amber-500/30 disabled:opacity-50"
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
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-500/30 disabled:opacity-50"
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

      {/* Large progress bar */}
      {progress && (
        <div className="mb-5">
          <div className="flex items-end justify-between mb-2">
            <div>
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {progress.completed}
              </span>
              <span className="text-lg text-gray-400 dark:text-gray-500 mx-1">
                /
              </span>
              <span className="text-lg text-gray-500 dark:text-gray-400">
                {progress.total} cases
              </span>
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {percentComplete}%
            </span>
          </div>
          <div className="w-full bg-white/60 dark:bg-dark-700/60 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status.status === 'COMPLETED'
                  ? 'bg-emerald-500'
                  : status.status === 'FAILED'
                    ? 'bg-red-500'
                    : 'bg-cyan-500 dark:bg-cyan-400'
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white/60 dark:bg-dark-800/60 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Passed
          </p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {progress?.passed ?? 0}
          </p>
        </div>
        <div className="bg-white/60 dark:bg-dark-800/60 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Failed
          </p>
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
            {progress?.failed ?? 0}
          </p>
        </div>
        <div className="bg-white/60 dark:bg-dark-800/60 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Remaining
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {progress ? progress.total - progress.completed : 0}
          </p>
        </div>
        <div className="bg-white/60 dark:bg-dark-800/60 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Elapsed
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatDuration(elapsedMs)}
          </p>
        </div>
        <div className="bg-white/60 dark:bg-dark-800/60 rounded-lg p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            ETA
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {estimatedRemaining !== null
              ? `~${formatDuration(estimatedRemaining)}`
              : '--'}
          </p>
        </div>
      </div>

      {/* Error message */}
      {status.error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-500/25 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-300">
            {status.error}
          </p>
        </div>
      )}
    </div>
  )
}

export default EvalRunProgress
