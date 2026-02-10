'use client'

import { clsx } from 'clsx'
import { BarChart3, Clock, DollarSign, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { memo } from 'react'

interface PromptPerformanceProps {
  avgScore: number | null
  avgLatency: number | null
  costPerCall: number | null
  evalCount: number
}

function getScoreColor(score: number): string {
  if (score >= 0.85) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function getLatencyColor(ms: number): string {
  if (ms <= 500) return 'text-emerald-600 dark:text-emerald-400'
  if (ms <= 2000) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function PromptPerformanceComponent({ avgScore, avgLatency, costPerCall, evalCount }: PromptPerformanceProps) {
  // No eval data state
  if (avgScore === null && avgLatency === null && costPerCall === null) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-content-primary mb-3">Performance</h3>
        <div className="card p-6 text-center">
          <p className="text-sm text-content-muted">
            No evaluation data for this version
          </p>
          <p className="text-xs text-content-muted mt-1">
            Run an eval suite to see performance metrics.
          </p>
          <Link
            href="/eval-runs"
            className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-400 mt-3"
          >
            Run Eval <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-content-primary mb-3">Performance</h3>
      <div className="grid grid-cols-3 gap-4">
        {/* Avg Score */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-content-muted">Avg Score</span>
            <BarChart3 className="w-4 h-4 text-content-muted" />
          </div>
          <div className="mt-2">
            <span className={clsx('text-2xl font-bold', avgScore !== null ? getScoreColor(avgScore) : 'text-content-muted')}>
              {avgScore !== null ? `${(avgScore * 100).toFixed(0)}%` : '\u2014'}
            </span>
          </div>
          <p className="text-xs text-content-muted mt-1">
            from {evalCount} eval{evalCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Avg Latency */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-content-muted">Avg Latency</span>
            <Clock className="w-4 h-4 text-content-muted" />
          </div>
          <div className="mt-2">
            <span className={clsx('text-2xl font-bold', avgLatency !== null ? getLatencyColor(avgLatency) : 'text-content-muted')}>
              {avgLatency !== null ? `${Math.round(avgLatency)}ms` : '\u2014'}
            </span>
          </div>
          <p className="text-xs text-content-muted mt-1">p50</p>
        </div>

        {/* Cost/Call */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-content-muted">Cost / Call</span>
            <DollarSign className="w-4 h-4 text-content-muted" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-content-primary">
              {costPerCall !== null ? `$${costPerCall.toFixed(2)}` : '\u2014'}
            </span>
          </div>
          <p className="text-xs text-content-muted mt-1">avg</p>
        </div>
      </div>
    </div>
  )
}

export const PromptPerformance = memo(PromptPerformanceComponent)
