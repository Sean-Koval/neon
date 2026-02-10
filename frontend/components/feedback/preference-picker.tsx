'use client'

import { clsx } from 'clsx'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Equal,
  Loader2,
  SkipForward,
  ThumbsDown,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ComparisonPair, PreferenceChoice } from '@/lib/types'

// =============================================================================
// Response Card Component
// =============================================================================

interface ResponseCardProps {
  label: string
  content: string
  source?: string
  isSelected: boolean
  isDisabled: boolean
  onSelect: () => void
  variant: 'A' | 'B'
}

function ResponseCard({
  label,
  content,
  source,
  isSelected,
  isDisabled,
  onSelect,
  variant,
}: ResponseCardProps) {
  const variantColors = {
    A: {
      border: isSelected
        ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-500/25'
        : 'border-gray-200 dark:border-dark-700 hover:border-blue-300',
      badge: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
      check: 'bg-blue-500',
    },
    B: {
      border: isSelected
        ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-500/25'
        : 'border-gray-200 dark:border-dark-700 hover:border-purple-300',
      badge: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
      check: 'bg-purple-500',
    },
  }

  const colors = variantColors[variant]

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={clsx(
        'relative w-full text-left rounded-xl border-2 p-4 transition-all',
        colors.border,
        isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        !isDisabled && !isSelected && 'hover:shadow-md',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={clsx(
            'px-2.5 py-1 rounded-full text-xs font-semibold',
            colors.badge,
          )}
        >
          Response {label}
        </span>
        {source && (
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{source}</span>
        )}
      </div>

      {/* Content */}
      <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-gray-50 dark:bg-dark-900 p-3 rounded-lg overflow-auto max-h-96">
          {content}
        </pre>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div
          className={clsx(
            'absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center',
            colors.check,
          )}
        >
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
    </button>
  )
}

// =============================================================================
// Choice Button Component
// =============================================================================

interface ChoiceButtonProps {
  label: string
  description: string
  icon: React.ReactNode
  isSelected: boolean
  isDisabled: boolean
  onSelect: () => void
  variant: 'primary' | 'secondary' | 'danger'
}

function ChoiceButton({
  label,
  description,
  icon,
  isSelected,
  isDisabled,
  onSelect,
  variant,
}: ChoiceButtonProps) {
  const variantStyles = {
    primary: isSelected
      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400'
      : 'border-gray-200 dark:border-dark-700 text-gray-700 dark:text-gray-300 hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5',
    secondary: isSelected
      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-400'
      : 'border-gray-200 dark:border-dark-700 text-gray-700 dark:text-gray-300 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-500/5',
    danger: isSelected
      ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-400'
      : 'border-gray-200 dark:border-dark-700 text-gray-700 dark:text-gray-300 hover:border-rose-300 hover:bg-rose-50/50 dark:hover:bg-rose-500/5',
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all',
        variantStyles[variant],
        isDisabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="text-left">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs opacity-75">{description}</div>
      </div>
    </button>
  )
}

// =============================================================================
// Confidence Selector Component
// =============================================================================

interface ConfidenceSelectorProps {
  value: number
  onChange: (value: number) => void
  disabled: boolean
}

function ConfidenceSelector({
  value,
  onChange,
  disabled,
}: ConfidenceSelectorProps) {
  const levels = [
    { value: 1, label: 'Very unsure' },
    { value: 2, label: 'Somewhat unsure' },
    { value: 3, label: 'Neutral' },
    { value: 4, label: 'Somewhat confident' },
    { value: 5, label: 'Very confident' },
  ]

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Confidence Level
      </span>
      <div className="flex gap-2">
        {levels.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => onChange(level.value)}
            disabled={disabled}
            className={clsx(
              'flex-1 py-2 px-1 text-xs rounded-lg border transition-all',
              value === level.value
                ? 'bg-primary-50 border-primary-500 text-primary-700'
                : 'border-gray-200 dark:border-dark-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-dark-600',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            title={level.label}
          >
            {level.value}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        {levels.find((l) => l.value === value)?.label}
      </p>
    </div>
  )
}

// =============================================================================
// Main Preference Picker Component
// =============================================================================

export interface PreferencePickerProps {
  /** Current comparison to evaluate */
  comparison: ComparisonPair
  /** Callback when preference is submitted */
  onSubmit: (
    choice: PreferenceChoice,
    reason?: string,
    confidence?: number,
  ) => Promise<void>
  /** Callback to skip this comparison */
  onSkip?: () => void
  /** Callback to go to previous */
  onPrevious?: () => void
  /** Callback to go to next */
  onNext?: () => void
  /** Whether navigation is enabled */
  canGoPrevious?: boolean
  canGoNext?: boolean
  /** Current position in session */
  currentIndex?: number
  totalCount?: number
  /** Is submitting */
  isSubmitting?: boolean
  /** Time spent on this comparison (ms) */
  timeSpent?: number
}

export function PreferencePicker({
  comparison,
  onSubmit,
  onSkip,
  onPrevious,
  onNext,
  canGoPrevious = false,
  canGoNext = false,
  currentIndex,
  totalCount,
  isSubmitting = false,
  timeSpent = 0,
}: PreferencePickerProps) {
  const [selectedChoice, setSelectedChoice] = useState<PreferenceChoice | null>(
    null,
  )
  const [reason, setReason] = useState('')
  const [confidence, setConfidence] = useState(3)
  const [showReasonInput, setShowReasonInput] = useState(false)

  // Reset state when comparison changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally reset state when comparison ID changes
  useEffect(() => {
    setSelectedChoice(null)
    setReason('')
    setConfidence(3)
    setShowReasonInput(false)
  }, [comparison.id])

  const handleSubmit = useCallback(async () => {
    if (!selectedChoice) return
    await onSubmit(selectedChoice, reason || undefined, confidence)
  }, [selectedChoice, reason, confidence, onSubmit])

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${seconds}s`
  }

  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Compare Responses
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Which response is better for this prompt?
          </p>
        </div>
        <div className="flex items-center gap-4">
          {timeSpent > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>{formatTime(timeSpent)}</span>
            </div>
          )}
          {currentIndex !== undefined && totalCount !== undefined && (
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {currentIndex + 1} / {totalCount}
            </span>
          )}
        </div>
      </div>

      {/* Prompt */}
      <div className="card p-4 bg-gray-50 dark:bg-dark-900">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Prompt
        </span>
        <p className="mt-2 text-gray-900 dark:text-gray-100">{comparison.prompt}</p>
        {comparison.context && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
            Context: {comparison.context}
          </p>
        )}
      </div>

      {/* Response Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ResponseCard
          label="A"
          variant="A"
          content={comparison.responseA.content}
          source={comparison.responseA.source}
          isSelected={selectedChoice === 'A'}
          isDisabled={isSubmitting}
          onSelect={() => setSelectedChoice('A')}
        />
        <ResponseCard
          label="B"
          variant="B"
          content={comparison.responseB.content}
          source={comparison.responseB.source}
          isSelected={selectedChoice === 'B'}
          isDisabled={isSubmitting}
          onSelect={() => setSelectedChoice('B')}
        />
      </div>

      {/* Alternative Choices */}
      <div className="flex flex-wrap gap-3 justify-center">
        <ChoiceButton
          label="It's a tie"
          description="Both are equally good"
          icon={<Equal className="w-5 h-5" />}
          variant="secondary"
          isSelected={selectedChoice === 'tie'}
          isDisabled={isSubmitting}
          onSelect={() => setSelectedChoice('tie')}
        />
        <ChoiceButton
          label="Both are bad"
          description="Neither response is acceptable"
          icon={<ThumbsDown className="w-5 h-5" />}
          variant="danger"
          isSelected={selectedChoice === 'both_bad'}
          isDisabled={isSubmitting}
          onSelect={() => setSelectedChoice('both_bad')}
        />
      </div>

      {/* Optional Reason Input */}
      {selectedChoice && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Confidence */}
          <ConfidenceSelector
            value={confidence}
            onChange={setConfidence}
            disabled={isSubmitting}
          />

          {/* Reason toggle */}
          {!showReasonInput ? (
            <button
              type="button"
              onClick={() => setShowReasonInput(true)}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              + Add reason (optional)
            </button>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="preference-reason"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Reason (optional)
              </label>
              <textarea
                id="preference-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why did you choose this option?"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg text-sm dark:bg-dark-800 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                rows={2}
                disabled={isSubmitting}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-dark-700">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!canGoPrevious || isSubmitting}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext || isSubmitting}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-3">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 disabled:opacity-50"
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedChoice || isSubmitting}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Submit
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tags */}
      {comparison.tags && comparison.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {comparison.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300 text-xs rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Skeleton Loader
// =============================================================================

export function PreferencePickerSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-4 w-64 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
        <div className="h-6 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
      </div>

      <div className="h-24 bg-gray-200 dark:bg-dark-700 rounded-lg" />

      <div className="grid grid-cols-2 gap-4">
        <div className="h-64 bg-gray-200 dark:bg-dark-700 rounded-xl" />
        <div className="h-64 bg-gray-200 dark:bg-dark-700 rounded-xl" />
      </div>

      <div className="flex justify-center gap-3">
        <div className="h-12 w-32 bg-gray-200 dark:bg-dark-700 rounded-lg" />
        <div className="h-12 w-32 bg-gray-200 dark:bg-dark-700 rounded-lg" />
      </div>

      <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-dark-700">
        <div className="flex gap-2">
          <div className="h-10 w-10 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-10 w-10 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-10 w-24 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
      </div>
    </div>
  )
}
