'use client'

import { clsx } from 'clsx'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Minus,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import type { CompareResponse } from '@/lib/types'

interface ComparisonHeaderProps {
  comparison: CompareResponse
}

/**
 * Large, visually dominant header banner showing pass/fail state.
 *
 * - Pass: Green banner with "No Regressions Detected"
 * - Fail: Red banner with "REGRESSION DETECTED"
 * - Shows overall score delta prominently
 * - Displays baseline vs candidate scores
 */
export function ComparisonHeader({ comparison }: ComparisonHeaderProps) {
  const passed = comparison.passed
  const delta = comparison.overall_delta
  const absoluteDeltaPercent = (Math.abs(delta) * 100).toFixed(1)

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl p-8',
        passed
          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
          : 'bg-gradient-to-r from-rose-500 to-rose-600',
      )}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Status Message */}
        <div className="flex items-center gap-4">
          <div
            className={clsx(
              'flex items-center justify-center w-16 h-16 rounded-full',
              passed ? 'bg-white/20' : 'bg-white/20',
            )}
          >
            {passed ? (
              <ShieldCheck className="w-10 h-10 text-white" />
            ) : (
              <ShieldAlert className="w-10 h-10 text-white" />
            )}
          </div>
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white">
              {passed ? 'No Regressions Detected' : 'REGRESSION DETECTED'}
            </h2>
            <p className="text-white/80 mt-1">
              {passed
                ? 'Your candidate run passed all regression checks'
                : `${comparison.regressions.length} case${comparison.regressions.length !== 1 ? 's' : ''} dropped below the threshold`}
            </p>
          </div>
        </div>

        {/* Score Delta */}
        <div className="flex items-center gap-6 lg:gap-8">
          {/* Overall Delta */}
          <div className="text-center">
            <div className="text-sm font-medium text-white/70 mb-1">
              Overall Delta
            </div>
            <div className="flex items-center justify-center gap-2">
              {delta > 0 ? (
                <ArrowUp className="w-6 h-6 text-white" />
              ) : delta < 0 ? (
                <ArrowDown className="w-6 h-6 text-white" />
              ) : (
                <Minus className="w-6 h-6 text-white" />
              )}
              <span className="text-3xl lg:text-4xl font-bold text-white">
                {delta >= 0 ? '+' : '-'}
                {absoluteDeltaPercent}%
              </span>
            </div>
          </div>

          {/* Version Comparison */}
          <div className="hidden sm:flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
            <div className="text-center">
              <div className="text-xs font-medium text-white/60">Baseline</div>
              <div className="text-lg font-bold text-white">
                {comparison.baseline.agent_version ||
                  comparison.baseline.id.slice(0, 8)}
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-white/60" />
            <div className="text-center">
              <div className="text-xs font-medium text-white/60">Candidate</div>
              <div className="text-lg font-bold text-white">
                {comparison.candidate.agent_version ||
                  comparison.candidate.id.slice(0, 8)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="relative mt-6 pt-6 border-t border-white/20">
        <div className="grid grid-cols-3 gap-4 lg:gap-8">
          <SummaryStat
            label="Regressions"
            count={comparison.regressions.length}
            variant={comparison.regressions.length > 0 ? 'danger' : 'neutral'}
          />
          <SummaryStat
            label="Improvements"
            count={comparison.improvements.length}
            variant={comparison.improvements.length > 0 ? 'success' : 'neutral'}
          />
          <SummaryStat
            label="Unchanged"
            count={comparison.unchanged}
            variant="neutral"
          />
        </div>
      </div>
    </div>
  )
}

interface SummaryStatProps {
  label: string
  count: number
  variant: 'success' | 'danger' | 'neutral'
}

function SummaryStat({ label, count, variant }: SummaryStatProps) {
  return (
    <div className="text-center">
      <div
        className={clsx(
          'text-3xl lg:text-4xl font-bold',
          variant === 'danger' && count > 0
            ? 'text-white'
            : variant === 'success' && count > 0
              ? 'text-white'
              : 'text-white/70',
        )}
      >
        {count}
      </div>
      <div className="text-sm text-white/70">{label}</div>
    </div>
  )
}

/**
 * Loading skeleton for the comparison header.
 */
export function ComparisonHeaderSkeleton() {
  return (
    <div className="rounded-2xl bg-gray-200 dark:bg-dark-700 p-8 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-300 dark:bg-dark-600" />
        <div className="space-y-2">
          <div className="h-8 w-64 bg-gray-300 dark:bg-dark-600 rounded" />
          <div className="h-4 w-48 bg-gray-300 dark:bg-dark-600 rounded" />
        </div>
      </div>
      <div className="mt-6 pt-6 border-t border-gray-300 dark:border-dark-600">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="text-center space-y-2">
              <div className="h-10 w-12 bg-gray-300 dark:bg-dark-600 rounded mx-auto" />
              <div className="h-4 w-20 bg-gray-300 dark:bg-dark-600 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Error state for when comparison fails.
 */
export function ComparisonHeaderError({ message }: { message?: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-8">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white/20">
          <AlertTriangle className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Comparison Failed</h2>
          <p className="text-white/80 mt-1">
            {message ||
              'Unable to compare the selected runs. Please try again.'}
          </p>
        </div>
      </div>
    </div>
  )
}
