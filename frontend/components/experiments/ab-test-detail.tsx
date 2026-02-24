'use client'

import { clsx } from 'clsx'
import { AlertTriangle, ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { ABTestConfig, ABTestProgress, ABTestResult, Experiment } from '@/hooks/use-experiments'

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

interface ABTestDetailProps {
  experiment: Experiment
}

/**
 * Full A/B Test detail layout with phase-specific UI.
 */
export function ABTestDetail({ experiment }: ABTestDetailProps) {
  const config = experiment.config as ABTestConfig
  const progress = experiment.progress as ABTestProgress | undefined
  const result = experiment.result as ABTestResult | undefined
  const isRunning = experiment.status === 'RUNNING'
  const isCompleted = experiment.status === 'COMPLETED'
  const isFailed = experiment.status === 'FAILED'

  return (
    <div className="space-y-6">
      {/* COMPLETED: Verdict banner */}
      {isCompleted && result && <VerdictBanner result={result} />}

      {/* FAILED: Error card */}
      {isFailed && <ErrorCard experiment={experiment} />}

      {/* RUNNING: Progress hero */}
      {isRunning && progress && (
        <ProgressHero
          samplesCollected={progress.samplesCollected}
          totalSamples={config.sampleSize}
          elapsedMs={progress.elapsedMs}
        />
      )}

      {/* Variant Comparison Cards */}
      <div>
        <h2 className="text-lg font-semibold text-content-primary mb-4">Variants</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VariantCard
            label="Variant A"
            sublabel={config.variantA.label || 'Baseline'}
            description={`${config.variantA.agentId}@${config.variantA.agentVersion}`}
            score={result?.variantAScore ?? progress?.variantAScore}
            isWinner={result?.winner === 'A'}
          />
          <VariantCard
            label="Variant B"
            sublabel={config.variantB.label || 'Candidate'}
            description={`${config.variantB.agentId}@${config.variantB.agentVersion}`}
            score={result?.variantBScore ?? progress?.variantBScore}
            isWinner={result?.winner === 'B'}
            delta={
              result?.variantAScore && result?.variantBScore
                ? ((result.variantBScore - result.variantAScore) / result.variantAScore) * 100
                : undefined
            }
          />
        </div>
      </div>

      {/* Score Curves Chart */}
      <ScoreCurvesChart
        scoreA={result?.variantAScore ?? progress?.variantAScore}
        scoreB={result?.variantBScore ?? progress?.variantBScore}
      />

      {/* Statistical Results */}
      <StatisticalResults
        pValue={result?.pValue ?? progress?.pValue}
        effectSize={result?.effectSize ?? progress?.effectSize}
        improvement={result?.improvement}
        confidence={result?.confidence}
        significanceLevel={config.significanceLevel}
      />

      {/* Per-Case Breakdown */}
      {result?.perCaseResults && result.perCaseResults.length > 0 && (
        <PerCaseBreakdown cases={result.perCaseResults} />
      )}
    </div>
  )
}

function VerdictBanner({ result }: { result: ABTestResult }) {
  const hasWinner = result.winner !== 'tie'

  return (
    <div
      className={clsx(
        'rounded-xl p-6',
        hasWinner
          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
          : 'bg-gradient-to-r from-amber-500 to-amber-600',
      )}
    >
      <div className="flex items-center gap-3">
        <Trophy className="w-8 h-8 text-white" />
        <div>
          <h2 className="text-xl font-bold text-white">
            {hasWinner
              ? `Variant ${result.winner} wins with ${(Math.abs(result.improvement) * 100).toFixed(1)}% improvement`
              : 'No significant difference detected'}
          </h2>
          <p className="text-white/80 text-sm mt-1">{result.recommendation}</p>
        </div>
      </div>
    </div>
  )
}

function ErrorCard({ experiment }: { experiment: Experiment }) {
  return (
    <div className="rounded-xl border-2 border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-rose-500" />
        <div>
          <h2 className="text-lg font-semibold text-rose-700 dark:text-rose-400">
            Experiment Failed
          </h2>
          <p className="text-sm text-rose-600 dark:text-rose-300 mt-1">
            Results are partial and may not be statistically valid.
          </p>
        </div>
      </div>
    </div>
  )
}

function ProgressHero({
  samplesCollected,
  totalSamples,
  elapsedMs,
}: {
  samplesCollected: number
  totalSamples: number
  elapsedMs: number
}) {
  const percent = totalSamples > 0 ? Math.round((samplesCollected / totalSamples) * 100) : 0
  const elapsedMin = Math.round(elapsedMs / 60000)

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-content-primary">Progress</h2>
        <span className="text-sm text-content-muted">
          {elapsedMin}m elapsed
        </span>
      </div>
      <div>
        <div className="flex items-center justify-between text-sm text-content-muted mb-2">
          <span>{percent}% complete</span>
          <span>{samplesCollected}/{totalSamples} samples</span>
        </div>
        <div className="h-3 bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function VariantCard({
  label,
  sublabel,
  description,
  score,
  isWinner,
  delta,
}: {
  label: string
  sublabel: string
  description: string
  score?: number
  isWinner?: boolean
  delta?: number
}) {
  return (
    <div
      className={clsx(
        'card p-5 space-y-3',
        isWinner && 'ring-2 ring-emerald-500',
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-content-primary">{label}</h3>
        <span className="badge-default text-xs">{sublabel}</span>
        {isWinner && (
          <span className="badge-green text-xs">Winner</span>
        )}
      </div>
      <p className="text-sm text-content-secondary">{description}</p>
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs text-content-muted">Score</p>
          <p className="text-xl font-bold text-content-primary">
            {score !== undefined ? score.toFixed(3) : '—'}
          </p>
        </div>
        {delta !== undefined && (
          <div>
            <p className="text-xs text-content-muted">Delta</p>
            <p
              className={clsx(
                'text-xl font-bold',
                delta >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)}%
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreCurvesChart({
  scoreA,
  scoreB,
}: {
  scoreA?: number
  scoreB?: number
}) {
  // TODO: needs real per-sample score history from backend
  // Using deterministic pseudo-noise instead of Math.random()
  const data = Array.from({ length: 10 }, (_, i) => {
    const base = scoreA ?? 0.85
    const cand = scoreB ?? 0.9
    const offsetA = ((((i * 7 + 3) % 11) - 5) / 5) * 0.02
    const offsetB = ((((i * 13 + 7) % 11) - 5) / 5) * 0.02
    return {
      sample: (i + 1) * 10,
      'Variant A': +(base + offsetA).toFixed(3),
      'Variant B': +(cand + offsetB).toFixed(3),
    }
  })

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold text-content-primary mb-4">
        Score Curves
      </h2>
      <div className="h-64">
        <Suspense fallback={<div className="h-full bg-surface-raised rounded animate-pulse" />}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #333)" />
              <XAxis
                dataKey="sample"
                tick={{ fontSize: 12 }}
                label={{ value: 'Samples', position: 'bottom', offset: -5, fontSize: 12 }}
              />
              <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="Variant A"
                stroke="#a855f7"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Variant B"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Suspense>
      </div>
    </div>
  )
}

function StatisticalResults({
  pValue,
  effectSize,
  improvement,
  confidence,
  significanceLevel,
}: {
  pValue?: number
  effectSize?: number
  improvement?: number
  confidence?: number
  significanceLevel?: number
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-content-primary mb-4">
        Statistical Results
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs text-content-muted mb-1">Effect Size</p>
          <p className="text-xl font-bold text-content-primary">
            {improvement !== undefined
              ? `${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%`
              : '—'}
          </p>
          {effectSize !== undefined && (
            <p className="text-xs text-content-muted mt-1">
              Cohen&apos;s d: {effectSize.toFixed(3)}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="text-xs text-content-muted mb-1">p-value</p>
          <p
            className={clsx(
              'text-xl font-bold',
              pValue !== undefined && pValue < (significanceLevel ?? 0.05)
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-content-primary',
            )}
          >
            {pValue !== undefined ? (pValue < 0.001 ? '<0.001' : pValue.toFixed(3)) : '—'}
          </p>
          {pValue !== undefined && (
            <p
              className={clsx(
                'text-xs mt-1',
                pValue < (significanceLevel ?? 0.05)
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-content-muted',
              )}
            >
              {pValue < (significanceLevel ?? 0.05) ? '(significant)' : '(not significant)'}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="text-xs text-content-muted mb-1">Confidence</p>
          <p className="text-xl font-bold text-content-primary">
            {confidence !== undefined
              ? `${(confidence * 100).toFixed(0)}%`
              : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

function PerCaseBreakdown({
  cases,
}: {
  cases: Array<{
    caseName: string
    scorer: string
    scoreA: number
    scoreB: number
    delta: number
    significant: boolean
  }>
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <h2 className="text-lg font-semibold text-content-primary">
          Per-Case Breakdown ({cases.length})
        </h2>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-content-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-content-muted" />
        )}
      </button>
      {isExpanded && (
        <div className="px-5 pb-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Test Case
                  </th>
                  <th className="text-left py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Scorer
                  </th>
                  <th className="text-right py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Score A
                  </th>
                  <th className="text-right py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Score B
                  </th>
                  <th className="text-right py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Delta
                  </th>
                  <th className="text-center py-3 px-3 text-content-muted font-medium text-xs uppercase tracking-wider">
                    Significant?
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={`${c.caseName}-${c.scorer}`}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-3 px-3 text-content-primary">{c.caseName}</td>
                    <td className="py-3 px-3 text-content-secondary">{c.scorer}</td>
                    <td className="py-3 px-3 text-right text-content-secondary">
                      {c.scoreA.toFixed(3)}
                    </td>
                    <td className="py-3 px-3 text-right text-content-secondary">
                      {c.scoreB.toFixed(3)}
                    </td>
                    <td
                      className={clsx(
                        'py-3 px-3 text-right font-medium',
                        c.delta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {c.delta >= 0 ? '+' : ''}
                      {(c.delta * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-center">
                      {c.significant ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Yes
                        </span>
                      ) : (
                        <span className="text-content-muted">&mdash;</span>
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
