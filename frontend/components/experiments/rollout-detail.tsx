'use client'

import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { lazy, Suspense } from 'react'
import type { Experiment, RolloutConfig, RolloutProgress, RolloutResult } from '@/hooks/use-experiments'
import { StagePipeline } from './stage-pipeline'

const ResponsiveContainer = lazy(() =>
  import('recharts').then((m) => ({ default: m.ResponsiveContainer }))
)
const LineChart = lazy(() =>
  import('recharts').then((m) => ({ default: m.LineChart }))
)
const Line = lazy(() =>
  import('recharts').then((m) => ({ default: m.Line }))
)
const XAxis = lazy(() =>
  import('recharts').then((m) => ({ default: m.XAxis }))
)
const YAxis = lazy(() =>
  import('recharts').then((m) => ({ default: m.YAxis }))
)
const Tooltip = lazy(() =>
  import('recharts').then((m) => ({ default: m.Tooltip }))
)
const CartesianGrid = lazy(() =>
  import('recharts').then((m) => ({ default: m.CartesianGrid }))
)
const ReferenceLine = lazy(() =>
  import('recharts').then((m) => ({ default: m.ReferenceLine }))
)

interface RolloutDetailProps {
  experiment: Experiment
}

/**
 * Full Progressive Rollout detail layout with phase-specific UI.
 */
export function RolloutDetail({ experiment }: RolloutDetailProps) {
  const config = experiment.config as RolloutConfig
  const progress = experiment.progress as RolloutProgress | undefined
  const result = experiment.result as RolloutResult | undefined
  const isRunning = experiment.status === 'RUNNING'
  const isCompleted = experiment.status === 'COMPLETED'
  const isFailed = experiment.status === 'FAILED'

  const stages = config.stages ?? []
  const currentStage = progress?.currentStage ?? result?.finalStage ?? 0

  return (
    <div className="space-y-6">
      {/* COMPLETED: Verdict banner */}
      {isCompleted && result && (
        <div
          className={clsx(
            'rounded-xl p-6',
            result.completed && !result.aborted
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
              : 'bg-gradient-to-r from-rose-500 to-rose-600',
          )}
        >
          <div className="flex items-center gap-3">
            {result.completed && !result.aborted ? (
              <CheckCircle className="w-8 h-8 text-white" />
            ) : (
              <XCircle className="w-8 h-8 text-white" />
            )}
            <div>
              <h2 className="text-xl font-bold text-white">
                {result.completed && !result.aborted
                  ? 'Successfully Rolled Out'
                  : `Rolled Back at Stage ${result.finalStage + 1}`}
              </h2>
              {result.abortReason && (
                <p className="text-white/80 text-sm mt-1">
                  {result.abortReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAILED: Error card */}
      {isFailed && (
        <div className="rounded-xl border-2 border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
            <div>
              <h2 className="text-lg font-semibold text-rose-700 dark:text-rose-400">
                Rollout Failed
              </h2>
              <p className="text-sm text-rose-600 dark:text-rose-300 mt-1">
                Automatically rolled back to baseline.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rollout Overview */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary">Rollout Overview</h2>
          {isRunning && progress && (
            <span className="text-sm text-content-muted">
              {Math.round(progress.elapsedMs / 60000)}m elapsed
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-content-muted mb-1">Current Stage</p>
            <p className="text-xl font-bold text-content-primary">
              {currentStage + 1} / {stages.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-content-muted mb-1">Traffic</p>
            <p className="text-xl font-bold text-content-primary">
              {stages[currentStage]?.percentage ?? 0}%
            </p>
          </div>
          <div>
            <p className="text-xs text-content-muted mb-1">Current Score</p>
            <p className="text-xl font-bold text-content-primary">
              {progress?.currentScore !== undefined
                ? progress.currentScore.toFixed(3)
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-content-muted mb-1">Gate Threshold</p>
            <p className="text-xl font-bold text-content-primary">
              {stages[currentStage]?.gateThreshold?.toFixed(2) ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Stage Pipeline (detailed) */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-content-primary mb-4">
          Stage Pipeline
        </h2>
        <div className="flex items-center justify-center py-4">
          <StagePipeline
            stages={stages}
            currentStage={isCompleted ? stages.length : currentStage}
            size="md"
          />
        </div>
        <div className="flex justify-between text-xs text-content-muted mt-2 px-1">
          {stages.map((stage, i) => (
            <span key={i}>{stage.percentage}%</span>
          ))}
        </div>
      </div>

      {/* Score History Chart */}
      <StageScoreChart
        scores={progress?.scores ?? result?.stageResults?.map((s) => s.score) ?? []}
        stages={stages}
        gateThreshold={stages[0]?.gateThreshold ?? 0.8}
      />

      {/* Stage Detail Table */}
      {result?.stageResults && result.stageResults.length > 0 && (
        <div className="card p-5">
          <h2 className="text-lg font-semibold text-content-primary mb-4">
            Stage Results
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="text-right py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Traffic %
                  </th>
                  <th className="text-right py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Score
                  </th>
                  <th className="text-center py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Gate Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.stageResults.map((stage) => (
                  <tr
                    key={stage.stage}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-3 px-3 text-content-primary">
                      Stage {stage.stage + 1}
                    </td>
                    <td className="py-3 px-3 text-right text-content-secondary">
                      {stage.percentage}%
                    </td>
                    <td className="py-3 px-3 text-right text-content-primary font-medium">
                      {stage.score.toFixed(3)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {stage.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          Fail
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StageScoreChart({
  scores,
  stages,
  gateThreshold,
}: {
  scores: number[]
  stages: Array<{ percentage: number; gateThreshold: number }>
  gateThreshold: number
}) {
  if (scores.length === 0) return null

  const data = scores.map((score, i) => ({
    stage: `Stage ${i + 1} (${stages[i]?.percentage ?? 0}%)`,
    score,
  }))

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold text-content-primary mb-4">
        Score History
      </h2>
      <div className="h-64">
        <Suspense fallback={<div className="h-full bg-surface-raised rounded animate-pulse" />}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #333)" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <ReferenceLine
                y={gateThreshold}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                label={{ value: `Gate: ${gateThreshold}`, position: 'right', fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ fill: '#06b6d4', r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Suspense>
      </div>
    </div>
  )
}
