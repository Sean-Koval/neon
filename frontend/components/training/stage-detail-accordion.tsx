'use client'

import { clsx } from 'clsx'

interface StageInfo {
  stage: string
  status: string
  metrics: Record<string, number | string>
  durationMs?: number
}

interface StageDetailAccordionProps {
  stage: StageInfo
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const STAGE_METRIC_LABELS: Record<string, Record<string, string>> = {
  collecting: {
    feedbackCount: 'Feedback collected',
    timeRange: 'Time range',
    sources: 'Sources',
  },
  curating: {
    datasetSize: 'Dataset size',
    qualityScore: 'Quality score',
    sourceBreakdown: 'Source breakdown',
  },
  optimizing: {
    strategy: 'Strategy',
    iteration: 'Iteration',
    currentBest: 'Current best',
    changesAttempted: 'Changes attempted',
  },
  evaluating: {
    evalScore: 'Eval score',
    baselineScore: 'Baseline score',
    passRate: 'Pass rate',
    verdict: 'Verdict',
  },
  deploying: {
    target: 'Target',
    rollbackAvailable: 'Rollback available',
    deployedAt: 'Deployed at',
  },
  monitoring: {
    monitoringPeriod: 'Monitoring period',
    liveScore: 'Live score',
    regressionDetected: 'Regression detected',
    autoRollback: 'Auto-rollback',
  },
}

export function StageDetailAccordion({ stage }: StageDetailAccordionProps) {
  const labels = STAGE_METRIC_LABELS[stage.stage] || {}
  const entries = Object.entries(stage.metrics)

  if (!entries.length) {
    return (
      <div className="bg-surface-overlay/20 rounded-lg p-4">
        <p className="text-sm text-content-muted">No metrics available for this stage yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-overlay/20 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-content-primary capitalize">{stage.stage} Stage</h4>
        {stage.durationMs != null && stage.durationMs > 0 && (
          <span className="text-xs text-content-muted">Duration: {formatDuration(stage.durationMs)}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-y-2 text-sm">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <span className="text-content-muted">{labels[key] || key}</span>
            <span className={clsx(
              'text-content-primary',
              typeof value === 'string' && value.startsWith('+') && 'text-emerald-500',
              typeof value === 'string' && value.startsWith('-') && 'text-rose-500',
            )}>
              {String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
