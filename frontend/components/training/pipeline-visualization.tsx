'use client'

import { clsx } from 'clsx'
import {
  CheckCircle,
  Circle,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type StageStatus =
  | 'completed'
  | 'running'
  | 'pending'
  | 'failed'
  | 'awaiting_approval'

interface Stage {
  stage: string
  status: StageStatus
  metrics: Record<string, number | string>
  durationMs?: number
}

interface PipelineVisualizationProps {
  stages: Stage[]
  onStageClick?: (stage: string) => void
  activeStage?: string | null
}

const STAGE_LABELS: Record<string, string> = {
  collecting: 'Collect',
  curating: 'Curate',
  optimizing: 'Optimize',
  evaluating: 'Evaluate',
  deploying: 'Deploy',
  monitoring: 'Monitor',
}

const STAGE_HELP: Record<string, string> = {
  collecting: 'Feedback & traces',
  curating: 'Dataset quality',
  optimizing: 'Prompt variants',
  evaluating: 'Offline scoring',
  deploying: 'Release candidate',
  monitoring: 'Live guardrails',
}

const STAGE_ORDER = [
  'collecting',
  'curating',
  'optimizing',
  'evaluating',
  'deploying',
  'monitoring',
] as const

function getStageIcon(status: StageStatus): ReactNode {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4" />
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin" />
    case 'failed':
      return <XCircle className="w-4 h-4" />
    case 'awaiting_approval':
      return <ShieldCheck className="w-4 h-4" />
    default:
      return <Circle className="w-4 h-4" />
  }
}

function getStageStyles(status: StageStatus) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 border-emerald-500/60 text-emerald-600 dark:text-emerald-400'
    case 'running':
      return 'bg-primary-500/10 border-primary-500/70 text-primary-600 dark:text-primary-400'
    case 'failed':
      return 'bg-rose-500/10 border-rose-500/60 text-rose-600 dark:text-rose-400'
    case 'awaiting_approval':
      return 'bg-amber-500/10 border-amber-500/60 text-amber-600 dark:text-amber-400'
    default:
      return 'bg-surface-card border-border text-content-muted'
  }
}

function getConnectorStyle(status: StageStatus) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500'
    case 'running':
      return 'bg-primary-500 animate-pulse'
    case 'awaiting_approval':
      return 'bg-amber-500'
    case 'failed':
      return 'bg-rose-500'
    default:
      return 'bg-border'
  }
}

function getStatusLabel(status: StageStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'running':
      return 'Running'
    case 'awaiting_approval':
      return 'Needs Review'
    case 'failed':
      return 'Failed'
    default:
      return 'Pending'
  }
}

function getMetricSummary(stage: Stage): string {
  const m = stage.metrics
  switch (stage.stage) {
    case 'collecting':
      return m.feedbackCount ? `${m.feedbackCount}` : ''
    case 'curating':
      return m.datasetSize ? `${m.datasetSize}` : ''
    case 'optimizing':
      return m.iteration ? `${m.iteration}` : ''
    case 'evaluating':
      return m.evalScore ? `${m.evalScore}` : ''
    default:
      return ''
  }
}

export function PipelineVisualization({
  stages,
  onStageClick,
  activeStage,
}: PipelineVisualizationProps) {
  const stageMap = new Map(stages.map((stage) => [stage.stage, stage]))
  const orderedStages = STAGE_ORDER.map((key) => stageMap.get(key)).filter(
    Boolean,
  ) as Stage[]

  if (orderedStages.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised/50 p-4 text-sm text-content-muted">
        No pipeline stages available yet.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised/55 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-content-primary">
          Optimization Pipeline
        </p>
        <p className="text-xs text-content-muted">
          Click a stage to inspect metrics
        </p>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[920px] items-center">
          {orderedStages.map((stage, i) => {
            const clickable =
              stage.status === 'completed' ||
              stage.status === 'running' ||
              stage.status === 'awaiting_approval' ||
              stage.status === 'failed'
            return (
              <div key={stage.stage} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => clickable && onStageClick?.(stage.stage)}
                  className={clsx(
                    'h-24 w-full min-w-[140px] rounded-lg border-2 px-3 py-2 text-left transition-all',
                    getStageStyles(stage.status),
                    activeStage === stage.stage &&
                      'ring-2 ring-primary-500/40 ring-offset-1 ring-offset-surface-card',
                    clickable
                      ? 'cursor-pointer hover:opacity-90'
                      : 'cursor-default',
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    {getStageIcon(stage.status)}
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      {STAGE_LABELS[stage.stage] || stage.stage}
                    </span>
                  </div>
                  <p className="text-[11px] text-content-muted">
                    {STAGE_HELP[stage.stage] || 'Pipeline step'}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium">
                      {getStatusLabel(stage.status)}
                    </span>
                    {getMetricSummary(stage) && (
                      <span className="text-[11px] font-semibold text-content-primary">
                        {getMetricSummary(stage)}
                      </span>
                    )}
                  </div>
                </button>
                {i < orderedStages.length - 1 && (
                  <div
                    className={clsx(
                      'mx-2 h-0.5 min-w-[30px] flex-1',
                      getConnectorStyle(orderedStages[i + 1].status),
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
