'use client'

/**
 * Trace Diff Summary Component
 *
 * Shows overview statistics and score changes between two traces.
 */

import { clsx } from 'clsx'
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Hash,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import type { TraceDiffResult } from './types'

interface DiffSummaryProps {
  diff: TraceDiffResult
}

/**
 * Format duration in a human-readable way
 */
function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Format delta with sign
 */
function formatDelta(value: number, suffix = ''): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString()}${suffix}`
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: string }) {
  const isOk = status === 'ok'
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        isOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
      )}
    >
      {isOk ? (
        <CheckCircle className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {isOk ? 'Success' : 'Error'}
    </span>
  )
}

/**
 * Stat card for summary metrics
 */
function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  deltaColor,
}: {
  label: string
  value: string | number
  delta?: string
  icon?: typeof Clock
  deltaColor?: 'green' | 'red' | 'gray'
}) {
  return (
    <div className="bg-white rounded-lg border px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        {Icon && <Icon className="w-4 h-4" />}
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-gray-900">{value}</span>
        {delta && (
          <span
            className={clsx(
              'text-sm font-medium',
              deltaColor === 'green' && 'text-green-600',
              deltaColor === 'red' && 'text-red-600',
              deltaColor === 'gray' && 'text-gray-500',
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Change count badge
 */
function ChangeBadge({
  count,
  label,
  variant,
}: {
  count: number
  label: string
  variant: 'added' | 'removed' | 'modified' | 'unchanged'
}) {
  if (count === 0) return null

  const styles = {
    added: 'bg-green-100 text-green-700 border-green-200',
    removed: 'bg-red-100 text-red-700 border-red-200',
    modified: 'bg-amber-100 text-amber-700 border-amber-200',
    unchanged: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  const icons = {
    added: Plus,
    removed: Minus,
    modified: ArrowRight,
    unchanged: CheckCircle,
  }

  const Icon = icons[variant]

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium',
        styles[variant],
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{count}</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  )
}

export function DiffSummary({ diff }: DiffSummaryProps) {
  const { baseline, candidate, summary } = diff

  // Calculate delta colors
  const durationDeltaColor =
    summary.durationDelta > 100
      ? 'red'
      : summary.durationDelta < -100
        ? 'green'
        : 'gray'

  const tokenDeltaColor =
    summary.tokenDelta > 0 ? 'red' : summary.tokenDelta < 0 ? 'green' : 'gray'

  return (
    <div className="space-y-4">
      {/* Trace comparison header */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
          {/* Baseline */}
          <div className="p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Baseline
            </div>
            <div className="font-medium text-gray-900 truncate mb-1">
              {baseline.name}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <StatusBadge status={baseline.status} />
              <span className="text-gray-500">
                {formatDuration(baseline.duration_ms)}
              </span>
              <span className="text-gray-400 text-xs font-mono truncate">
                {baseline.traceId.slice(0, 8)}
              </span>
            </div>
          </div>

          {/* Candidate */}
          <div className="p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Candidate
            </div>
            <div className="font-medium text-gray-900 truncate mb-1">
              {candidate.name}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <StatusBadge status={candidate.status} />
              <span className="text-gray-500">
                {formatDuration(candidate.duration_ms)}
              </span>
              <span className="text-gray-400 text-xs font-mono truncate">
                {candidate.traceId.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Duration"
          icon={Clock}
          value={formatDuration(candidate.duration_ms)}
          delta={formatDelta(summary.durationDelta, 'ms')}
          deltaColor={durationDeltaColor}
        />
        <StatCard
          label="Tokens"
          icon={Hash}
          value={
            (
              summary.tokenDelta +
              diff.summary.added +
              diff.summary.removed
            ).toLocaleString() || '0'
          }
          delta={formatDelta(summary.tokenDelta)}
          deltaColor={tokenDeltaColor}
        />
      </div>

      {/* Change summary */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700 mr-2">
          Span Changes:
        </span>
        <ChangeBadge count={summary.added} label="added" variant="added" />
        <ChangeBadge
          count={summary.removed}
          label="removed"
          variant="removed"
        />
        <ChangeBadge
          count={summary.modified}
          label="modified"
          variant="modified"
        />
        <ChangeBadge
          count={summary.unchanged}
          label="unchanged"
          variant="unchanged"
        />
      </div>

      {/* Score changes */}
      {summary.scoreDiffs.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">
              Score Changes
            </h3>
          </div>
          <div className="divide-y">
            {summary.scoreDiffs.map((score) => (
              <div
                key={score.name}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="font-medium text-gray-900">{score.name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500 text-sm">
                    {score.baselineValue !== null
                      ? `${Math.round(score.baselineValue * 100)}%`
                      : '-'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900 font-medium">
                    {score.candidateValue !== null
                      ? `${Math.round(score.candidateValue * 100)}%`
                      : '-'}
                  </span>
                  <span
                    className={clsx(
                      'text-sm font-semibold min-w-[60px] text-right',
                      score.status === 'improved' && 'text-green-600',
                      score.status === 'regressed' && 'text-red-600',
                      score.status === 'unchanged' && 'text-gray-500',
                      score.status === 'added' && 'text-blue-600',
                      score.status === 'removed' && 'text-orange-600',
                    )}
                  >
                    {score.status === 'added' ? (
                      'New'
                    ) : score.status === 'removed' ? (
                      'Removed'
                    ) : (
                      <>
                        {score.delta > 0 ? (
                          <TrendingUp className="w-4 h-4 inline mr-1" />
                        ) : score.delta < 0 ? (
                          <TrendingDown className="w-4 h-4 inline mr-1" />
                        ) : null}
                        {formatDelta(Math.round(score.delta * 100), '%')}
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
