'use client'

import { clsx } from 'clsx'
import { CheckCircle, XCircle } from 'lucide-react'
import React from 'react'
import type { Experiment, RolloutConfig, RolloutProgress, RolloutResult } from '@/hooks/use-experiments'
import { StagePipeline } from './stage-pipeline'

interface RolloutCardProps {
  experiment: Experiment
}

/**
 * Progressive Rollout experiment card for the list view.
 * Shows stage pipeline, gate threshold, and current score for running experiments.
 * Shows rolled out/rolled back badge for completed experiments.
 */
export const RolloutCard = React.memo(function RolloutCard({ experiment }: RolloutCardProps) {
  const config = experiment.config as RolloutConfig
  const progress = experiment.progress as RolloutProgress | undefined
  const result = experiment.result as RolloutResult | undefined
  const isCompleted = experiment.status === 'COMPLETED'
  const isRunning = experiment.status === 'RUNNING'

  const currentStage = result?.finalStage ?? progress?.currentStage ?? 0
  const stages = config.stages ?? []
  const currentScore = progress?.currentScore

  return (
    <div className="space-y-3">
      {/* Stage pipeline visualization */}
      <div className="flex items-center gap-3">
        <StagePipeline
          stages={stages}
          currentStage={isCompleted ? stages.length : currentStage}
          size="sm"
        />
        {isRunning && stages[currentStage] && (
          <span className="text-xs text-content-muted whitespace-nowrap">
            Stage {currentStage + 1}/{stages.length} ({stages[currentStage].percentage}%)
          </span>
        )}
      </div>

      {/* Gate threshold & current score */}
      {isRunning && (
        <div className="flex items-center gap-4 text-sm">
          {stages[currentStage] && (
            <span className="text-xs text-content-muted">
              Gate: score &ge; {stages[currentStage].gateThreshold.toFixed(2)}
            </span>
          )}
          {currentScore !== undefined && (
            <span className={clsx(
              'text-xs font-medium',
              currentScore >= (stages[currentStage]?.gateThreshold ?? 0.8)
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400',
            )}>
              Current: {currentScore.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Completed: verdict badge */}
      {isCompleted && result && (
        <div className="flex items-center gap-2">
          {result.completed && !result.aborted ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <CheckCircle className="w-3 h-3" />
              Rolled out
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-full">
              <XCircle className="w-3 h-3" />
              Rolled back
            </span>
          )}
          {result.stageResults && result.stageResults.length > 0 && (
            <span className="text-xs text-content-muted">
              Final score: {result.stageResults[result.stageResults.length - 1].score.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  )
})
