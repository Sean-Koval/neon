'use client'

import { clsx } from 'clsx'

interface StagePipelineProps {
  stages: Array<{ percentage: number; gateThreshold?: number }>
  currentStage: number
  /** Total number of stages */
  totalStages?: number
  size?: 'sm' | 'md'
}

/**
 * Horizontal stage pipeline visualization for progressive rollouts.
 * Shows completed, active, and upcoming stages as connected circles.
 */
export function StagePipeline({
  stages,
  currentStage,
  size = 'sm',
}: StagePipelineProps) {
  const dotSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const lineHeight = size === 'sm' ? 'h-0.5' : 'h-0.5'

  return (
    <div className="flex items-center gap-0">
      {stages.map((stage, i) => {
        const isCompleted = i < currentStage
        const isActive = i === currentStage
        const isUpcoming = i > currentStage

        return (
          <div key={i} className="flex items-center">
            {/* Dot */}
            <div className="relative group">
              <div
                className={clsx(
                  'rounded-full border-2 transition-all',
                  dotSize,
                  isCompleted &&
                    'bg-emerald-500 border-emerald-500',
                  isActive &&
                    'bg-cyan-500 border-cyan-500 animate-pulse',
                  isUpcoming &&
                    'bg-transparent border-gray-400 dark:border-gray-600',
                )}
              />
              {/* Tooltip */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                  {stage.percentage}%
                </div>
              </div>
            </div>

            {/* Connecting line */}
            {i < stages.length - 1 && (
              <div
                className={clsx(
                  'w-4 transition-all',
                  lineHeight,
                  i < currentStage
                    ? 'bg-emerald-500'
                    : 'bg-gray-300 dark:bg-gray-600',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
