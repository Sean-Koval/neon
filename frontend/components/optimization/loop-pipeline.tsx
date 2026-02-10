'use client'

import { clsx } from 'clsx'
import {
  ArrowRight,
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
} from 'lucide-react'

interface PipelineStage {
  name: string
  status: 'completed' | 'running' | 'pending' | 'failed'
  metric?: string
  duration?: string
}

interface LoopPipelineProps {
  stages: PipelineStage[]
}

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/25',
    ring: 'ring-emerald-500/20',
    label: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-500',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/25',
    ring: 'ring-blue-500/30',
    label: 'text-blue-700 dark:text-blue-400',
    bar: 'bg-blue-500',
  },
  pending: {
    icon: Circle,
    color: 'text-gray-400 dark:text-gray-500',
    bg: 'bg-gray-50 dark:bg-dark-900',
    border: 'border-gray-200 dark:border-dark-700',
    ring: 'ring-transparent',
    label: 'text-gray-500 dark:text-gray-400',
    bar: 'bg-gray-200 dark:bg-dark-700',
  },
  failed: {
    icon: XCircle,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-200 dark:border-rose-500/25',
    ring: 'ring-rose-500/20',
    label: 'text-rose-700 dark:text-rose-400',
    bar: 'bg-rose-500',
  },
}

function StageNode({ stage, index, total }: { stage: PipelineStage; index: number; total: number }) {
  const config = STATUS_CONFIG[stage.status]
  const Icon = config.icon
  const isAnimated = stage.status === 'running'
  const isActive = stage.status === 'running'
  const isDone = stage.status === 'completed'

  return (
    <div className="flex items-center flex-1 min-w-0">
      {/* Stage node */}
      <div className="flex flex-col items-center gap-2 min-w-[5rem]">
        {/* Step number + icon */}
        <div className="relative">
          <div
            className={clsx(
              'w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all duration-300',
              config.border,
              config.bg,
              isActive && 'shadow-md shadow-blue-500/20 dark:shadow-blue-500/10',
              isDone && 'shadow-sm',
            )}
          >
            <Icon
              className={clsx(
                'w-5 h-5 transition-colors',
                config.color,
                isAnimated && 'animate-spin',
              )}
            />
          </div>
          {/* Step number badge */}
          <span
            className={clsx(
              'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-dark-800',
              isDone
                ? 'bg-emerald-500 text-white'
                : isActive
                  ? 'bg-blue-500 text-white'
                  : stage.status === 'failed'
                    ? 'bg-rose-500 text-white'
                    : 'bg-gray-200 dark:bg-dark-600 text-gray-500 dark:text-gray-400',
            )}
          >
            {index + 1}
          </span>
        </div>

        {/* Stage name */}
        <span className={clsx('text-xs font-semibold text-center leading-tight', config.label)}>
          {stage.name}
        </span>

        {/* Metric + duration */}
        <div className="flex flex-col items-center gap-0.5">
          {stage.metric && (
            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-dark-700 px-1.5 py-0.5 rounded">
              {stage.metric}
            </span>
          )}
          {stage.duration && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
              {stage.duration}
            </span>
          )}
        </div>
      </div>

      {/* Connector bar */}
      {index < total - 1 && (
        <div className="flex-1 flex items-center px-1 -mt-10 min-w-[1.5rem]">
          <div className="w-full h-0.5 rounded-full bg-gray-200 dark:bg-dark-700 relative overflow-hidden">
            <div
              className={clsx(
                'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                isDone ? 'w-full bg-emerald-500' : isActive ? 'w-1/2 bg-blue-500 animate-pulse' : 'w-0',
              )}
            />
          </div>
          <ArrowRight
            className={clsx(
              'w-3.5 h-3.5 flex-shrink-0 -ml-0.5',
              isDone ? 'text-emerald-400 dark:text-emerald-500' : 'text-gray-300 dark:text-dark-600',
            )}
          />
        </div>
      )}
    </div>
  )
}

export function LoopPipeline({ stages }: LoopPipelineProps) {
  const completed = stages.filter((s) => s.status === 'completed').length
  const pct = Math.round((completed / stages.length) * 100)

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-dark-700 bg-gradient-to-r from-gray-50/80 dark:from-dark-900/80 to-white dark:to-dark-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Optimization Pipeline
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Stage progression for current loop
            </p>
          </div>
          {/* Overall progress */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{pct}%</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {completed}/{stages.length} stages
              </p>
            </div>
            <div className="w-12 h-12 relative">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18" cy="18" r="15.5"
                  className="fill-none stroke-gray-200 dark:stroke-dark-700"
                  strokeWidth="3"
                />
                <circle
                  cx="18" cy="18" r="15.5"
                  className="fill-none stroke-emerald-500 transition-all duration-700"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${pct * 0.975} 100`}
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="flex items-start">
          {stages.map((stage, i) => (
            <StageNode key={stage.name} stage={stage} index={i} total={stages.length} />
          ))}
        </div>
      </div>
    </div>
  )
}
