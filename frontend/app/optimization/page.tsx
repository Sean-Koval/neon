'use client'

import { clsx } from 'clsx'
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
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
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
  bgTint,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: string
  bgTint: string
}) {
  return (
    <div className="card p-5 group hover:shadow-md dark:hover:shadow-dark-900/50 transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={clsx('p-2 rounded-xl transition-colors', bgTint)}>
          <div className={color}>{icon}</div>
        </div>
      </div>
      <div className="mt-3">
        <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
          {value}
        </span>
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
      ? 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/25 hover:bg-rose-100 dark:hover:bg-rose-500/15'
      : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-800 border-gray-300 dark:border-dark-600 hover:bg-gray-50 dark:hover:bg-dark-700'

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
      <div className="h-8 w-48 bg-gray-200 dark:bg-dark-700 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="h-10 w-10 bg-gray-200 dark:bg-dark-700 rounded-xl" />
            </div>
            <div className="mt-3">
              <div className="h-9 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-dark-700">
          <div className="h-5 w-40 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
        <div className="p-6 flex justify-center gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-11 h-11 bg-gray-200 dark:bg-dark-700 rounded-xl" />
              <div className="h-3 w-12 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card overflow-hidden">
      <div className="relative p-12 text-center">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 dark:from-primary-500/5 via-transparent to-accent-50/50 dark:to-accent-500/5" />
        <div className="relative">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-primary-100 dark:from-primary-500/15 to-accent-100 dark:to-accent-500/15 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary-500 dark:text-primary-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No active optimization loop
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            The optimization pipeline automatically collects eval results, identifies regressions,
            curates training data, and fine-tunes prompts to improve agent performance.
          </p>
          <div className="flex items-center justify-center gap-6 text-xs text-gray-400 dark:text-gray-500">
            {['Collect', 'Curate', 'Analyze', 'Optimize', 'Validate', 'Deploy'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-dark-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400">
                  {i + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LoopStatusBanner({ loop }: { loop: ActiveLoop }) {
  const currentStage = loop.stages.find((s) => s.status === 'running')

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
          {loop.isPaused ? 'Loop paused' : `Running: ${currentStage?.name || loop.stage}`}
        </span>
        <span className="text-xs text-blue-600 dark:text-blue-400">
          Iteration {loop.currentIteration}/{loop.maxIterations}
        </span>
      </div>
      {!loop.isPaused && (
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Live</span>
        </div>
      )}
      {loop.isPaused && (
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/25">
          Paused
        </span>
      )}
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
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Optimization</h1>
        <LoadingSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Optimization</h1>
        <div className="card p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            Failed to load optimization data
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="btn btn-secondary"
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Optimization</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Closed-loop prompt optimization pipeline
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="btn btn-secondary"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Live status banner */}
      {loop && <LoopStatusBanner loop={loop} />}

      {/* ROI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Score Improvement"
          value={`+${(scoreImprovement * 100).toFixed(1)}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="text-emerald-600 dark:text-emerald-400"
          bgTint="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <MetricCard
          label="Failures Prevented"
          value={String(failuresPrevented)}
          icon={<Shield className="w-5 h-5" />}
          color="text-blue-600 dark:text-blue-400"
          bgTint="bg-blue-50 dark:bg-blue-500/10"
        />
        <MetricCard
          label="Current Iteration"
          value={
            loop
              ? `${loop.currentIteration}/${loop.maxIterations}`
              : '--'
          }
          icon={<ArrowDownRight className="w-5 h-5" />}
          color="text-purple-600 dark:text-purple-400"
          bgTint="bg-purple-50 dark:bg-purple-500/10"
        />
      </div>

      {/* Pipeline Visualization */}
      {loop && <LoopPipeline stages={loop.stages} />}
      {!loop && <EmptyState />}

      {/* Manual Controls */}
      {loop && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
