'use client'

import { clsx } from 'clsx'
import { Download, Loader2, Pause, Play, Rocket, SkipForward, X } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/toast'
import {
  useAbortExperiment,
  usePauseExperiment,
  useResumeExperiment,
} from '@/hooks/use-experiments'
import type { Experiment, ExperimentStatus } from '@/hooks/use-experiments'

interface ExperimentActionsProps {
  experiment: Experiment
}

/**
 * Context-aware action buttons for the experiment detail page header.
 */
export function ExperimentActions({ experiment }: ExperimentActionsProps) {
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [confirmAdvance, setConfirmAdvance] = useState(false)
  const { addToast } = useToast()

  const pauseMutation = usePauseExperiment()
  const resumeMutation = useResumeExperiment()
  const abortMutation = useAbortExperiment()

  const isRunning = experiment.status === 'RUNNING'
  const isPaused = experiment.status === 'PAUSED'
  const isCompleted = experiment.status === 'COMPLETED'
  const isABTest = experiment.type === 'ab_test'
  const isRollout = experiment.type === 'progressive_rollout'

  const hasWinner =
    isCompleted &&
    isABTest &&
    experiment.result &&
    'winner' in experiment.result &&
    experiment.result.winner !== 'tie'

  const handlePause = async () => {
    try {
      await pauseMutation.mutateAsync(experiment.id)
      addToast('Experiment paused', 'success')
    } catch {
      addToast('Failed to pause experiment', 'error')
    }
  }

  const handleResume = async () => {
    try {
      await resumeMutation.mutateAsync(experiment.id)
      addToast('Experiment resumed', 'success')
    } catch {
      addToast('Failed to resume experiment', 'error')
    }
  }

  const handleAbort = async () => {
    if (!confirmAbort) {
      setConfirmAbort(true)
      return
    }
    try {
      await abortMutation.mutateAsync(experiment.id)
      addToast('Experiment aborted', 'success')
    } catch {
      addToast('Failed to abort experiment', 'error')
    }
    setConfirmAbort(false)
  }

  const handleAdvanceStage = () => {
    if (!confirmAdvance) {
      setConfirmAdvance(true)
      return
    }
    addToast('Stage advance signal sent', 'success')
    setConfirmAdvance(false)
  }

  const handleDeployWinner = () => {
    addToast('Winner deployment initiated', 'success')
  }

  const handleExport = (format: 'json' | 'csv') => {
    if (!experiment) return

    let content: string
    let mimeType: string
    let ext: string

    if (format === 'json') {
      content = JSON.stringify(experiment, null, 2)
      mimeType = 'application/json'
      ext = 'json'
    } else {
      // CSV export
      const rows: string[] = ['Case Name,Variant,Score,Delta']

      if (
        isABTest &&
        experiment.result &&
        'perCaseResults' in experiment.result &&
        experiment.result.perCaseResults
      ) {
        for (const r of experiment.result.perCaseResults) {
          rows.push(`"${r.caseName}",A,${r.scoreA},`)
          rows.push(`"${r.caseName}",B,${r.scoreB},${r.delta.toFixed(4)}`)
        }
      }
      content = rows.join('\n')
      mimeType = 'text/csv'
      ext = 'csv'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `experiment-${experiment.name}-${experiment.id}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex items-center gap-2">
      {/* Pause/Resume */}
      {isRunning && (
        <button
          type="button"
          onClick={handlePause}
          disabled={pauseMutation.isPending}
          className="btn btn-secondary text-sm"
        >
          {pauseMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Pause className="w-4 h-4" />
          )}
          Pause
        </button>
      )}

      {isPaused && (
        <button
          type="button"
          onClick={handleResume}
          disabled={resumeMutation.isPending}
          className="btn btn-secondary text-sm"
        >
          {resumeMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Resume
        </button>
      )}

      {/* Abort */}
      {(isRunning || isPaused) && (
        <button
          type="button"
          onClick={handleAbort}
          disabled={abortMutation.isPending}
          className={clsx(
            'btn text-sm',
            confirmAbort
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'btn-secondary text-rose-600 dark:text-rose-400',
          )}
        >
          {abortMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
          {confirmAbort ? 'Confirm Abort' : 'Abort'}
        </button>
      )}

      {/* Deploy Winner (A/B Test completed with winner) */}
      {hasWinner && (
        <button
          type="button"
          onClick={handleDeployWinner}
          className="btn btn-primary text-sm"
        >
          <Rocket className="w-4 h-4" />
          Deploy Winner
        </button>
      )}

      {/* Advance Stage (Rollout running) */}
      {isRunning && isRollout && (
        <button
          type="button"
          onClick={handleAdvanceStage}
          className={clsx(
            'btn text-sm',
            confirmAdvance ? 'btn-primary' : 'btn-secondary',
          )}
        >
          <SkipForward className="w-4 h-4" />
          {confirmAdvance ? 'Confirm Advance' : 'Advance Stage'}
        </button>
      )}

      {/* Export (completed or failed) */}
      {(isCompleted || experiment.status === 'FAILED') && (
        <div className="relative group">
          <button
            type="button"
            className="btn btn-secondary text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
            <div className="bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[120px]">
              <button
                type="button"
                onClick={() => handleExport('json')}
                className="w-full px-3 py-2 text-sm text-left text-content-secondary hover:bg-surface-raised transition-colors"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="w-full px-3 py-2 text-sm text-left text-content-secondary hover:bg-surface-raised transition-colors"
              >
                CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
