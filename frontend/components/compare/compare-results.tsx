'use client'

import { clsx } from 'clsx'
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import type { CompareResponse, RegressionItem } from '@/lib/types'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import {
  ConfidenceIntervalBar,
  SignificanceIndicator,
  formatConfidenceInterval,
} from './confidence-interval'

interface CompareResultsProps {
  comparison: CompareResponse
}

/**
 * Display comparison results with sections for regressions, improvements, and unchanged.
 */
export function CompareResults({ comparison }: CompareResultsProps) {
  return (
    <div className="space-y-6">
      {/* Regressions Section */}
      {comparison.regressions.length > 0 && (
        <ResultSection
          title="Regressions"
          count={comparison.regressions.length}
          variant="danger"
          icon={<TrendingDown className="w-5 h-5" />}
          items={comparison.regressions}
          showDeltaSign={false}
        />
      )}

      {/* Improvements Section */}
      {comparison.improvements.length > 0 && (
        <ResultSection
          title="Improvements"
          count={comparison.improvements.length}
          variant="success"
          icon={<TrendingUp className="w-5 h-5" />}
          items={comparison.improvements}
          showDeltaSign={true}
        />
      )}

      {/* Unchanged Section */}
      {comparison.unchanged > 0 && (
        <UnchangedSection count={comparison.unchanged} />
      )}

      {/* Empty State */}
      {comparison.regressions.length === 0 &&
        comparison.improvements.length === 0 &&
        comparison.unchanged === 0 && (
          <div className="card p-8 text-center text-gray-500">
            No comparison data available
          </div>
        )}
    </div>
  )
}

interface ResultSectionProps {
  title: string
  count: number
  variant: 'success' | 'danger'
  icon: React.ReactNode
  items: RegressionItem[]
  showDeltaSign: boolean
}

function ResultSection({
  title,
  count,
  variant,
  icon,
  items,
  showDeltaSign,
}: ResultSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showStatistics, setShowStatistics] = useState(false)

  // Check if any items have statistical data
  const hasStatisticalData = items.some(
    (item) =>
      item.significance ||
      item.effectSize ||
      item.baselineConfidenceInterval ||
      item.candidateConfidenceInterval,
  )

  const variantStyles = {
    success: {
      header: 'bg-emerald-50 border-emerald-200',
      headerText: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-700',
      delta: 'text-emerald-600',
    },
    danger: {
      header: 'bg-rose-50 border-rose-200',
      headerText: 'text-rose-700',
      badge: 'bg-rose-100 text-rose-700',
      delta: 'text-rose-600',
    },
  }

  const styles = variantStyles[variant]

  return (
    <div className="card overflow-hidden">
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'w-full flex items-center justify-between p-4 border-b transition-colors',
          styles.header,
          'hover:opacity-90',
        )}
      >
        <div className="flex items-center gap-3">
          <span className={styles.headerText}>{icon}</span>
          <h3 className={clsx('text-lg font-semibold', styles.headerText)}>
            {title}
          </h3>
          <span
            className={clsx(
              'px-2.5 py-0.5 text-sm font-medium rounded-full',
              styles.badge,
            )}
          >
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Statistics Toggle */}
          {hasStatisticalData && isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowStatistics(!showStatistics)
              }}
              className={clsx(
                'px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors',
                showStatistics
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white/50 text-gray-600 hover:bg-white/80',
              )}
              title={showStatistics ? 'Hide statistics' : 'Show statistics'}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Stats</span>
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className={clsx('w-5 h-5', styles.headerText)} />
          ) : (
            <ChevronDown className={clsx('w-5 h-5', styles.headerText)} />
          )}
        </div>
      </button>

      {/* Section Content */}
      {isExpanded && (
        <div className="divide-y divide-gray-100">
          {items.map((item) => (
            <ResultRow
              key={`${item.case_name}-${item.scorer}`}
              item={item}
              deltaColor={styles.delta}
              showDeltaSign={showDeltaSign}
              showStatistics={showStatistics}
              isImprovement={variant === 'success'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ResultRowProps {
  item: RegressionItem
  deltaColor: string
  showDeltaSign: boolean
  showStatistics?: boolean
  isImprovement?: boolean
}

function ResultRow({
  item,
  deltaColor,
  showDeltaSign,
  showStatistics = false,
  isImprovement = false,
}: ResultRowProps) {
  const baselinePercent = (item.baseline_score * 100).toFixed(1)
  const candidatePercent = (item.candidate_score * 100).toFixed(1)
  const deltaPercent = (Math.abs(item.delta) * 100).toFixed(1)

  const hasConfidenceIntervals =
    item.baselineConfidenceInterval || item.candidateConfidenceInterval
  const hasSignificance = item.significance || item.effectSize

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Case Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 truncate">
              {item.case_name}
            </p>
            {/* Compact significance indicator */}
            {!showStatistics && hasSignificance && (
              <SignificanceIndicator
                significance={item.significance}
                effectSize={item.effectSize}
                isImprovement={isImprovement}
                compact
              />
            )}
          </div>
          <p className="text-sm text-gray-500">{item.scorer}</p>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          {/* Baseline Score */}
          <div className="text-center min-w-[60px]">
            <div className="text-xs text-gray-500 mb-0.5">
              Baseline
              <HelpTooltip content="The reference run to compare against. Scores from this run serve as the benchmark." />
            </div>
            <div className="font-medium text-gray-600">{baselinePercent}%</div>
            {showStatistics && item.baselineConfidenceInterval && (
              <div className="text-[10px] text-gray-400">
                {formatConfidenceInterval(item.baselineConfidenceInterval)}
              </div>
            )}
          </div>

          <ArrowRight className="w-4 h-4 text-gray-300" />

          {/* Candidate Score */}
          <div className="text-center min-w-[60px]">
            <div className="text-xs text-gray-500 mb-0.5">
              Candidate
              <HelpTooltip content="The new run being evaluated. Score changes are measured relative to the baseline." />
            </div>
            <div className="font-medium text-gray-900">{candidatePercent}%</div>
            {showStatistics && item.candidateConfidenceInterval && (
              <div className="text-[10px] text-gray-400">
                {formatConfidenceInterval(item.candidateConfidenceInterval)}
              </div>
            )}
          </div>

          {/* Delta */}
          <div
            className={clsx(
              'min-w-[70px] text-right font-semibold',
              deltaColor,
            )}
          >
            {showDeltaSign ? '+' : '-'}
            {deltaPercent}%
            {showStatistics && item.diffConfidenceInterval && (
              <div className="text-[10px] text-gray-400 font-normal">
                {formatConfidenceInterval(item.diffConfidenceInterval)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extended Statistics Row */}
      {showStatistics && (hasConfidenceIntervals || hasSignificance) && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
          {/* Confidence Interval Visualization */}
          {hasConfidenceIntervals && (
            <ConfidenceIntervalBar
              baselineMean={item.baseline_score}
              candidateMean={item.candidate_score}
              baselineCI={item.baselineConfidenceInterval}
              candidateCI={item.candidateConfidenceInterval}
              isImprovement={isImprovement}
              label="Score Distribution"
              asPercentage
              width={180}
            />
          )}

          {/* Significance Badges */}
          {hasSignificance && (
            <SignificanceIndicator
              significance={item.significance}
              effectSize={item.effectSize}
              isImprovement={isImprovement}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface UnchangedSectionProps {
  count: number
}

function UnchangedSection({ count }: UnchangedSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Minus className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-700">Unchanged</h3>
          <span className="px-2.5 py-0.5 text-sm font-medium rounded-full bg-gray-200 text-gray-700">
            {count}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="p-6 text-center text-gray-500">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-700">
            {count} case{count !== 1 ? 's' : ''} within threshold
          </p>
          <p className="text-sm mt-1">
            These cases showed no significant change between runs
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Loading skeleton for comparison results.
 */
export function CompareResultsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((section) => (
        <div key={section} className="card overflow-hidden animate-pulse">
          <div className="p-4 border-b border-gray-200 bg-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-gray-300 rounded" />
              <div className="h-6 w-32 bg-gray-300 rounded" />
              <div className="h-6 w-8 bg-gray-300 rounded-full" />
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((row) => (
              <div key={row} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-48 bg-gray-200 rounded" />
                    <div className="h-4 w-24 bg-gray-200 rounded" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="h-8 w-16 bg-gray-200 rounded" />
                    <div className="h-4 w-4 bg-gray-200 rounded" />
                    <div className="h-8 w-16 bg-gray-200 rounded" />
                    <div className="h-6 w-14 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
