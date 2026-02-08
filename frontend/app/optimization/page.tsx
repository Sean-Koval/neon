'use client'

import {
  AlertCircle,
  ArrowDownRight,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  SkipForward,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { LoopHistory } from '@/components/optimization/loop-history'
import { LoopPipeline } from '@/components/optimization/loop-pipeline'

interface LoopStage {
  name: string
  status: 'completed' | 'running' | 'pending' | 'failed'
  metric?: string
  duration?: string
}

interface ActiveLoop {
  id: string
  stage: string
  progress: number
  isPaused: boolean
  currentIteration: number
  maxIterations: number
  metrics: Record<string, number>
  stages: LoopStage[]
}

interface LoopHistoryEntry {
  id: string
  trigger: string
  stagesCompleted: number
  improvement: number
  duration: string
  status: string
  startedAt: string
}

interface OptimizationData {
  activeLoop: ActiveLoop | null
  history: LoopHistoryEntry[]
}

function MetricCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        <div
          className={`p-1.5 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 ${color}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
    </div>
  )
}

function ControlButton({
  label,
  icon,
  onClick,
  disabled,
  variant = 'secondary',
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'secondary' | 'danger'
}) {
  const base =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const styles =
    variant === 'danger'
      ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
      : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles}`}
    >
      {icon}
      {label}
    </button>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-8 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="card p-6">
        <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
        <div className="flex justify-center gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="w-10 h-10 bg-gray-200 rounded-xl"
            />
          ))}
        </div>
      </div>
      <div className="card p-6">
        <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-200 rounded mb-2" />
        ))}
      </div>
    </div>
  )
}

export default function OptimizationPage() {
  const [data, setData] = useState<OptimizationData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch('/api/optimization')
      if (!res.ok) throw new Error('Failed to fetch optimization status')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const sendAction = useCallback(
    async (action: string) => {
      setActionLoading(action)
      try {
        const res = await fetch('/api/optimization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        if (!res.ok) throw new Error('Action failed')
        await fetchData()
      } catch {
        // Error handled by refetch
      } finally {
        setActionLoading(null)
      }
    },
    [fetchData],
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Optimization</h1>
        <LoadingSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Optimization</h1>
        <div className="card p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Failed to load optimization data</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="btn btn-secondary mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  const loop = data?.activeLoop
  const history = data?.history ?? []

  const scoreImprovement = loop?.metrics.scoreImprovement ?? 0
  const failuresPrevented = loop?.metrics.failuresPrevented ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Optimization</h1>
          <p className="text-gray-500">
            Closed-loop prompt optimization pipeline
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="btn btn-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* ROI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Score Improvement"
          value={`+${(scoreImprovement * 100).toFixed(1)}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-600"
        />
        <MetricCard
          label="Failures Prevented"
          value={String(failuresPrevented)}
          icon={<Shield className="w-4 h-4" />}
          color="text-blue-600"
        />
        <MetricCard
          label="Current Iteration"
          value={
            loop
              ? `${loop.currentIteration}/${loop.maxIterations}`
              : '--'
          }
          icon={<ArrowDownRight className="w-4 h-4" />}
          color="text-purple-600"
        />
      </div>

      {/* Pipeline Visualization */}
      {loop && <LoopPipeline stages={loop.stages} />}

      {!loop && (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Play className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">
            No active optimization loop
          </h3>
          <p className="text-sm text-gray-500">
            Start a new optimization loop to improve prompt performance.
          </p>
        </div>
      )}

      {/* Manual Controls */}
      {loop && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              Loop Controls
            </h3>
            <div className="flex items-center gap-2">
              {loop.isPaused ? (
                <ControlButton
                  label="Resume"
                  icon={
                    actionLoading === 'resume' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )
                  }
                  onClick={() => sendAction('resume')}
                  disabled={actionLoading !== null}
                />
              ) : (
                <ControlButton
                  label="Pause"
                  icon={
                    actionLoading === 'pause' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )
                  }
                  onClick={() => sendAction('pause')}
                  disabled={actionLoading !== null}
                />
              )}
              <ControlButton
                label="Skip Stage"
                icon={
                  actionLoading === 'skip_stage' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <SkipForward className="w-3.5 h-3.5" />
                  )
                }
                onClick={() => sendAction('skip_stage')}
                disabled={actionLoading !== null}
              />
              <ControlButton
                label="Rollback"
                icon={
                  actionLoading === 'rollback' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )
                }
                onClick={() => sendAction('rollback')}
                disabled={actionLoading !== null}
              />
              <ControlButton
                label="Abort"
                icon={
                  actionLoading === 'abort' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )
                }
                onClick={() => sendAction('abort')}
                disabled={actionLoading !== null}
                variant="danger"
              />
            </div>
          </div>
        </div>
      )}

      {/* Loop History */}
      <LoopHistory history={history} />
    </div>
  )
}
