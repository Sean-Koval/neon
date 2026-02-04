'use client'

import { clsx } from 'clsx'
import { AlertCircle, CheckCircle2, HelpCircle, Info } from 'lucide-react'
import { useState } from 'react'
import type {
  ConfidenceInterval,
  EffectSize,
  StatisticalSignificance,
} from '@/lib/types'

/**
 * Props for the ConfidenceIntervalBar component.
 */
interface ConfidenceIntervalBarProps {
  /** Baseline mean value */
  baselineMean: number
  /** Candidate mean value */
  candidateMean: number
  /** Baseline confidence interval */
  baselineCI?: ConfidenceInterval
  /** Candidate confidence interval */
  candidateCI?: ConfidenceInterval
  /** Whether this is a positive change (improvement) */
  isImprovement?: boolean
  /** Label for the metric */
  label?: string
  /** Show as percentage (0-1 range) */
  asPercentage?: boolean
  /** Fixed width for the visualization */
  width?: number
}

/**
 * Visual representation of confidence intervals for comparing two values.
 */
export function ConfidenceIntervalBar({
  baselineMean,
  candidateMean,
  baselineCI,
  candidateCI,
  isImprovement = candidateMean > baselineMean,
  label,
  asPercentage = true,
  width = 200,
}: ConfidenceIntervalBarProps) {
  // Calculate the range for the visualization
  const allValues = [baselineMean, candidateMean]
  if (baselineCI) {
    allValues.push(baselineCI.lower, baselineCI.upper)
  }
  if (candidateCI) {
    allValues.push(candidateCI.lower, candidateCI.upper)
  }

  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const range = maxVal - minVal || 0.1 // Prevent division by zero
  const padding = range * 0.1 // 10% padding

  const scaleStart = minVal - padding
  const scaleEnd = maxVal + padding
  const scaleRange = scaleEnd - scaleStart

  const toPixels = (value: number) => {
    return ((value - scaleStart) / scaleRange) * width
  }

  const formatValue = (value: number) => {
    if (asPercentage) {
      return `${(value * 100).toFixed(1)}%`
    }
    return value.toFixed(3)
  }

  return (
    <div className="space-y-1">
      {label && (
        <div className="text-xs text-gray-500 font-medium">{label}</div>
      )}
      <div
        className="relative bg-gray-100 rounded h-8"
        style={{ width }}
      >
        {/* Baseline CI range */}
        {baselineCI && (
          <div
            className="absolute top-1 h-2.5 bg-gray-300 rounded-sm opacity-60"
            style={{
              left: toPixels(baselineCI.lower),
              width: toPixels(baselineCI.upper) - toPixels(baselineCI.lower),
            }}
            title={`Baseline CI: ${formatValue(baselineCI.lower)} - ${formatValue(baselineCI.upper)}`}
          />
        )}

        {/* Candidate CI range */}
        {candidateCI && (
          <div
            className={clsx(
              'absolute bottom-1 h-2.5 rounded-sm opacity-60',
              isImprovement ? 'bg-emerald-300' : 'bg-rose-300',
            )}
            style={{
              left: toPixels(candidateCI.lower),
              width: toPixels(candidateCI.upper) - toPixels(candidateCI.lower),
            }}
            title={`Candidate CI: ${formatValue(candidateCI.lower)} - ${formatValue(candidateCI.upper)}`}
          />
        )}

        {/* Baseline mean marker */}
        <div
          className="absolute top-1 w-0.5 h-2.5 bg-gray-600"
          style={{ left: toPixels(baselineMean) }}
          title={`Baseline: ${formatValue(baselineMean)}`}
        />

        {/* Candidate mean marker */}
        <div
          className={clsx(
            'absolute bottom-1 w-0.5 h-2.5',
            isImprovement ? 'bg-emerald-600' : 'bg-rose-600',
          )}
          style={{ left: toPixels(candidateMean) }}
          title={`Candidate: ${formatValue(candidateMean)}`}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{formatValue(scaleStart)}</span>
        <span>{formatValue(scaleEnd)}</span>
      </div>
    </div>
  )
}

/**
 * Props for StatisticalBadge component.
 */
interface StatisticalBadgeProps {
  significance: StatisticalSignificance
  showTooltip?: boolean
}

/**
 * Badge showing statistical significance status.
 */
export function StatisticalBadge({
  significance,
  showTooltip = true,
}: StatisticalBadgeProps) {
  const [showDetails, setShowDetails] = useState(false)

  const { pValue, isSignificant, alpha } = significance

  const formattedP =
    pValue < 0.001
      ? 'p < 0.001'
      : pValue < 0.01
        ? `p = ${pValue.toFixed(3)}`
        : `p = ${pValue.toFixed(2)}`

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        className={clsx(
          'px-2 py-0.5 text-xs font-medium rounded flex items-center gap-1 transition-colors',
          isSignificant
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        )}
        onClick={() => showTooltip && setShowDetails(!showDetails)}
        onMouseEnter={() => showTooltip && setShowDetails(true)}
        onMouseLeave={() => showTooltip && setShowDetails(false)}
      >
        {isSignificant ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <HelpCircle className="w-3 h-3" />
        )}
        <span>{formattedP}</span>
      </button>

      {/* Tooltip */}
      {showTooltip && showDetails && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10">
          <div className="bg-gray-900 text-white text-xs rounded px-3 py-2 shadow-lg whitespace-nowrap">
            <div className="font-medium mb-1">
              {isSignificant ? 'Statistically Significant' : 'Not Significant'}
            </div>
            <div className="text-gray-300 space-y-0.5">
              <div>P-value: {pValue.toFixed(4)}</div>
              <div>Alpha: {alpha}</div>
              {significance.testUsed && (
                <div>Test: {significance.testUsed}</div>
              )}
              {significance.testStatistic !== undefined && (
                <div>Statistic: {significance.testStatistic.toFixed(3)}</div>
              )}
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  )
}

/**
 * Props for EffectSizeBadge component.
 */
interface EffectSizeBadgeProps {
  effectSize: EffectSize
  showTooltip?: boolean
}

/**
 * Badge showing effect size magnitude.
 */
export function EffectSizeBadge({
  effectSize,
  showTooltip = true,
}: EffectSizeBadgeProps) {
  const [showDetails, setShowDetails] = useState(false)

  const magnitudeColors = {
    negligible: 'bg-gray-100 text-gray-600',
    small: 'bg-yellow-100 text-yellow-700',
    medium: 'bg-orange-100 text-orange-700',
    large: 'bg-red-100 text-red-700',
  }

  const magnitudeLabels = {
    negligible: 'Negligible',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        className={clsx(
          'px-2 py-0.5 text-xs font-medium rounded flex items-center gap-1 transition-colors',
          magnitudeColors[effectSize.magnitude],
        )}
        onClick={() => showTooltip && setShowDetails(!showDetails)}
        onMouseEnter={() => showTooltip && setShowDetails(true)}
        onMouseLeave={() => showTooltip && setShowDetails(false)}
      >
        <Info className="w-3 h-3" />
        <span>{magnitudeLabels[effectSize.magnitude]} Effect</span>
      </button>

      {/* Tooltip */}
      {showTooltip && showDetails && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10">
          <div className="bg-gray-900 text-white text-xs rounded px-3 py-2 shadow-lg whitespace-nowrap">
            <div className="font-medium mb-1">Effect Size Details</div>
            <div className="text-gray-300 space-y-0.5">
              <div>Cohen's d: {effectSize.cohensD.toFixed(3)}</div>
              {effectSize.cliffsDelta !== undefined && (
                <div>Cliff's δ: {effectSize.cliffsDelta.toFixed(3)}</div>
              )}
              <div className="pt-1 border-t border-gray-700 mt-1">
                <span className="text-gray-400">|d| interpretation:</span>
                <div className="text-[10px] text-gray-400">
                  {'< 0.2: negligible, < 0.5: small'}
                  <br />
                  {'< 0.8: medium, ≥ 0.8: large'}
                </div>
              </div>
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  )
}

/**
 * Props for SignificanceIndicator component.
 */
interface SignificanceIndicatorProps {
  /** Statistical significance data */
  significance?: StatisticalSignificance
  /** Effect size data */
  effectSize?: EffectSize
  /** Whether the change is an improvement */
  isImprovement?: boolean
  /** Compact mode (just icon) */
  compact?: boolean
}

/**
 * Combined indicator showing significance and effect size.
 */
export function SignificanceIndicator({
  significance,
  effectSize,
  isImprovement,
  compact = false,
}: SignificanceIndicatorProps) {
  if (!significance && !effectSize) {
    return null
  }

  if (compact) {
    // Just show a colored dot or icon
    const isSignificant = significance?.isSignificant
    const color = isSignificant
      ? isImprovement
        ? 'text-emerald-500'
        : 'text-rose-500'
      : 'text-gray-400'

    return (
      <span
        className={clsx('inline-flex', color)}
        title={
          isSignificant
            ? `Significant (p=${significance?.pValue.toFixed(3)})`
            : 'Not significant'
        }
      >
        {isSignificant ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <AlertCircle className="w-4 h-4" />
        )}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {significance && <StatisticalBadge significance={significance} />}
      {effectSize && <EffectSizeBadge effectSize={effectSize} />}
    </div>
  )
}

/**
 * Props for ConfidenceIntervalTooltip component.
 */
interface ConfidenceIntervalTooltipProps {
  ci: ConfidenceInterval
  label: string
  value: number
  asPercentage?: boolean
}

/**
 * Tooltip content showing confidence interval details.
 */
export function ConfidenceIntervalTooltip({
  ci,
  label,
  value,
  asPercentage = true,
}: ConfidenceIntervalTooltipProps) {
  const formatValue = (v: number) =>
    asPercentage ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)

  return (
    <div className="text-xs">
      <div className="font-medium">{label}</div>
      <div className="text-gray-300 mt-1">
        <div>Mean: {formatValue(value)}</div>
        <div>
          {(ci.level * 100).toFixed(0)}% CI: [{formatValue(ci.lower)},{' '}
          {formatValue(ci.upper)}]
        </div>
        <div>Margin: ±{formatValue((ci.upper - ci.lower) / 2)}</div>
      </div>
    </div>
  )
}

/**
 * Render confidence interval as inline text.
 */
export function formatConfidenceInterval(
  ci: ConfidenceInterval,
  asPercentage = true,
): string {
  const formatValue = (v: number) =>
    asPercentage ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)

  return `[${formatValue(ci.lower)}, ${formatValue(ci.upper)}]`
}
