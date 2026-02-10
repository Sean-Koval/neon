'use client'

import { clsx } from 'clsx'
import { Trophy } from 'lucide-react'
import React from 'react'
import type { ABTestConfig, ABTestProgress, ABTestResult, Experiment } from '@/hooks/use-experiments'

interface ABTestCardProps {
  experiment: Experiment
}

/**
 * A/B Test experiment card for the list view.
 * Shows progress bar, live scores, significance badge, and effect size delta for running experiments.
 * Shows winner badge and final improvement for completed experiments.
 */
export const ABTestCard = React.memo(function ABTestCard({ experiment }: ABTestCardProps) {
  const config = experiment.config as ABTestConfig
  const progress = experiment.progress as ABTestProgress | undefined
  const result = experiment.result as ABTestResult | undefined
  const isCompleted = experiment.status === 'COMPLETED'
  const isRunning = experiment.status === 'RUNNING'

  const samplesCollected = progress?.samplesCollected ?? 0
  const totalSamples = config.sampleSize ?? 100
  const progressPercent = totalSamples > 0 ? Math.min(100, Math.round((samplesCollected / totalSamples) * 100)) : 0

  const scoreA = result?.variantAScore ?? progress?.variantAScore
  const scoreB = result?.variantBScore ?? progress?.variantBScore
  const pValue = result?.pValue ?? progress?.pValue

  return (
    <div className="space-y-3">
      {/* Running: progress bar */}
      {isRunning && (
        <div>
          <div className="flex items-center justify-between text-xs text-content-muted mb-1">
            <span>Progress</span>
            <span>{samplesCollected}/{totalSamples} samples</span>
          </div>
          <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Score comparison */}
      {(scoreA !== undefined || scoreB !== undefined) && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-content-muted">A:</span>
          <span className="font-medium text-content-primary">
            {scoreA !== undefined ? scoreA.toFixed(2) : '—'}
          </span>
          <span className="text-content-muted">vs</span>
          <span className="text-content-muted">B:</span>
          <span className="font-medium text-content-primary">
            {scoreB !== undefined ? scoreB.toFixed(2) : '—'}
          </span>
        </div>
      )}

      {/* Significance + delta */}
      <div className="flex items-center gap-3">
        {pValue !== undefined && (
          <SignificanceBadge pValue={pValue} alpha={config.significanceLevel ?? 0.05} />
        )}
        {scoreA !== undefined && scoreB !== undefined && scoreA > 0 && (
          <DeltaBadge scoreA={scoreA} scoreB={scoreB} />
        )}
      </div>

      {/* Completed: winner badge */}
      {isCompleted && result && (
        <div className="flex items-center gap-2">
          {result.winner !== 'tie' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <Trophy className="w-3 h-3" />
              Variant {result.winner} wins
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-full">
              No significant difference
            </span>
          )}
          {result.improvement !== undefined && result.winner !== 'tie' && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              +{(Math.abs(result.improvement) * 100).toFixed(1)}% improvement
            </span>
          )}
        </div>
      )}
    </div>
  )
})

function SignificanceBadge({ pValue, alpha }: { pValue: number; alpha: number }) {
  const isSignificant = pValue < alpha
  const isMarginal = pValue < alpha * 2 && !isSignificant

  return (
    <span
      className={clsx(
        'text-xs font-medium px-2 py-0.5 rounded',
        isSignificant && 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
        isMarginal && 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
        !isSignificant && !isMarginal && 'text-content-muted bg-surface-raised',
      )}
    >
      p={pValue < 0.001 ? '<0.001' : pValue.toFixed(3)}
      {isSignificant && ' (sig)'}
      {isMarginal && ' (marginal)'}
    </span>
  )
}

function DeltaBadge({ scoreA, scoreB }: { scoreA: number; scoreB: number }) {
  const delta = ((scoreB - scoreA) / scoreA) * 100
  const sign = delta >= 0 ? '+' : ''

  return (
    <span
      className={clsx(
        'text-xs font-semibold',
        delta >= 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-rose-600 dark:text-rose-400',
      )}
    >
      {sign}{delta.toFixed(1)}%
    </span>
  )
}
